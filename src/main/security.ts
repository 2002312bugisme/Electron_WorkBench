import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

interface KeyEnvelope { version: 1; salt: string; iv: string; tag: string; encryptedKey: string }

const envelopeName = 'key-envelope.json';
const derive = (password: string, salt: Buffer) => scryptSync(password, salt, 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });

export function hasEnvelope(root: string) { return existsSync(path.join(root, envelopeName)); }

export function createDatabaseKey(root: string, password: string): string {
  if (password.length < 10) throw new Error('主密码至少需要 10 个字符。');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const dbKey = randomBytes(32);
  const cipher = createCipheriv('aes-256-gcm', derive(password, salt), iv);
  const encryptedKey = Buffer.concat([cipher.update(dbKey), cipher.final()]);
  const envelope: KeyEnvelope = { version: 1, salt: salt.toString('base64'), iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), encryptedKey: encryptedKey.toString('base64') };
  writeFileSync(path.join(root, envelopeName), JSON.stringify(envelope), { encoding: 'utf8', mode: 0o600 });
  return dbKey.toString('hex');
}

export function unwrapDatabaseKey(root: string, password: string): string {
  try {
    const envelope = JSON.parse(readFileSync(path.join(root, envelopeName), 'utf8')) as KeyEnvelope;
    if (envelope.version !== 1) throw new Error('不支持的密钥文件版本。');
    const decipher = createDecipheriv('aes-256-gcm', derive(password, Buffer.from(envelope.salt, 'base64')), Buffer.from(envelope.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(envelope.encryptedKey, 'base64')), decipher.final()]).toString('hex');
  } catch {
    throw new Error('主密码错误，或本地密钥文件已损坏。');
  }
}
