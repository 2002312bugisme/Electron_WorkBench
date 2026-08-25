import { describe, expect, it } from 'vitest';
import { validateOssConnection } from './oss';
import { parseFeed } from './rss';
import { newerVersion } from './updates';

describe('RSS parsing', () => {
  it('keeps feed entries but removes untrusted markup', () => {
    const feed = parseFeed(`<?xml version="1.0"?><rss><channel><title>示例订阅</title><item><guid>one</guid><title><![CDATA[<b>安全标题</b>]]></title><link>https://example.com/a</link><description><![CDATA[<script>x</script>摘要]]></description><pubDate>Mon, 01 Jan 2024 00:00:00 GMT</pubDate></item></channel></rss>`);
    expect(feed.title).toBe('示例订阅'); expect(feed.entries).toHaveLength(1); expect(feed.entries[0]).toMatchObject({ guid: 'one', title: '安全标题', link: 'https://example.com/a', summary: 'x 摘要' });
  });
  it('supports Atom href links', () => {
    const feed = parseFeed('<feed><title>Atom</title><entry><id>a</id><title>条目</title><link href="https://example.com/a"/><updated>2025-01-02T03:04:05Z</updated></entry></feed>');
    expect(feed.entries[0].link).toBe('https://example.com/a');
  });
});

describe('OSS boundary', () => {
  const base = { region: 'cn-hangzhou', endpoint: 'oss-cn-hangzhou.aliyuncs.com', bucket: 'zzz-workstation-backups', accessKeyId: 'id', accessKeySecret: 'secret', prefix: 'zzz-workstation/' };
  it('accepts only the dedicated OSS prefix', () => expect(() => validateOssConnection(base)).not.toThrow());
  it('rejects arbitrary hosts and prefixes', () => { expect(() => validateOssConnection({ ...base, endpoint: 'example.com' })).toThrow(); expect(() => validateOssConnection({ ...base, prefix: 'everything/' })).toThrow(); });
});

describe('release version comparison', () => {
  it('only accepts a later semantic version', () => { expect(newerVersion('v1.2.0', '1.1.9')).toBe(true); expect(newerVersion('v1.10.0', '1.9.9')).toBe(true); expect(newerVersion('v1.1.2', '1.1.2')).toBe(false); expect(newerVersion('v1.0.9', '1.1.0')).toBe(false); });
});
