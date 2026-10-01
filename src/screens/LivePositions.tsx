import { useEffect, useState } from 'react';
import type { LiveSnapshot } from '../api';
import { Empty } from '../components/ui';
import { cls, money, px } from '../fmt';
import { useStore } from '../store';

export default function LivePositions() {
  const api = useStore((s) => s.api);
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const load = () => api.liveSnapshot().then(setSnap).catch(() => {});
  useEffect(() => { load(); const h = setInterval(load, 3000); return () => clearInterval(h); }, [api]);
  const pos = snap?.positions || [];
  const total = pos.reduce((n, p) => n + (p.profit || 0), 0);
  return <div className="screen"><div className="hdr"><div className="title">Positions</div><b className={`mono ${cls(total)}`}>{money(total)}</b></div>
    <div className="card flush">{pos.map((p) => {
      const row = snap?.symbols.find((s) => s.symbol === p.symbol); const d = row?.digits ?? 2;
      return <div className="pad bb" key={p.ticket}><div className="row"><span><span className={`pill ${p.side === 'BUY' ? 'buy' : 'sell'}`}>{p.side}</span> <b>{p.symbol}</b> <span className="muted mono">{p.volume}</span></span><b className={cls(p.profit)}>{money(p.profit)}</b></div><div className="small muted mono mt4">#{p.ticket} · {px(p.entry, d)} → {px(p.price, d)} · SL {px(p.sl, d)} · TP {px(p.tp, d)}</div></div>;
    })}{!pos.length && <Empty>No open positions on account {snap?.account?.login || '—'}.</Empty>}</div>
    {!!snap?.pending_orders?.length && <><div className="row sec-hdr"><b>Pending KL limits</b><span className="muted small">{snap.pending_orders.length}</span></div><div className="card flush">{snap.pending_orders.map((o: any) => <div className="pad bb small" key={o.ticket}><div className="row"><b>{o.symbol} {o.side}</b><span>{o.volume} @ {o.price}</span></div><div className="muted">{o.comment} · SL {o.sl} · TP {o.tp}</div></div>)}</div></>}
    <div className="muted small mt12">Open positions are managed only by Keel's TP/SL rules. The only manual control is Cancel all pending on the Controls screen.</div>
  </div>;
}
