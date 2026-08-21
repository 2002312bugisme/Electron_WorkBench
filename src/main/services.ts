import { app, clipboard, dialog } from 'electron';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { WorkbenchDatabase } from './database';

interface ArchiveWriter { on(event: string, listener: (error: Error) => void): ArchiveWriter; pipe(target: NodeJS.WritableStream): ArchiveWriter; file(source: string, options: { name: string }): ArchiveWriter; directory(source: string, destination: string): ArchiveWriter; finalize(): Promise<void> }
type ArchiveFactory = (format: 'zip', options: { zlib: { level: number } }) => ArchiveWriter;
type Unzipper = { Open: { file(source: string): Promise<{ files: Array<{ path: string }>; extract(options: { path: string }): Promise<void> }> } };
const runtimeRequire = createRequire(__filename);

export class WorkbenchServices {
  readonly root = path.join(app.getPath('appData'), 'Zzz Workstation');
  readonly attachments = path.join(this.root, 'attachments');
  readonly database = new WorkbenchDatabase(this.root);
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
  async exportBackup(): Promise<string | null> {
    this.database.checkpoint();
    const suggestion = `zzz-workbench-backup-${new Date().toISOString().slice(0, 10)}.zip`;
    const result = await dialog.showSaveDialog({ title: '导出加密备份', defaultPath: suggestion, filters: [{ name: '压缩备份', extensions: ['zip'] }] });
    if (result.canceled || !result.filePath) return null;
    const createArchive = runtimeRequire('archiver') as ArchiveFactory;
    await new Promise<void>((resolve, reject) => {
      const output = createWriteStream(result.filePath);
      const archive = createArchive('zip', { zlib: { level: 9 } });
      output.on('close', resolve); archive.on('error', reject); archive.pipe(output);
      archive.file(path.join(this.root, 'data.db'), { name: 'data.db' });
      ['data.db-wal', 'data.db-shm', 'key-envelope.json'].forEach((name) => { const file = path.join(this.root, name); if (existsSync(file)) archive.file(file, { name }); });
      if (existsSync(this.attachments)) archive.directory(this.attachments, 'attachments');
      archive.finalize();
    });
    return result.filePath;
  }
  async restoreBackup(): Promise<void> {
    const result = await dialog.showOpenDialog({ title: '选择工作站备份', properties: ['openFile'], filters: [{ name: '压缩备份', extensions: ['zip'] }] });
    if (result.canceled || !result.filePaths[0]) return;
    const archivePath = result.filePaths[0]; const unzipper = runtimeRequire('unzipper') as Unzipper; const directory = await unzipper.Open.file(archivePath);
    if (!directory.files.some((f: any) => f.path === 'data.db') || !directory.files.some((f: any) => f.path === 'key-envelope.json')) throw new Error('该文件不是有效的工作站备份。');
    if (directory.files.some((f: any) => f.path.includes('..') || path.isAbsolute(f.path))) throw new Error('备份包含不安全的文件路径。');
    const staging = path.join(app.getPath('temp'), `zzz-workbench-restore-${randomUUID()}`);
    await directory.extract({ path: staging });
    this.database.close();
    await rm(this.root, { recursive: true, force: true }); await mkdir(this.root, { recursive: true });
    await cp(staging, this.root, { recursive: true }); await rm(staging, { recursive: true, force: true });
    app.relaunch(); app.quit();
  }
  saveReport(markdown: string) { return dialog.showSaveDialog({ title: '保存周报', defaultPath: `工作周报-${new Date().toISOString().slice(0, 10)}.md`, filters: [{ name: 'Markdown', extensions: ['md'] }] }).then(async (result) => { if (!result.canceled && result.filePath) { await writeFile(result.filePath, markdown, 'utf8'); return result.filePath; } return null; }); }
  copy(text: string) { clipboard.writeText(text); }
}
