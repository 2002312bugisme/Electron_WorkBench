import type { GtdStage, HabitDay, Task } from './types';

export const gtdLabels: Record<GtdStage, string> = { inbox: '收集箱', next: '下一步行动', waiting: '等待', someday: '将来 / 也许' };
export const taskQuadrant = (task: Pick<Task, 'important' | 'urgent'>) => `${Number(task.important)}${Number(task.urgent)}` as '11' | '10' | '01' | '00';
export const habitStreak = (habitId: string, entries: HabitDay[], today: Date = new Date()) => {
  const completed = new Set(entries.filter((entry) => entry.habitId === habitId && entry.completed).map((entry) => entry.day)); let streak = 0; const cursor = new Date(today);
  while (true) { const day = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(cursor.getDate()).padStart(2, '0')}`; if (!completed.has(day)) return streak; streak += 1; cursor.setDate(cursor.getDate() - 1); }
};
