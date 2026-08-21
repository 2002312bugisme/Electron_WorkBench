import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDatabaseKey, hasEnvelope, unwrapDatabaseKey } from './security';

const roots: string[] = [];
const tempRoot = async () => { const root = await mkdtemp(path.join(os.tmpdir(), 'zzz-workstation-test-')); roots.push(root); return root; };
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('local master password envelope', () => {
  it('creates and unlocks a database key without storing the password', async () => {
    const root = await tempRoot(); const key = createDatabaseKey(root, 'test-password-123');
    expect(hasEnvelope(root)).toBe(true); expect(unwrapDatabaseKey(root, 'test-password-123')).toBe(key);
  });
  it('rejects an incorrect master password', async () => {
    const root = await tempRoot(); createDatabaseKey(root, 'test-password-123');
    expect(() => unwrapDatabaseKey(root, 'wrong-password-123')).toThrow('主密码错误');
  });
});
