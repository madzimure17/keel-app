// Small building blocks: bottom sheet, hold-to-confirm button, number stepper, segmented control, icons, toasts.
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { haptic } from '../native';
import { useStore } from '../store';

export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="sheet-grab" />
        <div className="row sheet-hdr"><div className="sheet-title">{title}</div>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><I.x /></button></div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

/** Press and hold for `ms` to fire: no accidental trades from a stray tap. */
export function Hold({ children, onDone, kind = 'primary', ms = 650, disabled }: {
  children: ReactNode; onDone: () => void; kind?: 'primary' | 'danger' | 'sell' | 'plain'; ms?: number; disabled?: boolean;
}) {
  const [p, setP] = useState(0);
  const t = useRef<number | null>(null);
  const t0 = useRef(0);
  const stop = () => { if (t.current) cancelAnimationFrame(t.current); t.current = null; setP(0); };
  const tick = () => {
    const k = Math.min(1, (Date.now() - t0.current) / ms);
    setP(k);
    if (k >= 1) { stop(); haptic.heavy(); onDone(); return; }
    t.current = requestAnimationFrame(tick);
  };
  return (
    <button className={`btn hold ${kind}`} disabled={disabled}
      onPointerDown={(e) => { e.preventDefault(); if (disabled) return; haptic.tap(); t0.current = Date.now(); t.current = requestAnimationFrame(tick); }}
      onPointerUp={stop} onPointerLeave={stop} onPointerCancel={stop} onContextMenu={(e) => e.preventDefault()}>
      <span className="fill" style={{ transform: `scaleX(${p})` }} />
      <span className="lbl">{children}</span>
      <span className="hint">hold</span>
    </button>
  );
}

export function Stepper({ value, onChange, step, min, max, digits, label, suffix, placeholder }: {
  value: number | null; onChange: (v: number | null) => void; step: number; min?: number; max?: number; digits: number;
  label?: ReactNode; suffix?: ReactNode; placeholder?: string;
}) {
  const [txt, setTxt] = useState(value == null ? '' : value.toFixed(digits));
  const focused = useRef(false);
  useEffect(() => { if (!focused.current) setTxt(value == null ? '' : value.toFixed(digits)); }, [value, digits]);
  const clamp = (v: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
  const bump = (k: number) => {
    haptic.tap();
    const base = value ?? (min != null && min > 0 ? min : 0);
    onChange(clamp(Number((base + k * step).toFixed(Math.max(digits, 8)))));
  };
  return (
    <div className="stepper">
      {label && <div className="lab">{label}</div>}
      <div className="row stepper-row">
        <button className="step-btn" onClick={() => bump(-1)} aria-label="less">−</button>
        <input className="step-in mono" inputMode="decimal" value={txt} placeholder={placeholder || '—'}
          onFocus={() => { focused.current = true; }}
          onBlur={() => { focused.current = false; setTxt(value == null ? '' : value.toFixed(digits)); }}
          onChange={(e) => {
            const s = e.target.value.replace(',', '.');
            setTxt(s);
            if (s.trim() === '') onChange(null);
            else if (isFinite(Number(s))) onChange(clamp(Number(s)));
          }} />
        <button className="step-btn" onClick={() => bump(1)} aria-label="more">+</button>
      </div>
      {suffix && <div className="muted small">{suffix}</div>}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange }: { value: T; options: [T, ReactNode][]; onChange: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map(([v, l]) => (
        <button key={v} className={v === value ? 'on' : ''} onClick={() => { haptic.tap(); onChange(v); }}>{l}</button>
      ))}
    </div>
  );
}

export function Toggle({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button className={`toggle ${on ? 'on' : ''}`} disabled={disabled} role="switch" aria-checked={on}
      onClick={() => { haptic.tap(); onChange(!on); }}><span /></button>
  );
}

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <b>{t.title}</b>{t.body && <div>{t.body}</div>}
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) { return <div className="empty">{children}</div>; }

const sv = (d: ReactNode) => (p: { s?: number }) => (
  <svg width={p.s || 22} height={p.s || 22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
export const I = {
  home: sv(<><path d="M3 11l9-7 9 7" /><path d="M5 10v10h14V10" /></>),
  chart: sv(<><path d="M4 20V4" /><path d="M4 20h16" /><rect x="7" y="9" width="3" height="7" /><rect x="13" y="6" width="3" height="8" /><path d="M8.5 6v3M8.5 16v2M14.5 3v3M14.5 14v3" /></>),
  setups: sv(<><path d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.4 6.8 19.1l1-5.8L3.5 9.2l5.9-.9z" /></>),
  pos: sv(<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M8 15h3" /></>),
  more: sv(<><circle cx="5" cy="12" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="19" cy="12" r="1.5" /></>),
  x: sv(<><path d="M6 6l12 12M18 6L6 18" /></>),
  back: sv(<><path d="M15 5l-7 7 7 7" /></>),
  go: sv(<><path d="M9 5l7 7-7 7" /></>),
  play: sv(<><path d="M7 5l12 7-12 7z" /></>),
  pause: sv(<><path d="M8 5v14M16 5v14" /></>),
  bell: sv(<><path d="M6 16V11a6 6 0 0112 0v5l2 2H4z" /><path d="M10 20a2 2 0 004 0" /></>),
  term: sv(<><path d="M4 6l6 6-6 6" /><path d="M12 18h8" /></>),
  gear: sv(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" /></>),
  link: sv(<><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>),
  list: sv(<><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>),
  shield: sv(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /></>),
  book: sv(<><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 19V5" /></>),
  refresh: sv(<><path d="M20 11a8 8 0 10-2.3 5.7" /><path d="M20 4v7h-7" /></>),
};
