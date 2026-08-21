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
export interface WeeklyReport { markdown: string; completed: Task[]; pending: Task[]; focusSeconds: number; projectStats: Array<{ name: string; count: number }> }
export interface Habit { id: string; name: string; color: string; targetDays: number; archived: boolean; createdAt: string }
export interface HabitDay { habitId: string; day: string; completed: boolean }
export interface HydrationSettings { dailyGoal: number; reminderMinutes: number }
export interface HydrationDay { day: string; amount: number; goal: number }
export interface FileRoot { id: string; path: string; name: string; enabled: boolean; lastIndexedAt: string | null; createdAt: string }
export interface IndexedFile { id: string; rootId: string; path: string; name: string; extension: string; size: number; modifiedAt: string }
export interface CalendarData { tasks: Task[]; habits: Habit[]; habitDays: HabitDay[] }
export interface SetupState { configured: boolean; unlocked: boolean }
export interface CreateTaskInput { title: string; description?: string; status?: TaskStatus; priority?: TaskPriority; projectId?: string | null; tagIds?: string[]; dueAt?: string | null; reminderAt?: string | null; repeatRule?: RepeatRule; gtdStage?: GtdStage; important?: boolean; urgent?: boolean }
export interface CreateNoteInput { title: string; content?: string; projectId?: string | null; tagIds?: string[] }
export interface CreatePromptInput { title: string; body: string; categoryId?: string | null; tagIds?: string[]; favorite?: boolean }

export interface WorkbenchApi {
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
  shell: { openExternal(url: string): Promise<void>; quickCreate(type: 'task' | 'note'): Promise<void> };
  events: { onNavigate(listener: (route: string) => void): () => void; onFocusChanged(listener: () => void): () => void; onLocked(listener: () => void): () => void };
}

declare global { interface Window { workbench: WorkbenchApi } }
