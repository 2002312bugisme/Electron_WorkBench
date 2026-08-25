import { app, clipboard, dialog, shell } from 'electron';
import { cp, mkdir, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { WorkbenchDatabase } from './database';
import { FileIndexer } from './services/file-indexer';
import { CredentialVault } from './integrations/credential-vault';
import { fetchFeed } from './integrations/rss';
import { sendSmtpMail } from './integrations/smtp';
import { OssClient } from './integrations/oss';
import { UpdateService } from './integrations/updates';
import type { MailSettings, MailSettingsInput, RemoteBackupConfig, RemoteBackupInput, RemoteBackupItem } from '../shared/types';

interface ArchiveWriter { on(event: string, listener: (error: Error) => void): ArchiveWriter; pipe(target: NodeJS.WritableStream): ArchiveWriter; file(source: string, options: { name: string }): ArchiveWriter; directory(source: string, destination: string): ArchiveWriter; finalize(): Promise<void> }
type ArchiveFactory = (format: 'zip', options: { zlib: { level: number } }) => ArchiveWriter;
type Unzipper = { Open: { file(source: string): Promise<{ files: Array<{ path: string }>; extract(options: { path: string }): Promise<void> }> } };
const runtimeRequire = createRequire(__filename);

export class WorkbenchServices {
  readonly root = path.join(app.getPath('appData'), 'Zzz Workstation');
  readonly attachments = path.join(this.root, 'attachments');
  readonly database = new WorkbenchDatabase(this.root);
  readonly files = new FileIndexer(this.database);
  readonly vault = new CredentialVault(this.root);
  readonly updates = new UpdateService();
  async addAttachment(noteId: string): Promise<string | null> {
    const result = await dialog.showOpenDialog({ title: '选择笔记附件', properties: ['openFile'] });
    const source = result.filePaths[0]; if (result.canceled || !source) return null;
    await mkdir(this.attachments, { recursive: true });
    const storedName = `${randomUUID()}${path.extname(source)}`;
    await cp(source, path.join(this.attachments, storedName));
    const attachmentId = this.database.addAttachment(noteId, path.basename(source), storedName, null);
    return `attachment://${attachmentId}`;
  }
  attachmentPath(attachmentId: string): string | null {
    const item = this.database.attachment(attachmentId);
    if (!item) return null;
    const candidate = path.resolve(this.attachments, item.stored_name);
    return candidate.startsWith(path.resolve(this.attachments) + path.sep) && existsSync(candidate) ? candidate : null;
  }
  async openAttachment(attachmentId: string) {
    const file = this.attachmentPath(attachmentId);
    if (!file) throw new Error('附件不存在或已被移除。');
    const result = await shell.openPath(file);
    if (result) throw new Error(result);
  }
  async removeNote(noteId: string) {
    const attachments = this.database.deleteNote(noteId);
    await Promise.all(attachments.map((attachment: { stored_name: string }) => unlink(path.join(this.attachments, attachment.stored_name)).catch((): undefined => undefined)));
  }
  async addFileRoot() {
    const result = await dialog.showOpenDialog({ title: '选择需要索引的文件夹', properties: ['openDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    const root = this.database.addFileRoot(path.resolve(result.filePaths[0]), path.basename(result.filePaths[0]));
    if (root) await this.files.scan(root.id, root.path);
    return root;
  }
  async rescanFiles(): Promise<void> { await this.files.rescanAll(); }
  async openIndexedFile(fileId: string) {
    const file = await this.files.safeOpen(fileId);
    const result = await shell.openPath(file);
    if (result) throw new Error(result);
  }
  async refreshRss(feedId?: string) {
    const feeds = feedId ? [this.database.getRssFeed(feedId)].filter(Boolean) : this.database.listRssFeeds().filter((feed) => feed.enabled);
    for (const feed of feeds) {
      try { const parsed = await fetchFeed(feed!.url); this.database.upsertRssEntries(feed!.id, parsed.entries); this.database.markRssFeedFetched(feed!.id, parsed.title, null); }
      catch (error: any) { this.database.markRssFeedFetched(feed!.id, feed!.title, String(error?.message || '订阅刷新失败。').slice(0, 300)); if (feedId) throw error; }
    }
  }
  private localDay(value = new Date()) { return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`; }
  private weekKey(value = new Date()) { const date = new Date(value); const weekday = date.getDay() || 7; date.setHours(0, 0, 0, 0); date.setDate(date.getDate() - weekday + 1); return this.localDay(date); }
  private storedMail() { return this.database.setting<Pick<MailSettings, 'provider' | 'sender' | 'scheduleDay' | 'scheduleHour' | 'lastSentWeek'>>('mailSettings', { provider: null, sender: null, scheduleDay: 1, scheduleHour: 9, lastSentWeek: null }); }
  async mailSettings(): Promise<MailSettings> { const stored = this.storedMail(); return { ...stored, configured: Boolean(stored.provider && stored.sender && await this.vault.get('mailAuthorizationCode')) }; }
  async saveMailSettings(input: MailSettingsInput): Promise<MailSettings> {
    if (!/^\S+@\S+\.\S+$/.test(input.sender)) throw new Error('请输入有效的发件邮箱。'); if (!input.authorizationCode.trim()) throw new Error('请输入邮箱 SMTP 授权码。');
    const previous = this.storedMail(); const stored = { provider: input.provider, sender: input.sender.trim(), scheduleDay: Math.max(1, Math.min(7, Math.round(input.scheduleDay ?? previous.scheduleDay ?? 1))), scheduleHour: Math.max(0, Math.min(23, Math.round(input.scheduleHour ?? previous.scheduleHour ?? 9))), lastSentWeek: previous.lastSentWeek || null };
    await this.vault.set({ mailAuthorizationCode: input.authorizationCode.trim() }); this.database.saveSetting('mailSettings', stored); return this.mailSettings();
  }
  async clearMailSettings() { await this.vault.clear(['mailAuthorizationCode']); this.database.saveSetting('mailSettings', { provider: null, sender: null, scheduleDay: 1, scheduleHour: 9, lastSentWeek: null }); }
  async sendWeeklyMail(markSent = false) {
    const settings = await this.mailSettings(); const secret = await this.vault.get('mailAuthorizationCode'); if (!settings.configured || !settings.provider || !settings.sender || !secret) throw new Error('请先配置 QQ 或网易 SMTP 授权信息。');
    const report = this.database.weeklyReport(); await sendSmtpMail({ provider: settings.provider, sender: settings.sender, authorizationCode: secret, subject: 'Zzz 的工作站 · 本周工作周报', markdown: report.markdown });
    if (markSent) this.database.saveSetting('mailSettings', { ...this.storedMail(), lastSentWeek: this.weekKey() });
  }
  async maybeSendWeeklyMail() {
    const settings = await this.mailSettings(); if (!settings.configured || settings.lastSentWeek === this.weekKey()) return false;
    const now = new Date(); const weekday = now.getDay() || 7; if (weekday < settings.scheduleDay || (weekday === settings.scheduleDay && now.getHours() < settings.scheduleHour)) return false;
    await this.sendWeeklyMail(true); return true;
  }
  private storedRemoteBackup(): RemoteBackupConfig { return this.database.setting<RemoteBackupConfig>('remoteBackup', { configured: false, region: null, endpoint: null, bucket: null, prefix: 'zzz-workstation/', lastAutoBackupDay: null }); }
  async remoteBackupConfig(): Promise<RemoteBackupConfig> { const stored = this.storedRemoteBackup(); return { ...stored, configured: Boolean(stored.endpoint && stored.bucket && await this.vault.get('ossAccessKeyId') && await this.vault.get('ossAccessKeySecret')) }; }
  async saveRemoteBackupConfig(input: RemoteBackupInput): Promise<RemoteBackupConfig> {
    const endpoint = input.endpoint.trim().replace(/^https:\/\//i, '').replace(/\/$/, '').toLowerCase(); const value = { configured: true, region: input.region.trim(), endpoint, bucket: input.bucket.trim(), prefix: 'zzz-workstation/', lastAutoBackupDay: this.storedRemoteBackup().lastAutoBackupDay || null };
    const client = new OssClient({ region: value.region, endpoint, bucket: value.bucket, prefix: value.prefix, accessKeyId: input.accessKeyId.trim(), accessKeySecret: input.accessKeySecret.trim() }); await client.list();
    await this.vault.set({ ossAccessKeyId: input.accessKeyId.trim(), ossAccessKeySecret: input.accessKeySecret.trim() }); this.database.saveSetting('remoteBackup', value); return this.remoteBackupConfig();
  }
  async clearRemoteBackupConfig() { await this.vault.clear(['ossAccessKeyId', 'ossAccessKeySecret']); this.database.saveSetting('remoteBackup', { configured: false, region: null, endpoint: null, bucket: null, prefix: 'zzz-workstation/', lastAutoBackupDay: null }); }
  private async ossClient() {
    const config = await this.remoteBackupConfig(); const accessKeyId = await this.vault.get('ossAccessKeyId'); const accessKeySecret = await this.vault.get('ossAccessKeySecret');
    if (!config.configured || !config.endpoint || !config.bucket || !accessKeyId || !accessKeySecret) throw new Error('请先在设置中配置 OSS 专用 RAM 用户。');
    if (!config.region) throw new Error('请先配置 OSS 地域 ID。'); return new OssClient({ region: config.region, endpoint: config.endpoint, bucket: config.bucket, prefix: config.prefix, accessKeyId, accessKeySecret });
  }
  async testRemoteBackup() { await (await this.ossClient()).list(); }
  private async createBackupArchive(destination: string) {
    this.database.checkpoint(); const createArchive = runtimeRequire('archiver') as ArchiveFactory;
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(destination); const archive = createArchive('zip', { zlib: { level: 9 } }); output.on('close', resolve); archive.on('error', reject); archive.pipe(output);
      archive.file(path.join(this.root, 'data.db'), { name: 'data.db' }); ['data.db-wal', 'data.db-shm', 'key-envelope.json'].forEach((name) => { const file = path.join(this.root, name); if (existsSync(file)) archive.file(file, { name }); }); if (existsSync(this.attachments)) archive.directory(this.attachments, 'attachments'); archive.finalize();
    });
  }
  async backupRemote(automatic = false): Promise<RemoteBackupItem> {
    const client = await this.ossClient(); const stamp = new Date().toISOString().replace(/[:.]/g, '-'); const name = `${automatic ? 'auto' : 'manual'}-${stamp}.zip`; const temp = path.join(app.getPath('temp'), `zzz-workbench-${randomUUID()}.zip`);
    try { await this.createBackupArchive(temp); const archive = await readFile(temp); await client.put(`${client.prefix}${name}`, archive, createHash('sha256').update(archive).digest('hex')); const item = { key: `${client.prefix}${name}`, name, size: archive.length, modifiedAt: new Date().toISOString(), automatic };
      if (automatic) { const config = this.storedRemoteBackup(); this.database.saveSetting('remoteBackup', { ...config, lastAutoBackupDay: this.localDay() }); const old = (await this.listRemoteBackups()).filter((backup) => backup.automatic).slice(30); await Promise.all(old.map((backup) => client.remove(backup.key))); }
      return item;
    } finally { await rm(temp, { force: true }); }
  }
  async maybeAutoRemoteBackup() { const config = await this.remoteBackupConfig(); if (!config.configured || config.lastAutoBackupDay === this.localDay()) return false; await this.backupRemote(true); return true; }
  async listRemoteBackups(search = ''): Promise<RemoteBackupItem[]> { const client = await this.ossClient(); const value = search.trim().toLowerCase(); return (await client.list()).filter((item) => /^(auto|manual)-.+\.zip$/i.test(path.posix.basename(item.key))).map((item) => { const name = path.posix.basename(item.key); return { key: item.key, name, size: item.size, modifiedAt: item.modifiedAt, automatic: name.startsWith('auto-') }; }).filter((item) => !value || item.name.toLowerCase().includes(value)).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt)); }
  async restoreRemoteBackup(key: string) { const client = await this.ossClient(); const archive = await client.get(key); const temporary = path.join(app.getPath('temp'), `zzz-workbench-remote-restore-${randomUUID()}.zip`); try { await writeFile(temporary, archive, { mode: 0o600 }); await this.restoreBackupFromPath(temporary); } finally { await rm(temporary, { force: true }); } }
  async exportBackup(): Promise<string | null> {
    const suggestion = `zzz-workbench-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    const result = await dialog.showSaveDialog({ title: '导出加密备份', defaultPath: suggestion, filters: [{ name: '压缩备份', extensions: ['zip'] }] });
    if (result.canceled || !result.filePath) return null;
    await this.createBackupArchive(result.filePath);
    return result.filePath;
  }
  async restoreBackup(): Promise<void> {
    const result = await dialog.showOpenDialog({ title: '选择工作站备份', properties: ['openFile'], filters: [{ name: '压缩备份', extensions: ['zip'] }] });
    if (result.canceled || !result.filePaths[0]) return;
    await this.restoreBackupFromPath(result.filePaths[0]);
  }
  private async restoreBackupFromPath(archivePath: string): Promise<void> {
    const unzipper = runtimeRequire('unzipper') as Unzipper; const directory = await unzipper.Open.file(archivePath);
    if (!directory.files.some((f: any) => f.path === 'data.db') || !directory.files.some((f: any) => f.path === 'key-envelope.json')) throw new Error('该文件不是有效的工作站备份。');
    if (directory.files.some((f: any) => f.path.includes('..') || path.isAbsolute(f.path))) throw new Error('备份包含不安全的文件路径。');
    const staging = path.join(app.getPath('temp'), `zzz-workbench-restore-${randomUUID()}`);
    await directory.extract({ path: staging });
    this.database.close();
    await rm(this.root, { recursive: true, force: true }); await mkdir(this.root, { recursive: true });
    await cp(staging, this.root, { recursive: true }); await rm(staging, { recursive: true, force: true });
    app.relaunch(); app.quit();
  }
  async downloadUpdate() {
    const info = await this.updates.check(app.getVersion()); if (!info.available) throw new Error(info.error || '当前已是最新版本。');
    const result = await dialog.showSaveDialog({ title: '下载工作站更新', defaultPath: info.assetName || `Zzz-Workstation-${info.version}-Setup.exe`, filters: [{ name: 'Windows 安装程序', extensions: ['exe'] }] }); if (result.canceled || !result.filePath) return null;
    const file = await this.updates.download(app.getVersion(), result.filePath); const outcome = await shell.openPath(file); if (outcome) throw new Error(outcome); return file;
  }
  saveReport(markdown: string) { return dialog.showSaveDialog({ title: '保存周报', defaultPath: `工作周报-${new Date().toISOString().slice(0, 10)}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] }).then(async (result) => { if (!result.canceled && result.filePath) { await writeFile(result.filePath, markdown, 'utf8'); return result.filePath; } return null; }); }
  copy(text: string) { clipboard.writeText(text); }
}
