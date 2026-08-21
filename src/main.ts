import { app, BrowserWindow, globalShortcut, Menu, nativeImage, net, Notification, powerMonitor, protocol, shell, Tray } from 'electron';
import { spawn } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { WorkbenchServices } from './main/services';
import { registerIpc } from './main/ipc';

app.setName('Zzz Workstation');
app.setPath('userData', path.join(app.getPath('appData'), 'Zzz Workstation'));

function squirrelStartup() {
  const command = process.argv[1];
  if (process.platform !== 'win32' || !command?.startsWith('--squirrel-')) return false;
  const target = path.basename(process.execPath);
  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const update = (args: string[]) => { try { spawn(updateExe, args, { detached: true }).on('close', () => app.quit()); } catch { app.quit(); } };
  if (command === '--squirrel-uninstall') {
    rmSync(path.join(app.getPath('appData'), 'Zzz Workstation'), { recursive: true, force: true, maxRetries: 3 });
    update([`--removeShortcut=${target}`]); return true;
  }
  if (command === '--squirrel-install' || command === '--squirrel-updated') { update([`--createShortcut=${target}`]); return true; }
  if (command === '--squirrel-obsolete') { app.quit(); return true; }
  return false;
}

if (squirrelStartup()) app.quit();

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;
const services = new WorkbenchServices();
function send(channel: 'locked' | 'focus-changed' | 'navigate', value?: string) { mainWindow?.webContents.send(`event:${channel}`, value); }
function showWindow(route = '/') { if (!mainWindow) return; mainWindow.show(); mainWindow.focus(); if (route !== '/') send('navigate', route); }
function openExternal(raw: string) { try { const url = new URL(raw); if (url.protocol === 'https:') void shell.openExternal(url.toString()); } catch { /* ignore invalid URLs */ } }

function createTray() {
  tray = new Tray(nativeImage.createEmpty()); tray.setToolTip('Zzz 的工作站');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '打开工作站', click: () => showWindow() }, { label: '新建任务', click: () => showWindow('/tasks?new=1') }, { label: '新建笔记', click: () => showWindow('/notes?new=1') }, { type: 'separator' },
    { label: '开始 / 暂停番茄钟', click: () => { if (!services.database.open) return showWindow(); const active = services.database.activeFocus(); if (!active) services.database.startFocus(null); else services.database.pauseFocus(); send('focus-changed'); } }, { type: 'separator' },
    { label: '退出', click: () => { quitting = true; app.quit(); } },
  ])); tray.on('click', () => showWindow());
}

function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 1040, minHeight: 680, show: false, backgroundColor: '#10131a', webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true } });
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
  setInterval(() => { if (!services.database.open) return; const active = services.database.activeFocus(); if (!active || active.pausedAt) return; const elapsed = (Date.now() - new Date(active.startedAt).getTime()) / 1000 - active.pausedSeconds; if (elapsed >= active.plannedSeconds) { services.database.finishFocus(); new Notification({ title: active.kind === 'focus' ? '专注完成' : '休息结束', body: active.kind === 'focus' ? '做得好，休息一下吧。' : '准备开始下一轮专注。' }).show(); send('focus-changed'); } }, 1000);
});
app.on('window-all-closed', () => { /* tray keeps the app available on Windows */ });
app.on('before-quit', () => { quitting = true; services.database.close(); });
app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('activate', () => showWindow());
