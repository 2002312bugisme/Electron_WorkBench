import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { CreateNoteInput, CreatePromptInput, CreateTaskInput, Dashboard, FocusSession, Note, PromptCategory, PromptTemplate, Tag, Task, TaskStatus, WeeklyReport } from '../shared/types';

import SqlCipher from 'better-sqlite3-multiple-ciphers';
type Db = any;
const now = () => new Date().toISOString();
const id = () => randomUUID();

export class WorkbenchDatabase {
  private db: Db | null = null;
  constructor(private readonly root: string) {}
  get open() { return this.db !== null; }
  openWithKey(key: string) {
    mkdirSync(this.root, { recursive: true });
    const db = new SqlCipher(path.join(this.root, 'data.db'));
    db.pragma("cipher = 'sqlcipher'");
    db.pragma(`key = "x'${key}'"`);
    db.pragma('cipher_compatibility = 4');
    db.pragma('foreign_keys = ON');
    db.pragma('journal_mode = WAL');
    db.exec(`CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, color TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS tasks (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL, priority TEXT NOT NULL, project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, due_at TEXT, reminder_at TEXT, repeat_rule TEXT NOT NULL DEFAULT 'none', completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS task_tags (task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(task_id, tag_id));
      CREATE TABLE IF NOT EXISTS notes (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT '', project_id TEXT REFERENCES projects(id) ON DELETE SET NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS note_tags (note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(note_id, tag_id));
      CREATE TABLE IF NOT EXISTS attachments (id TEXT PRIMARY KEY, note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE, filename TEXT NOT NULL, stored_name TEXT NOT NULL, mime_type TEXT, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS prompt_categories (id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS prompts (id TEXT PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL, category_id TEXT REFERENCES prompt_categories(id) ON DELETE SET NULL, favorite INTEGER NOT NULL DEFAULT 0, usage_count INTEGER NOT NULL DEFAULT 0, last_used_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS prompt_tags (prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE, tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(prompt_id, tag_id));
      CREATE TABLE IF NOT EXISTS pomodoro_sessions (id TEXT PRIMARY KEY, task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL, kind TEXT NOT NULL, planned_seconds INTEGER NOT NULL, started_at TEXT NOT NULL, paused_at TEXT, paused_seconds INTEGER NOT NULL DEFAULT 0, ended_at TEXT, abandoned INTEGER NOT NULL DEFAULT 0);
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);`);
    const count = (db.prepare('SELECT COUNT(*) AS count FROM prompt_categories').get() as { count: number }).count;
    if (!count) ['数据准备', '训练与微调', '量化与部署', '调试与分析'].forEach((name, sortOrder) => db.prepare('INSERT INTO prompt_categories VALUES (?, ?, ?, ?)').run(id(), name, sortOrder, now()));
    this.db = db;
  }
  close() { if (this.db) { this.db.close(); this.db = null; } }
  private get d(): Db { if (!this.db) throw new Error('工作站已锁定，请先输入主密码。'); return this.db; }
  private tagsFor(kind: 'task' | 'note' | 'prompt', entityId: string): Tag[] {
    const table = kind === 'task' ? 'task_tags' : kind === 'note' ? 'note_tags' : 'prompt_tags';
    const key = kind === 'prompt' ? 'prompt_id' : `${kind}_id`;
    return this.d.prepare(`SELECT t.* FROM tags t JOIN ${table} et ON et.tag_id=t.id WHERE et.${key}=? ORDER BY t.name`).all(entityId).map((x: any) => ({ id: x.id, name: x.name, color: x.color, createdAt: x.created_at }));
  }
  private replaceTags(kind: 'task' | 'note' | 'prompt', entityId: string, tagIds: string[] = []) {
    const table = kind === 'task' ? 'task_tags' : kind === 'note' ? 'note_tags' : 'prompt_tags'; const key = kind === 'prompt' ? 'prompt_id' : `${kind}_id`;
    this.d.prepare(`DELETE FROM ${table} WHERE ${key}=?`).run(entityId);
    const insert = this.d.prepare(`INSERT OR IGNORE INTO ${table} (${key}, tag_id) VALUES (?, ?)`);
    tagIds.forEach((tagId) => insert.run(entityId, tagId));
  }
  private task(row: any): Task { return { id: row.id, title: row.title, description: row.description, status: row.status, priority: row.priority, projectId: row.project_id, projectName: row.project_name, tags: this.tagsFor('task', row.id), dueAt: row.due_at, reminderAt: row.reminder_at, repeatRule: row.repeat_rule, completedAt: row.completed_at, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private note(row: any): Note { return { id: row.id, title: row.title, content: row.content, projectId: row.project_id, projectName: row.project_name, tags: this.tagsFor('note', row.id), createdAt: row.created_at, updatedAt: row.updated_at }; }
  private prompt(row: any): PromptTemplate { return { id: row.id, title: row.title, body: row.body, categoryId: row.category_id, categoryName: row.category_name, tags: this.tagsFor('prompt', row.id), favorite: Boolean(row.favorite), usageCount: row.usage_count, lastUsedAt: row.last_used_at, createdAt: row.created_at, updatedAt: row.updated_at }; }
  private taskQuery() { return 'SELECT tasks.*, projects.name AS project_name FROM tasks LEFT JOIN projects ON projects.id=tasks.project_id'; }
  listTasks(search = ''): Task[] { const s = `%${search.trim()}%`; return this.d.prepare(`${this.taskQuery()} WHERE tasks.title LIKE ? OR tasks.description LIKE ? ORDER BY CASE tasks.status WHEN 'in_progress' THEN 0 WHEN 'todo' THEN 1 ELSE 2 END, CASE tasks.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, COALESCE(tasks.due_at, '9999')`).all(s, s).map((r: any) => this.task(r)); }
  saveTask(input: CreateTaskInput & { id?: string }): Task {
    const timestamp = now(); const taskId = input.id || id();
    if (!input.title.trim()) throw new Error('任务标题不能为空。');
    if (input.id) this.d.prepare('UPDATE tasks SET title=?, description=?, status=?, priority=?, project_id=?, due_at=?, reminder_at=?, repeat_rule=?, updated_at=? WHERE id=?').run(input.title.trim(), input.description || '', input.status || 'todo', input.priority || 'medium', input.projectId || null, input.dueAt || null, input.reminderAt || null, input.repeatRule || 'none', timestamp, taskId);
    else this.d.prepare('INSERT INTO tasks VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)').run(taskId, input.title.trim(), input.description || '', input.status || 'todo', input.priority || 'medium', input.projectId || null, input.dueAt || null, input.reminderAt || null, input.repeatRule || 'none', timestamp, timestamp);
    this.replaceTags('task', taskId, input.tagIds); return this.getTask(taskId)!;
  }
  getTask(taskId: string) { const row = this.d.prepare(`${this.taskQuery()} WHERE tasks.id=?`).get(taskId); return row ? this.task(row) : null; }
  deleteTask(taskId: string) { this.d.prepare('DELETE FROM tasks WHERE id=?').run(taskId); }
  moveTask(taskId: string, status: TaskStatus) { this.d.prepare('UPDATE tasks SET status=?, completed_at=?, updated_at=? WHERE id=?').run(status, status === 'done' ? now() : null, now(), taskId); return this.getTask(taskId)!; }
  completeTask(taskId: string) {
    const task = this.getTask(taskId); if (!task) throw new Error('任务不存在。'); this.moveTask(taskId, 'done');
    if (task.repeatRule !== 'none') { const base = task.dueAt ? new Date(task.dueAt) : new Date(); if (task.repeatRule === 'daily') base.setDate(base.getDate() + 1); if (task.repeatRule === 'weekly') base.setDate(base.getDate() + 7); if (task.repeatRule === 'monthly') base.setMonth(base.getMonth() + 1); this.saveTask({ title: task.title, description: task.description, priority: task.priority, projectId: task.projectId, tagIds: task.tags.map((t) => t.id), dueAt: base.toISOString(), repeatRule: task.repeatRule }); }
    return this.getTask(taskId)!;
  }
  listNotes(search = ''): Note[] { const s = `%${search.trim()}%`; return this.d.prepare('SELECT notes.*, projects.name AS project_name FROM notes LEFT JOIN projects ON projects.id=notes.project_id WHERE notes.title LIKE ? OR notes.content LIKE ? ORDER BY notes.updated_at DESC').all(s, s).map((r: any) => this.note(r)); }
  getNote(noteId: string) { const row = this.d.prepare('SELECT notes.*, projects.name AS project_name FROM notes LEFT JOIN projects ON projects.id=notes.project_id WHERE notes.id=?').get(noteId); return row ? this.note(row) : null; }
  saveNote(input: CreateNoteInput & { id?: string }): Note { const timestamp = now(); const noteId = input.id || id(); if (!input.title.trim()) throw new Error('笔记标题不能为空。'); if (input.id) this.d.prepare('UPDATE notes SET title=?, content=?, project_id=?, updated_at=? WHERE id=?').run(input.title.trim(), input.content || '', input.projectId || null, timestamp, noteId); else this.d.prepare('INSERT INTO notes VALUES (?, ?, ?, ?, ?, ?)').run(noteId, input.title.trim(), input.content || '', input.projectId || null, timestamp, timestamp); this.replaceTags('note', noteId, input.tagIds); return this.getNote(noteId)!; }
  deleteNote(noteId: string) { this.d.prepare('DELETE FROM notes WHERE id=?').run(noteId); }
  attachment(idValue: string) { return this.d.prepare('SELECT * FROM attachments WHERE id=?').get(idValue); }
  addAttachment(noteId: string, filename: string, storedName: string, mimeType: string | null) { const attachmentId = id(); this.d.prepare('INSERT INTO attachments VALUES (?, ?, ?, ?, ?, ?)').run(attachmentId, noteId, filename, storedName, mimeType, now()); return attachmentId; }
  categories(): PromptCategory[] { return this.d.prepare('SELECT * FROM prompt_categories ORDER BY sort_order, name').all().map((r: any) => ({ id: r.id, name: r.name, sortOrder: r.sort_order, createdAt: r.created_at })); }
  listPrompts(search = ''): PromptTemplate[] { const s = `%${search.trim()}%`; return this.d.prepare('SELECT prompts.*, prompt_categories.name AS category_name FROM prompts LEFT JOIN prompt_categories ON prompt_categories.id=prompts.category_id WHERE prompts.title LIKE ? OR prompts.body LIKE ? ORDER BY prompts.favorite DESC, prompts.updated_at DESC').all(s, s).map((r: any) => this.prompt(r)); }
  savePrompt(input: CreatePromptInput & { id?: string }): PromptTemplate { const timestamp = now(); const promptId = input.id || id(); if (!input.title.trim() || !input.body.trim()) throw new Error('模板标题和内容不能为空。'); if (input.id) this.d.prepare('UPDATE prompts SET title=?, body=?, category_id=?, favorite=?, updated_at=? WHERE id=?').run(input.title.trim(), input.body, input.categoryId || null, input.favorite ? 1 : 0, timestamp, promptId); else this.d.prepare('INSERT INTO prompts VALUES (?, ?, ?, ?, ?, 0, NULL, ?, ?)').run(promptId, input.title.trim(), input.body, input.categoryId || null, input.favorite ? 1 : 0, timestamp, timestamp); this.replaceTags('prompt', promptId, input.tagIds); return this.getPrompt(promptId)!; }
  getPrompt(promptId: string) { const row = this.d.prepare('SELECT prompts.*, prompt_categories.name AS category_name FROM prompts LEFT JOIN prompt_categories ON prompt_categories.id=prompts.category_id WHERE prompts.id=?').get(promptId); return row ? this.prompt(row) : null; }
  deletePrompt(promptId: string) { this.d.prepare('DELETE FROM prompts WHERE id=?').run(promptId); }
  usePrompt(promptId: string, values: Record<string, string>) { const prompt = this.getPrompt(promptId); if (!prompt) throw new Error('模板不存在。'); const text = prompt.body.replace(/{{\s*([\w.-]+)\s*}}/g, (_, name) => values[name] ?? `{{${name}}}`); this.d.prepare('UPDATE prompts SET usage_count=usage_count+1, last_used_at=? WHERE id=?').run(now(), promptId); return text; }
  activeFocus(): FocusSession | null { const r = this.d.prepare('SELECT pomodoro_sessions.*, tasks.title AS task_title FROM pomodoro_sessions LEFT JOIN tasks ON tasks.id=pomodoro_sessions.task_id WHERE ended_at IS NULL ORDER BY started_at DESC LIMIT 1').get(); return r ? this.focus(r) : null; }
  private focus(r: any): FocusSession { return { id: r.id, taskId: r.task_id, taskTitle: r.task_title, kind: r.kind, plannedSeconds: r.planned_seconds, startedAt: r.started_at, pausedAt: r.paused_at, pausedSeconds: r.paused_seconds, endedAt: r.ended_at, abandoned: Boolean(r.abandoned) }; }
  startFocus(taskId: string | null, kind: 'focus' | 'break' = 'focus') { const existing = this.activeFocus(); if (existing) return existing; const sessionId = id(); this.d.prepare('INSERT INTO pomodoro_sessions VALUES (?, ?, ?, ?, ?, NULL, 0, NULL, 0)').run(sessionId, taskId || null, kind, kind === 'focus' ? 1500 : 300, now()); return this.activeFocus()!; }
  pauseFocus() { const focus = this.activeFocus(); if (!focus) return null; if (!focus.pausedAt) this.d.prepare('UPDATE pomodoro_sessions SET paused_at=? WHERE id=?').run(now(), focus.id); else { const paused = Math.round((Date.now() - new Date(focus.pausedAt).getTime()) / 1000); this.d.prepare('UPDATE pomodoro_sessions SET paused_at=NULL, paused_seconds=paused_seconds+? WHERE id=?').run(paused, focus.id); } return this.activeFocus(); }
  finishFocus(abandoned = false) { const focus = this.activeFocus(); if (!focus) return null; let pausedSeconds = focus.pausedSeconds; if (focus.pausedAt) pausedSeconds += Math.round((Date.now() - new Date(focus.pausedAt).getTime()) / 1000); this.d.prepare('UPDATE pomodoro_sessions SET paused_at=NULL, paused_seconds=?, ended_at=?, abandoned=? WHERE id=?').run(pausedSeconds, now(), abandoned ? 1 : 0, focus.id); const row = this.d.prepare('SELECT pomodoro_sessions.*, tasks.title AS task_title FROM pomodoro_sessions LEFT JOIN tasks ON tasks.id=pomodoro_sessions.task_id WHERE pomodoro_sessions.id=?').get(focus.id); return row ? this.focus(row) : null; }
  dashboard(): Dashboard { const date = new Date().toISOString().slice(0, 10); const tasks = this.listTasks(); return { todayTasks: tasks.filter((t) => t.status !== 'done' && t.dueAt?.slice(0, 10) === date), overdueTasks: tasks.filter((t) => t.status !== 'done' && !!t.dueAt && t.dueAt.slice(0, 10) < date), recentNotes: this.listNotes().slice(0, 5), favoritePrompts: this.listPrompts().filter((p) => p.favorite).slice(0, 5), weekFocusSeconds: this.weekFocusSeconds(), activeFocus: this.activeFocus() }; }
  private weekStart() { const d = new Date(); const day = d.getDay() || 7; d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - day + 1); return d; }
  private weekFocusSeconds() { const rows = this.d.prepare('SELECT * FROM pomodoro_sessions WHERE ended_at IS NOT NULL AND started_at >= ? AND abandoned=0').all(this.weekStart().toISOString()); return rows.reduce((total: number, r: any) => total + Math.max(0, Math.round((new Date(r.ended_at).getTime() - new Date(r.started_at).getTime()) / 1000) - r.paused_seconds), 0); }
  weeklyReport(): WeeklyReport { const start = this.weekStart().toISOString(); const completed = this.d.prepare(`${this.taskQuery()} WHERE tasks.completed_at >= ? ORDER BY tasks.completed_at DESC`).all(start).map((r: any) => this.task(r)); const pending = this.listTasks().filter((t: Task) => t.status !== 'done'); const stats = this.d.prepare('SELECT COALESCE(projects.name, \'未分类\') AS name, COUNT(*) AS count FROM tasks LEFT JOIN projects ON projects.id=tasks.project_id WHERE tasks.completed_at >= ? GROUP BY projects.name ORDER BY count DESC').all(start) as Array<{ name: string; count: number }>; const focusSeconds = this.weekFocusSeconds(); const hours = (focusSeconds / 3600).toFixed(1); const markdown = `# 本周工作周报\n\n> ${this.weekStart().toLocaleDateString()} — ${new Date().toLocaleDateString()}\n\n## 完成任务（${completed.length}）\n${completed.length ? completed.map((t: Task) => `- [x] ${t.title}`).join('\n') : '- 本周暂无已完成任务'}\n\n## 项目统计\n${stats.length ? stats.map((s) => `- ${s.name}：${s.count} 项任务`).join('\n') : '- 暂无数据'}\n\n## 专注时间\n- 番茄专注总时长：${hours} 小时\n\n## 下周待办\n${pending.length ? pending.map((t: Task) => `- [ ] ${t.title}`).join('\n') : '- 暂无待办'}`; return { markdown, completed, pending, focusSeconds, projectStats: stats }; }
  checkpoint() { this.d.pragma('wal_checkpoint(TRUNCATE)'); }
}
