import { lstat, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import type { IndexedFile } from '../../shared/types';
import { isPathWithinRoot } from '../../shared/path-safety';
import { WorkbenchDatabase } from '../database';

const MAX_FILES_PER_ROOT = 50_000;
/** Metadata-only scanner. It never reads document content or follows symlinked directories. */
export class FileIndexer {
  constructor(private readonly database: WorkbenchDatabase) {}

  async rescanAll() { for (const root of this.database.listFileRoots()) await this.scan(root.id, root.path); }
  async scan(rootId: string, rootPath: string) {
    const resolvedRoot = await realpath(rootPath);
    const files: Array<Omit<IndexedFile, 'id' | 'rootId'>> = [];
    const visit = async (directory: string): Promise<void> => {
      if (files.length >= MAX_FILES_PER_ROOT) return;
      let entries: Array<{ name: string; isSymbolicLink(): boolean; isDirectory(): boolean; isFile(): boolean }>;
      try { entries = await readdir(directory, { withFileTypes: true, encoding: 'utf8' }); } catch { return; }
      for (const entry of entries) {
        if (files.length >= MAX_FILES_PER_ROOT || entry.isSymbolicLink()) continue;
        const candidate = path.join(directory, entry.name);
        if (!isPathWithinRoot(resolvedRoot, candidate)) continue;
        if (entry.isDirectory()) await visit(candidate);
        else if (entry.isFile()) {
          try {
            const meta = await lstat(candidate);
            files.push({ path: candidate, name: entry.name, extension: path.extname(entry.name).toLowerCase(), size: meta.size, modifiedAt: meta.mtime.toISOString() });
          } catch { /* File can disappear while scanning. */ }
        }
      }
    };
    await visit(resolvedRoot);
    this.database.replaceIndexedFiles(rootId, files);
  }

  async safeOpen(fileId: string) {
    const item = this.database.indexedFile(fileId);
    if (!item) throw new Error('文件索引不存在。');
    const root = await realpath(item.root_path);
    const candidate = await realpath(item.path);
    if (!isPathWithinRoot(root, candidate)) throw new Error('文件已不在授权索引目录中。');
    return candidate;
  }
}
