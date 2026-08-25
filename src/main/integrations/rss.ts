import { createHash } from 'node:crypto';
import https from 'node:https';

export interface ParsedFeedEntry { guid: string; title: string; link: string; summary: string; publishedAt: string | null }
export interface ParsedFeed { title: string; entries: ParsedFeedEntry[] }

const decode = (value = '') => value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/&(?:amp|#38);/g, '&').replace(/&(?:lt|#60);/g, '<').replace(/&(?:gt|#62);/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/\s+/g, ' ').trim();
const text = (xml: string, tag: string) => decode(xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'i'))?.[1] || '');
const attribute = (xml: string, tag: string, name: string) => xml.match(new RegExp(`<${tag}\\b[^>]*\\b${name}=["']([^"']+)["'][^>]*>`, 'i'))?.[1] || '';
const date = (value: string) => { const parsed = Date.parse(value); return Number.isNaN(parsed) ? null : new Date(parsed).toISOString(); };

export function parseFeed(xml: string): ParsedFeed {
  const feedTitle = text(xml, 'title') || '未命名订阅';
  const blocks = [...xml.matchAll(/<(item|entry)(?:\s[^>]*)?>([\s\S]*?)<\/\1>/gi)].map((match) => match[2]);
  return {
    title: feedTitle,
    entries: blocks.map((block) => {
      const link = text(block, 'link') || attribute(block, 'link', 'href'); const title = text(block, 'title') || '未命名条目';
      const guid = text(block, 'guid') || text(block, 'id') || link || createHash('sha256').update(`${title}:${text(block, 'pubDate') || text(block, 'updated')}`).digest('hex');
      return { guid, title, link, summary: text(block, 'description') || text(block, 'summary') || text(block, 'content'), publishedAt: date(text(block, 'pubDate') || text(block, 'published') || text(block, 'updated')) };
    }).filter((entry) => Boolean(entry.guid)),
  };
}

function getText(url: URL, redirects = 0): Promise<string> {
  if (url.protocol !== 'https:') return Promise.reject(new Error('RSS 订阅地址必须使用 HTTPS。'));
  return new Promise((resolve, reject) => {
    const request = https.get(url, { headers: { 'User-Agent': 'Zzz-Workstation/1.2', Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' }, timeout: 15_000 }, (response) => {
      if (response.statusCode && response.statusCode >= 300 && response.statusCode < 400 && response.headers.location && redirects < 3) { response.resume(); void getText(new URL(response.headers.location, url), redirects + 1).then(resolve, reject); return; }
      if (response.statusCode !== 200) { response.resume(); reject(new Error(`订阅服务器返回 ${response.statusCode || '未知'}。`)); return; }
      const chunks: Buffer[] = []; let size = 0;
      response.on('data', (chunk: Buffer) => { size += chunk.length; if (size > 3 * 1024 * 1024) request.destroy(new Error('订阅内容超过 3 MB。')); else chunks.push(chunk); });
      response.on('end', () => resolve(Buffer.concat(chunks).toString('utf8'))); response.on('error', reject);
    });
    request.on('timeout', () => request.destroy(new Error('订阅请求超时。'))); request.on('error', reject);
  });
}

export async function fetchFeed(raw: string) { return parseFeed(await getText(new URL(raw))); }
