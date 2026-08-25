import { app, BrowserWindow, dialog, globalShortcut, Menu, nativeImage, net, Notification, powerMonitor, protocol, shell, Tray } from 'electron';
import { spawn } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WorkbenchServices } from './main/services';
import { registerIpc } from './main/ipc';
import type { Task } from './shared/types';

app.setName('Zzz Workstation');
app.setPath('userData', path.join(app.getPath('appData'), 'Zzz Workstation'));

const uninstallShortcut = () => path.join(app.getPath('desktop'), '卸载 Zzz 的工作站.lnk');
function createUninstallShortcut(updateExe: string, iconExe: string) {
  if (!existsSync(updateExe)) return;
  const value = (raw: string) => Buffer.from(raw, 'utf8').toString('base64');
  const script = `$w=New-Object -ComObject WScript.Shell;$s=$w.CreateShortcut([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${value(uninstallShortcut())}')));$s.TargetPath=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${value(updateExe)}'));$s.Arguments='--uninstall';$s.WorkingDirectory=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${value(path.dirname(updateExe))}'));$s.IconLocation=([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${value(iconExe)}'))+',0');$s.Description='卸载 Zzz 的工作站，并删除本机工作站数据';$s.Save()`;
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  try { spawn(powershell, ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', script], { detached: true, stdio: 'ignore' }).unref(); } catch { void 0; }
}

function squirrelStartup() {
  const command = process.argv[1];
  if (process.platform !== 'win32' || !command?.startsWith('--squirrel-')) return false;
  const target = path.basename(process.execPath);
  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const update = (args: string[]) => { try { spawn(updateExe, args, { detached: true }).on('close', () => app.quit()); } catch { app.quit(); } };
  if (command === '--squirrel-uninstall') {
    rmSync(path.join(app.getPath('appData'), 'Zzz Workstation'), { recursive: true, force: true, maxRetries: 3 }); rmSync(uninstallShortcut(), { force: true, maxRetries: 1 });
    dialog.showMessageBoxSync({ type: 'info', title: 'Zzz 的工作站已卸载', message: '已删除本机工作站数据。', detail: '数据库、附件、缓存、设置和本机受保护凭据均已清除。你手动导出到其他位置的备份不会被删除。', buttons: ['完成'] });
    update([`--removeShortcut=${target}`]); return true;
  }
  if (command === '--squirrel-install' || command === '--squirrel-updated') { createUninstallShortcut(updateExe, process.execPath); update([`--createShortcut=${target}`]); return true; }
  if (command === '--squirrel-obsolete') { app.quit(); return true; }
  return false;
}

if (squirrelStartup()) app.quit();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
let lastHydrationNotice = 0;
let indexing = false;
const services = new WorkbenchServices();
function send(channel: 'locked' | 'focus-changed' | 'navigate', value?: string) { mainWindow?.webContents.send(`event:${channel}`, value); }
function showWindow(route = '/') { if (!mainWindow) return; mainWindow.show(); mainWindow.focus(); if (route !== '/') send('navigate', route); }
function openExternal(raw: string) { try { const url = new URL(raw); if (url.protocol === 'https:') void shell.openExternal(url.toString()); } catch { /* ignore invalid URLs */ } }
function checkLocalReminders() {
  if (!services.database.open) return;
  services.database.dueReminders().forEach((task: Task) => { new Notification({ title: '任务提醒', body: task.title }).show(); services.database.markReminded(task.id); });
  const hydration = services.database.hydrationDay(); const settings = services.database.hydrationSettings();
  if (hydration.amount < hydration.goal && Date.now() - lastHydrationNotice >= settings.reminderMinutes * 60_000) {
    new Notification({ title: '喝水提醒', body: `今天已记录 ${hydration.amount}/${hydration.goal} 杯，喝口水吧。` }).show(); lastHydrationNotice = Date.now();
  }
}
async function checkExternalIntegrations() {
  if (!services.database.open) return;
  try { if (await services.maybeSendWeeklyMail()) new Notification({ title: '周报已发送', body: '本周工作周报已发送到已验证邮箱。' }).show(); } catch { /* retain local work when the network or SMTP is unavailable */ }
  try { if (await services.maybeAutoRemoteBackup()) new Notification({ title: '云端备份完成', body: '已上传今日加密备份到 OSS。' }).show(); } catch { /* configuration and network errors stay recoverable in settings */ }
  const stale = services.database.listRssFeeds().some((feed) => feed.enabled && (!feed.lastFetchedAt || Date.now() - new Date(feed.lastFetchedAt).getTime() > 30 * 60_000));
  if (stale) { try { await services.refreshRss(); } catch { void 0; } }
}

function createTray() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#6d92e7"/><path fill="#fff" d="M8 9h16v3L13 21h11v3H8v-3l11-9H8z"/></svg>`;
  const trayIcon = nativeImage.createFromDataURL(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
  tray = new Tray(trayIcon); tray.setToolTip('Zzz 的工作站');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开工作站', click: () => showWindow() }, { label: '新建任务', click: () => showWindow('/tasks?new=1') }, { label: '新建笔记', click: () => showWindow('/notes?new=1') }, { type: 'separator' },
    { label: '开始 / 暂停番茄钟', click: () => { if (!services.database.open) return showWindow(); const active = services.database.activeFocus(); if (!active) services.database.startFocus(null); else services.database.pauseFocus(); send('focus-changed'); } }, { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ])); tray.on('click', () => showWindow());
}

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 1040, minHeight: 680, show: false, backgroundColor: '#10131a', titleBarStyle: 'hidden', titleBarOverlay: { color: '#10131a', symbolColor: '#dbe6fb', height: 34 }, webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
  mainWindow.once('ready-to-show', () => mainWindow?.show());
  mainWindow.on('close', (event) => { if (!quitting) { event.preventDefault(); mainWindow?.hide(); } });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { openExternal(url); return { action: 'deny' }; });
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('file:') && !url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL || '')) { event.preventDefault(); openExternal(url); } });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL); else mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

app.whenReady().then(() => {
  protocol.handle('attachment', (request) => { const attachmentId = new URL(request.url).hostname; const file = services.attachmentPath(attachmentId); return file ? net.fetch(pathToFileURL(file).toString()) : new Response('Not found', { status: 404 }); });
  registerIpc(services, send); createWindow(); createTray(); globalShortcut.register('Alt+Space', () => mainWindow?.isVisible() ? mainWindow.hide() : showWindow());
  powerMonitor.on('lock-screen', () => { if (services.database.open) { services.database.close(); send('locked'); } });
  setInterval(checkLocalReminders, 60_000);
  setInterval(() => { void checkExternalIntegrations(); }, 15 * 60_000);
  setInterval((): void => { if (services.database.open && !indexing) { indexing = true; void services.rescanFiles().catch((): void => {}).finally((): void => { indexing = false; }); } }, 15 * 60_000);
  setInterval(() => { if (!services.database.open) return; const active = services.database.activeFocus(); if (!active || active.pausedAt) return; const elapsed = (Date.now() - new Date(active.startedAt).getTime()) / 1000 - active.pausedSeconds; if (elapsed >= active.plannedSeconds) { services.database.finishFocus(); new Notification({ title: active.kind === 'focus' ? '专注完成' : '休息结束', body: active.kind === 'focus' ? '做得好，休息一下吧。' : '准备开始下一轮专注。' }).show(); send('focus-changed'); } }, 1000);
});
app.on('window-all-closed', () => { /* tray keeps the app available on Windows */ });
app.on('before-quit', () => { quitting = true; services.database.close(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('activate', () => showWindow());
