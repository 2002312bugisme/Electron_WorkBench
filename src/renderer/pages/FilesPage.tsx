import { useEffect, useState } from 'react';
import type { FileRoot, IndexedFile } from '../../shared/types';
import { EmptyState } from '../components/EmptyState';

const formatSize = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / 1024 / 1024).toFixed(1)} MB`;

export function FilesPage() {
  const [roots, setRoots] = useState<FileRoot[]>([]); const [query, setQuery] = useState(''); const [results, setResults] = useState<IndexedFile[]>([]); const [busy, setBusy] = useState(false); const [message, setMessage] = useState('');
  const refresh = () => window.workbench.files.roots().then(setRoots);
  useEffect(() => { void refresh(); }, []); useEffect(() => { const timer = window.setTimeout(() => { void window.workbench.files.search(query).then(setResults); }, 150); return () => window.clearTimeout(timer); }, [query]);
  const add = async () => { setBusy(true); try { await window.workbench.files.addRoot(); await refresh(); setMessage('目录已索引。'); } finally { setBusy(false); } };
  const rescan = async () => { setBusy(true); try { await window.workbench.files.rescan(); await refresh(); setMessage('索引已更新。'); } finally { setBusy(false); } };
  return <div className="page files-page"><section className="files-intro"><div><p className="eyebrow">本地文件索引</p><h2>只搜索你授权的文件夹</h2><p className="muted">仅保存文件名、路径、类型、大小和修改时间，不读取正文、不上传任何内容。</p></div><div><button className="quiet" disabled={busy} onClick={() => void rescan()}>重新扫描</button><button className="primary" disabled={busy} onClick={() => void add()}>＋ 添加文件夹</button></div></section>{message && <p className="success">{message}</p>}<section className="file-roots"><h3>已授权目录</h3>{roots.length ? roots.map((root) => <article key={root.id}><div><strong>{root.name}</strong><small>{root.path}</small></div><div><small>{root.lastIndexedAt ? `已索引 ${new Date(root.lastIndexedAt).toLocaleString()}` : '等待扫描'}</small><button className="danger compact-danger" onClick={async () => { if (window.confirm(`移除“${root.name}”的索引？不会删除原始文件。`)) { await window.workbench.files.removeRoot(root.id); await refresh(); setResults([]); } }}>移除</button></div></article>) : <EmptyState text="添加一个文件夹后，才能在这里搜索文件。" />}</section><section className="file-search"><input className="search" placeholder="搜索已索引文件…" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <div className="file-results">{results.length ? results.map((file) => <button key={file.id} onClick={() => void window.workbench.files.open(file.id)}><span>▤</span><div><strong>{file.name}</strong><small>{file.path} · {formatSize(file.size)}</small></div></button>) : <EmptyState text="没有找到匹配的文件。" />}</div>}</section></div>;
}
