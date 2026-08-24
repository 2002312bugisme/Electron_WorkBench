import type { ReactNode } from 'react';

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="dialog" role="dialog" aria-modal="true" aria-label={title}><header><h3>{title}</h3><button className="quiet" type="button" aria-label="关闭" onClick={onClose}>×</button></header>{children}</section></div>;
}
