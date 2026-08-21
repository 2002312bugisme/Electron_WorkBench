import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { GtdStage, Project, Tag, Task, TaskPriority, TaskStatus } from '../../shared/types';
import { Dialog } from '../components/Dialog';
import { EmptyState } from '../components/EmptyState';
import { datetimeInput, shortDate } from '../lib/date';

const statuses: Record<TaskStatus, string> = { todo: '待处理', in_progress: '进行中', done: '已完成' };
const priorities: Record<TaskPriority, string> = { high: '高', medium: '中', low: '低' };
const stages: Record<GtdStage, string> = { inbox: '收集箱', next: '下一步行动', waiting: '等待', someday: '将来 / 也许' };

export function TasksPage() {
  const [params, setParams] = useSearchParams();
  const [tasks, setTasks] = useState<Task[]>([]); const [search, setSearch] = useState(''); const [view, setView] = useState<'list' | 'gtd' | 'quadrant'>('list'); const [editing, setEditing] = useState<Task | null>(null);
  const refresh = () => window.workbench.tasks.list(search).then(setTasks);
  useEffect(() => { void refresh(); }, [search]);
  useEffect(() => { if (params.get('new') === '1') { setEditing({} as Task); setParams({}, { replace: true }); } }, [params, setParams]);
  const complete = async (task: Task) => { await window.workbench.tasks.complete(task.id); await refresh(); };
  return <div className="page tasks-page"><div className="page-tools"><input className="search" placeholder="搜索任务…" value={search} onChange={(event) => setSearch(event.target.value)} /><div className="segmented"><button className={view === 'list' ? 'selected' : ''} onClick={() => setView('list')}>列表</button><button className={view === 'gtd' ? 'selected' : ''} onClick={() => setView('gtd')}>GTD</button><button className={view === 'quadrant' ? 'selected' : ''} onClick={() => setView('quadrant')}>四象限</button></div><button className="primary" onClick={() => setEditing({} as Task)}>＋ 新建任务</button></div>
    {view === 'list' && <TaskList tasks={tasks} onEdit={setEditing} onComplete={complete} />}
    {view === 'gtd' && <GtdBoard tasks={tasks} edit={setEditing} />}
    {view === 'quadrant' && <Quadrants tasks={tasks} edit={setEditing} />}
    {editing && <TaskDialog task={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await refresh(); }} />}
  </div>;
}

export function TaskList({ tasks, onEdit, onComplete }: { tasks: Task[]; onEdit: (task: Task) => void; onComplete: (task: Task) => void }) {
  return <div className="task-list">{tasks.length ? tasks.map((task) => <TaskRow key={task.id} task={task} onEdit={onEdit} onComplete={onComplete} />) : <EmptyState text="还没有任务。先把脑中的一件事放进收集箱。" />}</div>;
}

function TaskRow({ task, onEdit, onComplete }: { task: Task; onEdit: (task: Task) => void; onComplete: (task: Task) => void }) {
  return <article className={`task-row ${task.status === 'done' ? 'is-done' : ''}`}><button className="check" onClick={() => task.status === 'done' ? onEdit(task) : onComplete(task)}>{task.status === 'done' ? '✓' : ''}</button><button className="task-main" onClick={() => onEdit(task)}><strong>{task.title}</strong><span>{stages[task.gtdStage]} · {task.projectName || '个人'} · {task.dueAt ? shortDate(task.dueAt) : '无截止日期'}</span></button><span className={`priority ${task.priority}`}>{priorities[task.priority]}</span></article>;
}

function GtdBoard({ tasks, edit }: { tasks: Task[]; edit: (task: Task) => void }) {
  return <div className="gtd-board">{(Object.keys(stages) as GtdStage[]).map((stage) => <section className="gtd-column" key={stage}><h3>{stages[stage]} <span>{tasks.filter((task) => task.gtdStage === stage && task.status !== 'done').length}</span></h3>{tasks.filter((task) => task.gtdStage === stage && task.status !== 'done').map((task) => <button className="gtd-card" key={task.id} onClick={() => edit(task)}><strong>{task.title}</strong><small>{task.dueAt ? shortDate(task.dueAt) : '未排期'}</small></button>)}</section>)}</div>;
}

function Quadrants({ tasks, edit }: { tasks: Task[]; edit: (task: Task) => void }) {
  const groups = [
    { label: '重要且紧急', key: '11', hint: '马上处理' }, { label: '重要不紧急', key: '10', hint: '安排时间' },
    { label: '紧急不重要', key: '01', hint: '尽量委派' }, { label: '不重要不紧急', key: '00', hint: '谨慎投入' },
  ];
  return <div className="quadrants">{groups.map((group) => { const rows = tasks.filter((task) => `${Number(task.important)}${Number(task.urgent)}` === group.key && task.status !== 'done'); return <section className={`quadrant q-${group.key}`} key={group.key}><header><h3>{group.label}</h3><small>{group.hint}</small></header>{rows.length ? rows.map((task) => <button key={task.id} onClick={() => edit(task)}>{task.title}</button>) : <p>暂无任务</p>}</section>; })}</div>;
}

function TaskDialog({ task, onClose, onSaved }: { task: Task | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [title, setTitle] = useState(task?.title || ''); const [description, setDescription] = useState(task?.description || ''); const [priority, setPriority] = useState<TaskPriority>(task?.priority || 'medium'); const [status, setStatus] = useState<TaskStatus>(task?.status || 'todo'); const [stage, setStage] = useState<GtdStage>(task?.gtdStage || 'inbox'); const [repeatRule, setRepeat] = useState(task?.repeatRule || 'none'); const [due, setDue] = useState(datetimeInput(task?.dueAt)); const [reminder, setReminder] = useState(datetimeInput(task?.reminderAt)); const [projectId, setProjectId] = useState(task?.projectId || ''); const [tagIds, setTagIds] = useState<string[]>(task?.tags.map((tag) => tag.id) || []); const [important, setImportant] = useState(Boolean(task?.important)); const [urgent, setUrgent] = useState(Boolean(task?.urgent)); const [projects, setProjects] = useState<Project[]>([]); const [tags, setTags] = useState<Tag[]>([]);
  useEffect(() => { void Promise.all([window.workbench.projects.list(), window.workbench.tags.list()]).then(([projectRows, tagRows]) => { setProjects(projectRows); setTags(tagRows); }); }, []);
  const save = async (event: React.FormEvent) => { event.preventDefault(); await window.workbench.tasks.save({ id: task?.id, title, description, priority, status, gtdStage: stage, important, urgent, projectId: projectId || null, tagIds, dueAt: due ? new Date(due).toISOString() : null, reminderAt: reminder ? new Date(reminder).toISOString() : null, repeatRule }); await onSaved(); };
  const remove = async () => { if (task?.id && window.confirm(`删除任务“${task.title}”？`)) { await window.workbench.tasks.remove(task.id); await onSaved(); } };
  return <Dialog title={task ? '编辑任务' : '新建任务'} onClose={onClose}><form className="form-grid" onSubmit={save}><label className="wide">任务标题<input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus required /></label><label className="wide">说明<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></label><label>GTD 阶段<select value={stage} onChange={(event) => setStage(event.target.value as GtdStage)}>{Object.entries(stages).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label>状态<select value={status} onChange={(event) => setStatus(event.target.value as TaskStatus)}>{Object.entries(statuses).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label>优先级<select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>{Object.entries(priorities).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select></label><label>项目<select value={projectId} onChange={(event) => setProjectId(event.target.value)}><option value="">未分类</option>{projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><label>截止时间<input type="datetime-local" value={due} onChange={(event) => setDue(event.target.value)} /></label><label>提醒时间<input type="datetime-local" value={reminder} onChange={(event) => setReminder(event.target.value)} /></label><label>重复<select value={repeatRule} onChange={(event) => setRepeat(event.target.value as Task['repeatRule'])}><option value="none">不重复</option><option value="daily">每天</option><option value="weekly">每周</option><option value="monthly">每月</option></select></label><div className="task-flags"><label><input type="checkbox" checked={important} onChange={(event) => setImportant(event.target.checked)} /> 重要</label><label><input type="checkbox" checked={urgent} onChange={(event) => setUrgent(event.target.checked)} /> 紧急</label></div><fieldset className="wide tag-picker"><legend>标签</legend>{tags.length ? tags.map((tag) => <label key={tag.id}><input type="checkbox" checked={tagIds.includes(tag.id)} onChange={() => setTagIds((current) => current.includes(tag.id) ? current.filter((value) => value !== tag.id) : [...current, tag.id])} /> {tag.name}</label>) : <span className="muted">可在设置中创建标签</span>}</fieldset><div className="dialog-actions wide">{task?.id && <button className="danger" type="button" onClick={remove}>删除</button>}<button className="quiet" type="button" onClick={onClose}>取消</button><button className="primary" type="submit">保存任务</button></div></form></Dialog>;
}
