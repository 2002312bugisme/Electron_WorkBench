import { contextBridge, ipcRenderer } from 'electron';
import type { WorkbenchApi } from './shared/types';

const listen = (channel: string, listener: (...args: any[]) => void) => { const wrapped = (_: unknown, ...args: any[]) => listener(...args); ipcRenderer.on(channel, wrapped); return () => ipcRenderer.removeListener(channel, wrapped); };
const api: WorkbenchApi = {
  auth: { state: () => ipcRenderer.invoke('auth:state'), setup: (password) => ipcRenderer.invoke('auth:setup', password), unlock: (password) => ipcRenderer.invoke('auth:unlock', password), lock: () => ipcRenderer.invoke('auth:lock') },
  tasks: { list: (search) => ipcRenderer.invoke('tasks:list', search), save: (input) => ipcRenderer.invoke('tasks:save', input), remove: (id) => ipcRenderer.invoke('tasks:remove', id), complete: (id) => ipcRenderer.invoke('tasks:complete', id), move: (id, status) => ipcRenderer.invoke('tasks:move', id, status) },
  notes: { list: (search) => ipcRenderer.invoke('notes:list', search), get: (id) => ipcRenderer.invoke('notes:get', id), save: (input) => ipcRenderer.invoke('notes:save', input), remove: (id) => ipcRenderer.invoke('notes:remove', id), attach: (id) => ipcRenderer.invoke('notes:attach', id) },
  prompts: { list: (search) => ipcRenderer.invoke('prompts:list', search), categories: () => ipcRenderer.invoke('prompts:categories'), save: (input) => ipcRenderer.invoke('prompts:save', input), remove: (id) => ipcRenderer.invoke('prompts:remove', id), use: (id, values) => ipcRenderer.invoke('prompts:use', id, values) },
  focus: { active: () => ipcRenderer.invoke('focus:active'), start: (taskId, kind) => ipcRenderer.invoke('focus:start', taskId, kind), pause: () => ipcRenderer.invoke('focus:pause'), finish: (abandoned) => ipcRenderer.invoke('focus:finish', abandoned) },
  dashboard: { get: () => ipcRenderer.invoke('dashboard:get') }, reports: { weekly: () => ipcRenderer.invoke('reports:weekly'), saveWeekly: () => ipcRenderer.invoke('reports:save-weekly'), copy: (text) => ipcRenderer.invoke('reports:copy', text) }, backup: { export: () => ipcRenderer.invoke('backup:export'), restore: () => ipcRenderer.invoke('backup:restore') },
  shell: { openExternal: (url) => ipcRenderer.invoke('shell:open-external', url), quickCreate: (type) => ipcRenderer.invoke('shell:quick-create', type) },
  events: { onNavigate: (listener) => listen('event:navigate', listener), onFocusChanged: (listener) => listen('event:focus-changed', listener), onLocked: (listener) => listen('event:locked', listener) },
};
contextBridge.exposeInMainWorld('workbench', api);
