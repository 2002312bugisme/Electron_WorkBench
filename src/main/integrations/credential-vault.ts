import { safeStorage } from 'electron';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

type SecretName = 'mailAuthorizationCode' | 'ossAccessKeyId' | 'ossAccessKeySecret';
type Vault = Partial<Record<SecretName, string>>;

/** Keeps third-party credentials out of SQLCipher records, renderer memory, logs and Git. */
export class CredentialVault {
  private readonly file: string;
  constructor(root: string) { this.file = path.join(root, 'credentials.vault'); }

  private assertAvailable() {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Windows 凭据保护不可用，无法安全保存第三方授权信息。');
  }
  private async read(): Promise<Vault> {
    this.assertAvailable();
    try {
      const encrypted = await readFile(this.file);
      return JSON.parse(safeStorage.decryptString(encrypted)) as Vault;
    } catch (error: any) {
      if (error?.code === 'ENOENT') return {};
      throw new Error('无法读取受保护的第三方授权信息，请重新配置。');
    }
  }
  private async write(value: Vault) {
    this.assertAvailable(); await mkdir(path.dirname(this.file), { recursive: true });
    await writeFile(this.file, safeStorage.encryptString(JSON.stringify(value)), { mode: 0o600 });
  }
  async get(name: SecretName) { return (await this.read())[name] || null; }
  async set(values: Partial<Record<SecretName, string>>) { const current = await this.read(); await this.write({ ...current, ...values }); }
  async clear(names: SecretName[]) { const current = await this.read(); names.forEach((name) => delete current[name]); await this.write(current); }
}
