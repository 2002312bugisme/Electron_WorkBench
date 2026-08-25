export type TaskStatus = 'todo' | 'in_progress' | 'done';
export type TaskPriority = 'high' | 'medium' | 'low';
export type RepeatRule = 'none' | 'daily' | 'weekly' | 'monthly';
export type GtdStage = 'inbox' | 'next' | 'waiting' | 'someday';

export interface Project { id: string; name: string; color: string; createdAt: string }
export interface Tag { id: string; name: string; color: string; createdAt: string }
export interface Task {
  id: string; title: string; description: string; status: TaskStatus; priority: TaskPriority;
  projectId: string | null; projectName?: string | null; tags: Tag[]; dueAt: string | null;
  reminderAt: string | null; repeatRule: RepeatRule; completedAt: string | null; createdAt: string; updatedAt: string;
  gtdStage: GtdStage; important: boolean; urgent: boolean;
}
export interface Note {
  id: string; title: string; content: string; projectId: string | null; projectName?: string | null;
  tags: Tag[]; createdAt: string; updatedAt: string;
}
export interface PromptCategory { id: string; name: string; sortOrder: number; createdAt: string }
export interface PromptTemplate {
  id: string; title: string; body: string; categoryId: string | null; categoryName?: string | null;
  tags: Tag[]; favorite: boolean; usageCount: number; lastUsedAt: string | null; createdAt: string; updatedAt: string;
}
export interface FocusSession {
  id: string; taskId: string | null; taskTitle?: string | null; kind: 'focus' | 'break';
  plannedSeconds: number; startedAt: string; pausedAt: string | null; pausedSeconds: number; endedAt: string | null; abandoned: boolean;
}
export interface Dashboard {
  todayTasks: Task[]; overdueTasks: Task[]; recentNotes: Note[]; favoritePrompts: PromptTemplate[];
  weekFocusSeconds: number; activeFocus: FocusSession | null;
}
export interface WeeklyReport { markdown: string; completed: Task[]; pending: Task[]; focusSeconds: number; projectStats: Array<{ name: string; count: number }>; tagStats: Array<{ name: string; count: number }> }
export interface Habit { id: string; name: string; color: string; targetDays: number; archived: boolean; createdAt: string }
export interface HabitDay { habitId: string; day: string; completed: boolean }
export interface HydrationSettings { dailyGoal: number; reminderMinutes: number }
export interface HydrationDay { day: string; amount: number; goal: number }
export interface FileRoot { id: string; path: string; name: string; enabled: boolean; lastIndexedAt: string | null; createdAt: string }
export interface IndexedFile { id: string; rootId: string; path: string; name: string; extension: string; size: number; modifiedAt: string }
export interface CalendarData { tasks: Task[]; habits: Habit[]; habitDays: HabitDay[] }
export interface SetupState { configured: boolean; unlocked: boolean }
export interface AppInfo { name: string; version: string; dataDirectory: string }
export interface RssFeed { id: string; title: string; url: string; groupName: string; enabled: boolean; lastFetchedAt: string | null; lastError: string | null; createdAt: string }
export interface RssEntry { id: string; feedId: string; feedTitle?: string; guid: string; title: string; link: string; summary: string; publishedAt: string | null; read: boolean; starred: boolean; createdAt: string }
export type MailProvider = 'qq' | '163' | '126' | 'yeah';
export interface MailSettings { configured: boolean; provider: MailProvider | null; sender: string | null; scheduleDay: number; scheduleHour: number; lastSentWeek: string | null }
export interface MailSettingsInput { provider: MailProvider; sender: string; authorizationCode: string; scheduleDay?: number; scheduleHour?: number }
export interface RemoteBackupConfig { configured: boolean; region: string | null; endpoint: string | null; bucket: string | null; prefix: string; lastAutoBackupDay: string | null }
export interface RemoteBackupInput { region: string; endpoint: string; bucket: string; accessKeyId: string; accessKeySecret: string }
export interface RemoteBackupItem { key: string; name: string; size: number; modifiedAt: string; automatic: boolean }
export interface ReleaseInfo { available: boolean; currentVersion: string; version: string | null; name: string | null; notes: string | null; publishedAt: string | null; assetName: string | null; error?: string }
export interface CreateTaskInput { title: string; description?: string; status?: TaskStatus; priority?: TaskPriority; projectId?: string | null; tagIds?: string[]; dueAt?: string | null; reminderAt?: string | null; repeatRule?: RepeatRule; gtdStage?: GtdStage; important?: boolean; urgent?: boolean }
export interface CreateNoteInput { title: string; content?: string; projectId?: string | null; tagIds?: string[] }
export interface CreatePromptInput { title: string; body: string; categoryId?: string | null; tagIds?: string[]; favorite?: boolean }

export interface WorkbenchApi {
  app: { info(): Promise<AppInfo> };
  auth: { state(): Promise<SetupState>; setup(password: string): Promise<void>; unlock(password: string): Promise<void>; lock(): Promise<void> };
  tasks: { list(search?: string): Promise<Task[]>; save(input: CreateTaskInput & { id?: string }): Promise<Task>; remove(id: string): Promise<void>; complete(id: string): Promise<Task>; move(id: string, status: TaskStatus): Promise<Task> };
  projects: { list(): Promise<Project[]>; save(input: Omit<Project, 'id' | 'createdAt'> & { id?: string }): Promise<Project>; remove(id: string): Promise<void> };
  tags: { list(): Promise<Tag[]>; save(input: Omit<Tag, 'id' | 'createdAt'> & { id?: string }): Promise<Tag>; remove(id: string): Promise<void> };
  notes: { list(search?: string): Promise<Note[]>; get(id: string): Promise<Note | null>; save(input: CreateNoteInput & { id?: string }): Promise<Note>; remove(id: string): Promise<void>; attach(noteId: string): Promise<string | null>; openAttachment(id: string): Promise<void> };
  prompts: { list(search?: string): Promise<PromptTemplate[]>; categories(): Promise<PromptCategory[]>; save(input: CreatePromptInput & { id?: string }): Promise<PromptTemplate>; remove(id: string): Promise<void>; use(id: string, values: Record<string, string>): Promise<string> };
  focus: { active(): Promise<FocusSession | null>; start(taskId?: string | null, kind?: 'focus' | 'break'): Promise<FocusSession>; pause(): Promise<FocusSession | null>; finish(abandoned?: boolean): Promise<FocusSession | null> };
  dashboard: { get(): Promise<Dashboard> };
  reports: { weekly(): Promise<WeeklyReport>; saveWeekly(): Promise<string | null>; copy(text: string): Promise<void> };
  backup: { export(): Promise<string | null>; restore(): Promise<void> };
  calendar: { get(month: string): Promise<CalendarData> };
  habits: { list(): Promise<Habit[]>; save(input: Omit<Habit, 'id' | 'createdAt' | 'archived'> & { id?: string }): Promise<Habit>; remove(id: string): Promise<void>; toggle(id: string, day: string): Promise<HabitDay>; days(month: string): Promise<HabitDay[]> };
  hydration: { get(day: string): Promise<HydrationDay>; add(amount?: number): Promise<HydrationDay>; settings(): Promise<HydrationSettings>; saveSettings(input: HydrationSettings): Promise<HydrationSettings> };
  files: { roots(): Promise<FileRoot[]>; addRoot(): Promise<FileRoot | null>; removeRoot(id: string): Promise<void>; rescan(): Promise<void>; search(query: string): Promise<IndexedFile[]>; open(id: string): Promise<void> };
  rss: { feeds(): Promise<RssFeed[]>; saveFeed(input: { id?: string; url: string; groupName?: string; enabled?: boolean }): Promise<RssFeed>; removeFeed(id: string): Promise<void>; refresh(id?: string): Promise<void>; entries(input?: { search?: string; feedId?: string; unreadOnly?: boolean; starredOnly?: boolean }): Promise<RssEntry[]>; markRead(id: string, read: boolean): Promise<void>; toggleStar(id: string): Promise<void> };
  mail: { settings(): Promise<MailSettings>; saveSettings(input: MailSettingsInput): Promise<MailSettings>; test(): Promise<void>; sendWeekly(): Promise<void>; clear(): Promise<void> };
  remoteBackup: { config(): Promise<RemoteBackupConfig>; saveConfig(input: RemoteBackupInput): Promise<RemoteBackupConfig>; test(): Promise<void>; backup(automatic?: boolean): Promise<RemoteBackupItem>; list(search?: string): Promise<RemoteBackupItem[]>; restore(key: string): Promise<void>; clear(): Promise<void> };
  updates: { check(): Promise<ReleaseInfo>; download(): Promise<string | null> };
  shell: { openExternal(url: string): Promise<void>; quickCreate(type: 'task' | 'note'): Promise<void> };
  events: { onNavigate(listener: (route: string) => void): () => void; onFocusChanged(listener: () => void): () => void; onLocked(listener: () => void): () => void };
}

declare global { interface Window { workbench: WorkbenchApi } }
