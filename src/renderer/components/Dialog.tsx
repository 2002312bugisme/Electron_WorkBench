import type { ReactNode } from 'react';

export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="dialog-backdrop" onMouseDown={onClose}><section className="dialog" onMouseDown={(event) => event.stopPropagation()}><header><h3>{title}</h3><button className="quiet" onClick={onClose}>×</button></header>{children}</section></div>;
}
