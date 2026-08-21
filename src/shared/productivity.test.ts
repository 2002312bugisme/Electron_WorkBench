import { describe, expect, it } from 'vitest';
import { isPathWithinRoot } from './path-safety';
import { habitStreak, taskQuadrant } from './productivity';

describe('local productivity rules', () => {
  it('derives all four Eisenhower quadrants from one task', () => {
    expect(taskQuadrant({ important: true, urgent: true })).toBe('11');
    expect(taskQuadrant({ important: true, urgent: false })).toBe('10');
    expect(taskQuadrant({ important: false, urgent: true })).toBe('01');
    expect(taskQuadrant({ important: false, urgent: false })).toBe('00');
  });
  it('counts consecutive completed habit days backwards from today', () => {
    expect(habitStreak('h1', [{ habitId: 'h1', day: '2026-08-21', completed: true }, { habitId: 'h1', day: '2026-08-20', completed: true }, { habitId: 'h1', day: '2026-08-19', completed: false }], new Date('2026-08-21T12:00:00'))).toBe(2);
  });
  it('rejects paths outside an authorised root', () => {
    expect(isPathWithinRoot('D:\\Work', 'D:\\Work\\notes\\a.md')).toBe(true);
    expect(isPathWithinRoot('D:\\Work', 'D:\\Elsewhere\\secret.txt')).toBe(false);
  });
});
