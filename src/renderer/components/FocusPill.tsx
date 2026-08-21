import { useEffect, useState } from 'react';
import type { FocusSession } from '../../shared/types';

export function FocusPill({ focus, refreshed }: { focus: FocusSession | null; refreshed: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => { const tick = () => { if (!focus) return setSeconds(0); const elapsed = focus.pausedAt ? new Date(focus.pausedAt).getTime() - new Date(focus.startedAt).getTime() : Date.now() - new Date(focus.startedAt).getTime(); setSeconds(Math.max(0, focus.plannedSeconds - Math.floor(elapsed / 1000) + focus.pausedSeconds)); }; tick(); const timer = window.setInterval(tick, 1000); return () => window.clearInterval(timer); }, [focus]);
  const toggle = async () => { if (!focus) await window.workbench.focus.start(); else await window.workbench.focus.pause(); refreshed(); };
  if (!focus) return <button className="focus-pill" onClick={toggle}>◉ 开始番茄钟</button>;
  return <div className="focus-pill active"><button onClick={toggle}>{focus.pausedAt ? '▶ 继续' : 'Ⅱ 暂停'} {String(Math.floor(seconds / 60)).padStart(2, '0')}:{String(seconds % 60).padStart(2, '0')}</button><button title="结束" onClick={async () => { await window.workbench.focus.finish(); refreshed(); }}>×</button></div>;
}
