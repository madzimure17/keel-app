// One setup, in plain words: what Keel saw, what it did, and why.
import type { Setup } from '../api';
import { px, side, when } from '../fmt';
import { symInfo, useStore } from '../store';

const STATUS: Record<string, [string, string]> = {
  TAKEN: ['Taken', 'buy'], SKIPPED: ['Skipped', ''], FAILED: ['Order failed', 'sell'], PENDING: ['Order waiting', 'brass'],
};

export function explainWhy(s: Setup) {
  const w = s.why || '';
  if (s.status === 'TAKEN') return s.strategy === 'MANUAL' ? 'You placed it from the app.' : 'All conditions met; Keel sent the order to MT5.';
  if (s.status === 'PENDING') return `A ${w || 'pending order'} is waiting at the broker.`;
  if (s.status === 'FAILED') return `MT5 refused the order: ${w}`;
  if (/news/i.test(w)) return `Not taken: high-impact news blackout (${w.replace(/^news:\s*/i, '')}).`;
  if (/minimum|min lot|broker min/i.test(w)) return `Not taken: your risk buys less than the broker's minimum lot (${w}). Raise the risk %, switch on "minimum lot", or use fixed lots.`;
  if (/max|open positions/i.test(w)) return `Not taken: you are at your maximum number of open positions (${w}).`;
  if (/paused/i.test(w)) return 'Not taken: Keel was paused. Start it on the Home tab to trade these.';
  if (/switched off/i.test(w)) return 'Not taken: this strategy is switched off for this symbol (More → Strategies).';
  if (/margin/i.test(w)) return `Not taken: ${w}.`;
  return w ? `Not taken: ${w}.` : '';
}

export default function SetupCard({ s, onOpen, compact }: { s: Setup; onOpen?: () => void; compact?: boolean }) {
  const info = useStore((x) => x.info);
  const d = symInfo(s.symbol)?.digits ?? 5;
  const strat = info?.strategies.find((x) => x.name === s.strategy);
  const [label, c] = STATUS[s.status] || [s.status, ''];
  const risk = s.sl != null ? Math.abs(s.entry - s.sl) : null;
  const rr = risk && s.tp != null ? Math.abs(s.tp - s.entry) / risk : null;
  return (
    <div className={`setup ${s.status.toLowerCase()}`} onClick={onOpen} role={onOpen ? 'button' : undefined}>
      <div className="row">
        <div>
          <span className={`pill ${s.direction > 0 ? 'buy' : 'sell'}`}>{side(s.direction)}</span>{' '}
          <b>{s.symbol}</b> <span className="pill">{s.style}{s.tf && s.style !== 'MANUAL' ? ' ' + s.tf : ''}</span>
        </div>
        <span className={`pill ${c}`}>{label}</span>
      </div>
      <div className="setup-title">{strat?.title || s.strategy}</div>
      <div className="setup-reason">{s.reason}</div>
      {!compact && <div className={`setup-why ${c}`}>{explainWhy(s)}</div>}
      {s.tp1 != null && s.tp3 != null ? (
        <div className="row mono small muted mt4">
          <span>@ {px(s.entry, d)}</span><span>SL {px(s.sl, d)}</span>
          <span>TP1 {px(s.tp1, d)}</span><span>TP2 {px(s.tp2 ?? null, d)}</span><span>TP3 {px(s.tp3, d)}</span>
        </div>
      ) : (
        <div className="row mono small muted mt4">
          <span>@ {px(s.entry, d)}</span><span>SL {px(s.sl, d)}</span><span>TP {px(s.tp, d)}</span>
          <span>{rr ? rr.toFixed(1) + ' R' : ''}</span>
        </div>
      )}
      <div className="row small muted mt4"><span>{when(s.utc, true)}</span><span>{s.legs && s.legs > 1 ? `${s.legs} positions · ` : ''}{s.lots ? `${s.lots} lots` : ''}{s.ticket ? ` · #${s.ticket}` : ''}</span></div>
    </div>
  );
}
