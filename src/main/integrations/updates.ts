import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import https from 'node:https';
import type { ReleaseInfo } from '../../shared/types';

const owner = '2002312bugisme'; const repository = 'Electron_WorkBench';
const allowedHosts = new Set(['api.github.com', 'github.com', 'objects.githubusercontent.com', 'release-assets.githubusercontent.com', 'github-releases.githubusercontent.com']);
interface ReleaseAsset { name: string; browser_download_url: string; size: number }
interface GitHubRelease { tag_name: string; name: string | null; body: string | null; published_at: string | null; html_url: string; assets: ReleaseAsset[] }

const versionParts = (value: string) => value.replace(/^v/, '').split('.').map((part) => Number(part.replace(/\D.*/, '')) || 0);
export function newerVersion(candidate: string, current: string) {
  const next = versionParts(candidate); const installed = versionParts(current); const length = Math.max(next.length, installed.length);
  for (let index = 0; index < length; index += 1) { const change = next[index] || 0; const existing = installed[index] || 0; if (change !== existing) return change > existing; }
  return false;
}

function request(url: URL, redirects = 0): Promise<Buffer> {
  if (url.protocol !== 'https:' || !allowedHosts.has(url.hostname)) return Promise.reject(new Error('更新地址不受信任。'));
  return new Promise((resolve, reject) => {
    const client = https.get(url, { headers: { 'User-Agent': 'Zzz-Workstation-Updater', Accept: 'application/vnd.github+json' }, timeout: 30_000, rejectUnauthorized: true }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 4) { response.resume(); void request(new URL(response.headers.location, url), redirects + 1).then(resolve, reject); return; }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`更新服务返回 ${response.statusCode || '未知'}。`)); return; }
      const chunks: Buffer[] = []; let size = 0; response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 800 * 1024 * 1024) client.destroy(new Error('更新文件过大。')); else chunks.push(chunk); }); response.on('end', () => resolve(Buffer.concat(chunks))); response.on('error', reject);
    }); client.on('timeout', () => client.destroy(new Error('更新检查超时。'))); client.on('error', reject);
  });
}

export class UpdateService {
  private cached: GitHubRelease | null = null;
  async check(currentVersion: string): Promise<ReleaseInfo> {
    try {
      const response = await request(new URL(`https://api.github.com/repos/${owner}/${repository}/releases/latest`)); const release = JSON.parse(response.toString('utf8')) as GitHubRelease; this.cached = release;
      const setup = release.assets.find((asset) => /setup\.exe$/i.test(asset.name));
      return { available: Boolean(setup && newerVersion(release.tag_name, currentVersion)), currentVersion, version: release.tag_name.replace(/^v/, ''), name: release.name, notes: release.body, publishedAt: release.published_at, assetName: setup?.name || null };
    } catch (error: any) { return { available: false, currentVersion, version: null, name: null, notes: null, publishedAt: null, assetName: null, error: error?.message || '无法检查更新。' }; }
  }
  async download(currentVersion: string, destination: string): Promise<string> {
    const info = await this.check(currentVersion); if (!info.available || !this.cached) throw new Error(info.error || '当前没有可用更新。');
    const setup = this.cached.assets.find((asset) => asset.name === info.assetName); const checksum = this.cached.assets.find((asset) => /\.sha256$/i.test(asset.name)); if (!setup || !checksum) throw new Error('该版本缺少安装包或 SHA-256 校验文件。');
    const [installer, hashFile] = await Promise.all([request(new URL(setup.browser_download_url)), request(new URL(checksum.browser_download_url))]); const expected = hashFile.toString('utf8').match(/[a-f0-9]{64}/i)?.[0]?.toLowerCase(); const actual = createHash('sha256').update(installer).digest('hex'); if (!expected || expected !== actual) throw new Error('更新安装包校验失败，已取消保存。');
    await writeFile(destination, installer, { mode: 0o600 }); return destination;
  }
}
