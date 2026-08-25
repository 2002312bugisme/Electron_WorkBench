import { createHash, createHmac } from 'node:crypto';
import type { IncomingHttpHeaders } from 'node:http';
import https from 'node:https';

export interface OssConnection { region: string; endpoint: string; bucket: string; accessKeyId: string; accessKeySecret: string; prefix: string }
export interface OssObject { key: string; size: number; modifiedAt: string }

const text = (xml: string, tag: string) => xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'i'))?.[1]?.trim() || '';
const normalizePrefix = (value: string) => `${value.replace(/^\/+|\/+$/g, '')}/`;

export function validateOssConnection(value: OssConnection) {
  if (!/^[a-z]{2,}-[a-z0-9-]+$/i.test(value.region)) throw new Error('请输入 OSS 地域 ID，例如 cn-hangzhou。');
  if (!/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/i.test(value.bucket)) throw new Error('OSS Bucket 名称格式不正确。');
  if (!/^[a-z0-9.-]+\.aliyuncs\.com$/i.test(value.endpoint)) throw new Error('仅允许阿里云 OSS 的 HTTPS Endpoint。');
  if (!value.accessKeyId.trim() || !value.accessKeySecret.trim()) throw new Error('请填写专用 RAM 用户的 AccessKey。');
  if (normalizePrefix(value.prefix) !== 'zzz-workstation/') throw new Error('远程备份只能使用 zzz-workstation/ 前缀。');
}

export class OssClient {
  private readonly region: string; private readonly endpoint: string; private readonly bucket: string; private readonly accessKeyId: string; private readonly accessKeySecret: string; readonly prefix: string;
  constructor(config: OssConnection) { validateOssConnection(config); this.region = config.region; this.endpoint = config.endpoint.toLowerCase(); this.bucket = config.bucket; this.accessKeyId = config.accessKeyId; this.accessKeySecret = config.accessKeySecret; this.prefix = normalizePrefix(config.prefix); }
  private sign(method: string, key: string, query: string, headers: Record<string, string>) {
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, ''); const signDate = timestamp.slice(0, 8); headers['x-oss-content-sha256'] = 'UNSIGNED-PAYLOAD'; headers['x-oss-date'] = timestamp;
    const signedHeaders = Object.entries(headers).filter(([name]) => name.toLowerCase() === 'content-type' || name.toLowerCase() === 'content-md5' || name.toLowerCase().startsWith('x-oss-')).map(([name, value]) => [name.toLowerCase(), value.trim()] as const).sort(([a], [b]) => a.localeCompare(b));
    const canonicalHeaders = signedHeaders.map(([name, value]) => `${name}:${value}\n`).join(''); const canonicalUri = `/${this.bucket}/${key.split('/').map(encodeURIComponent).join('/')}`; const canonicalQuery = query.split('&').filter(Boolean).map((part) => { const [name, value = ''] = part.split('=', 2); return `${encodeURIComponent(decodeURIComponent(name))}=${encodeURIComponent(decodeURIComponent(value))}`; }).sort().join('&');
    const canonicalRequest = `${method}\n${canonicalUri}\n${canonicalQuery}\n${canonicalHeaders}\n\nUNSIGNED-PAYLOAD`; const scope = `${signDate}/${this.region}/oss/aliyun_v4_request`; const stringToSign = `OSS4-HMAC-SHA256\n${timestamp}\n${scope}\n${createHash('sha256').update(canonicalRequest).digest('hex')}`;
    const hmac = (keyValue: Buffer | string, value: string) => createHmac('sha256', keyValue).update(value).digest(); const dateKey = hmac(`aliyun_v4${this.accessKeySecret}`, signDate); const regionKey = hmac(dateKey, this.region); const serviceKey = hmac(regionKey, 'oss'); const signingKey = hmac(serviceKey, 'aliyun_v4_request'); const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');
    headers.Authorization = `OSS4-HMAC-SHA256 Credential=${this.accessKeyId}/${scope}, AdditionalHeaders=, Signature=${signature}`;
  }
  private request(method: string, key = '', query = '', body?: Buffer, extraHeaders: Record<string, string> = {}): Promise<{ body: Buffer; headers: IncomingHttpHeaders }> {
    const headers: Record<string, string> = { ...extraHeaders }; this.sign(method, key, query, headers);
    const encodedPath = `/${key.split('/').map(encodeURIComponent).join('/')}${query ? `?${query}` : ''}`;
    return new Promise((resolve, reject) => {
      const request = https.request({ protocol: 'https:', hostname: `${this.bucket}.${this.endpoint}`, method, path: encodedPath, headers, timeout: 20_000, rejectUnauthorized: true }, (response) => {
        const chunks: Buffer[] = []; response.on('data', (chunk: Buffer) => chunks.push(chunk)); response.on('end', () => {
          const result = Buffer.concat(chunks); if (!response.statusCode || response.statusCode < 200 || response.statusCode >= 300) { reject(new Error(`OSS 请求失败（${response.statusCode || '未知'}）：${text(result.toString('utf8'), 'Message') || '请检查 RAM 权限与 Bucket 设置。'}`)); return; }
          resolve({ body: result, headers: response.headers });
        }); response.on('error', reject);
      }); request.on('timeout', () => request.destroy(new Error('OSS 请求超时。'))); request.on('error', reject); if (body) request.write(body); request.end();
    });
  }
  async list(): Promise<OssObject[]> {
    const query = `prefix=${encodeURIComponent(this.prefix)}`; const { body } = await this.request('GET', '', query); const xml = body.toString('utf8');
    return [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/gi)].map((match) => ({ key: text(match[1], 'Key'), size: Number(text(match[1], 'Size') || 0), modifiedAt: text(match[1], 'LastModified') })).filter((item) => item.key.startsWith(this.prefix));
  }
  async put(key: string, value: Buffer, sha256: string) { if (!key.startsWith(this.prefix)) throw new Error('拒绝写入工作站备份目录以外的位置。'); await this.request('PUT', key, '', value, { 'Content-Type': 'application/zip', 'Content-Length': String(value.length), 'x-oss-meta-sha256': sha256 }); }
  async get(key: string) { if (!key.startsWith(this.prefix)) throw new Error('拒绝读取工作站备份目录以外的位置。'); return (await this.request('GET', key)).body; }
  async remove(key: string) { if (!key.startsWith(this.prefix)) throw new Error('拒绝删除工作站备份目录以外的位置。'); await this.request('DELETE', key); }
}
