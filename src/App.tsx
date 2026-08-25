import { useEffect, useState } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { FocusPill } from './renderer/components/FocusPill';
import { CalendarPage } from './renderer/pages/CalendarPage';
import { DashboardPage, NotesPage, PromptsPage, ReportsPage, SettingsPage } from './renderer/pages/CorePages';
import { FilesPage } from './renderer/pages/FilesPage';
import { HabitsPage } from './renderer/pages/HabitsPage';
import { IntegrationsPage } from './renderer/pages/IntegrationsPage';
import { RssPage } from './renderer/pages/RssPage';
import { TasksPage } from './renderer/pages/TasksPage';
import type { FocusSession } from './shared/types';

const labels: Record<string, string> = { '/': '今日总览', '/tasks': '任务与 GTD', '/calendar': '本地日历', '/habits': '习惯与喝水', '/notes': '笔记', '/prompts': '提示词模板', '/files': '文件索引', '/rss': 'RSS 阅读', '/reports': '统计周报', '/integrations': '外部整合', '/settings': '设置' };
const icons: Record<string, string> = { '/': '◈', '/tasks': '✓', '/calendar': '▦', '/habits': '◉', '/notes': '▤', '/prompts': '⌘', '/files': '▱', '/rss': '◌', '/reports': '◫', '/integrations': '↗', '/settings': '⚙' };

function AuthGate() {
  const [state, setState] = useState<'loading' | 'setup' | 'unlock' | 'ready'>('loading'); const [password, setPassword] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState('');
  useEffect(() => { void window.workbench.auth.state().then((value) => setState(value.unlocked ? 'ready' : value.configured ? 'unlock' : 'setup')); return window.workbench.events.onLocked(() => { setPassword(''); setState('unlock'); }); }, []);
  if (state === 'ready') return <Workbench />;
  const submit = async (event: React.FormEvent) => { event.preventDefault(); setError(''); try { if (state === 'setup') { if (password !== confirm) throw new Error('两次输入的主密码不一致。'); await window.workbench.auth.setup(password); } else await window.workbench.auth.unlock(password); setPassword(''); setConfirm(''); setState('ready'); } catch (reason: any) { setError(reason.message || '无法解锁工作站。'); } };
  return <main className="auth-shell"><section className="auth-card"><span className="brand-mark">Z</span><p className="eyebrow">ZZZ WORKSTATION</p><h1>{state === 'setup' ? '创建你的私密工作站' : '欢迎回来'}</h1><p className="muted">{state === 'setup' ? '主密码用于加密所有本地数据，忘记后无法恢复。' : '请输入主密码以解锁本地加密数据。'}</p><form onSubmit={submit}><label>主密码<input type="password" value={password} minLength={10} onChange={(event) => setPassword(event.target.value)} autoFocus required /></label>{state === 'setup' && <label>确认主密码<input type="password" value={confirm} minLength={10} onChange={(event) => setConfirm(event.target.value)} required /></label>}{error && <p className="error">{error}</p>}<button className="primary full" type="submit">{state === 'setup' ? '创建并进入工作站' : '解锁工作站'}</button></form></section></main>;
}

function Workbench() {
  const navigate = useNavigate(); const location = useLocation(); const [focus, setFocus] = useState<FocusSession | null>(null);
  const refreshFocus = () => window.workbench.focus.active().then(setFocus);
  useEffect(() => { void refreshFocus(); const offFocus = window.workbench.events.onFocusChanged(() => void refreshFocus()); const offNavigate = window.workbench.events.onNavigate((route) => navigate(route)); return () => { offFocus(); offNavigate(); }; }, [navigate]);
  return <div className="app-shell"><aside className="sidebar"><div className="logo"><span className="brand-mark small">Z</span><span>Zzz 的工作站</span></div><nav>{Object.keys(labels).map((path) => <NavLink key={path} to={path} end={path === '/'} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}><span>{icons[path]}</span>{labels[path]}</NavLink>)}</nav><div className="sidebar-bottom"><button className="quiet" onClick={() => navigate('/tasks?new=1')}>＋ 新建任务</button><button className="quiet" onClick={() => navigate('/notes?new=1')}>＋ 新建笔记</button></div></aside><main className="content"><header className="topbar"><div><p className="eyebrow">本地加密 · 离线优先</p><h2>{labels[location.pathname] || 'Zzz 的工作站'}</h2></div><div className="top-actions"><FocusPill focus={focus} refreshed={refreshFocus} /><button className="quiet" onClick={() => void window.workbench.auth.lock()}>锁定</button></div></header><Routes><Route path="/" element={<DashboardPage />} /><Route path="/tasks" element={<TasksPage />} /><Route path="/calendar" element={<CalendarPage />} /><Route path="/habits" element={<HabitsPage />} /><Route path="/notes" element={<NotesPage />} /><Route path="/prompts" element={<PromptsPage />} /><Route path="/files" element={<FilesPage />} /><Route path="/rss" element={<RssPage />} /><Route path="/reports" element={<ReportsPage />} /><Route path="/integrations" element={<IntegrationsPage />} /><Route path="/settings" element={<SettingsPage />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes></main></div>;
}

export default function App() { return <HashRouter><AuthGate /></HashRouter>; }
