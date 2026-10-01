// Open positions (manage each one), pending orders, closed-trade history, and "close everything".
import { useEffect, useState } from 'react';
import type { Order, Trade } from '../api';
import { GroupRow, GroupSheet, PositionSheet, PosRow } from '../components/Trade';
import { Empty, Hold, Seg } from '../components/ui';
import { cls, lotsStr, money, px, serverToUtc, side, signed, when } from '../fmt';
import { go, run, symInfo, useStore } from '../store';

export default function Positions() {
  const st = useStore((s) => s.state);
  const api = useStore((s) => s.api);
  const route = useStore((s) => s.route);
  const [tab, setTab] = useState<'open' | 'history'>(route.sub === 'history' ? 'history' : 'open');
  const [sel, setSel] = useState<number | null>(null);
  const [gsel, setGsel] = useState<string | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [hist, setHist] = useState<Trade[]>([]);
  useEffect(() => { setTab(route.sub === 'history' ? 'history' : 'open'); }, [route.sub]);
  useEffect(() => {
    const f = () => { api.orders().then(setOrders).catch(() => {}); if (tab === 'history') api.trades(300).then(setHist).catch(() => {}); };
    f();
    const h = setInterval(f, 6000);
    return () => clearInterval(h);
  }, [api, tab]);
  const pos = st?.positions || [];
  const groups = st?.groups || [];
  const singles = pos.filter((p) => !p.group_id || !groups.find((g) => g.gid === p.group_id));
  const cur = st?.account.currency || '';
  const total = pos.reduce((s, p) => s + (p.profit || 0), 0);
  const wins = hist.filter((t) => (t.profit || 0) > 0).length;
  const net = hist.reduce((s, t) => s + (t.profit || 0), 0);

  return (
    <div className="screen">
      <div className="hdr"><div className="title">Positions</div>
        <button className="link" onClick={() => go({ tab: 'chart' })}>+ New trade</button></div>
      <Seg value={tab} onChange={setTab} options={[['open', `Open ${groups.length + singles.length}`], ['history', 'History']]} />
      {tab === 'open' ? (
        <>
          <div className="row mt12"><span className="muted">Floating P/L</span><b className={`mono ${cls(total)}`}>{money(total, cur)}</b></div>
          <div className="card flush mt8">
            {groups.map((g) => <GroupRow key={g.gid} g={g} onTap={() => setGsel(g.gid)} />)}
            {singles.map((p) => <PosRow key={p.ticket} p={p} onTap={() => setSel(p.ticket)} />)}
            {!pos.length && <Empty>No open positions.</Empty>}
          </div>
          {!!st?.external?.length && (
            <>
              <div className="row sec-hdr"><b>Opened outside Keel</b><span className="muted small">by hand in MT5</span></div>
              <div className="card flush">{st.external.map((x) => (
                <div key={x.ticket} className="pad bb">
                  <div className="row"><span><span className={`pill ${x.side === 'BUY' ? 'buy' : 'sell'}`}>{x.side}</span> <b>{x.symbol}</b> <span className="muted mono">{lotsStr(x.lots)} @ {px(x.entry, symInfo(x.symbol)?.digits)}</span></span>
                    <b className={`mono ${cls(x.profit)}`}>{money(x.profit, cur)}</b></div>
                  <div className="muted small mt4 mono">SL {x.sl ? px(x.sl, symInfo(x.symbol)?.digits) : 'none'} · TP {x.tp ? px(x.tp, symInfo(x.symbol)?.digits) : 'none (Keel uses its day plan target)'}</div>
                  <div className="muted small mt4">Keel will close a third at 35 % of the way to TP, move the stop to breakeven, close a third at 65 % and move the stop to TP1, then trail the last third to the TP.</div>
                  <div className="mt8"><Hold kind="primary" onDone={() => run('adopt', { ticket: x.ticket }, `Keel now manages #${x.ticket}`)}>Let Keel manage it</Hold></div>
                </div>))}
              </div>
            </>
          )}
          {pos.length > 0 && <div className="muted small">Tap a trade to close it (all its positions or one), move the stop for all, go breakeven, or manage one position: close part of it, add, change lots, SL/TP.</div>}
          {orders.length > 0 && (
            <>
              <div className="row sec-hdr"><b>Pending orders</b></div>
              <div className="card flush">{orders.map((o) => (
                <div key={o.ticket} className="list-item pad">
                  <div><b>{o.symbol}</b> {o.side} {o.kind.toUpperCase()} <span className="mono">{lotsStr(o.lots)} @ {px(o.price, symInfo(o.symbol)?.digits)}</span></div>
                  <button className="btn small-btn w-auto" onClick={() => run('cancel_order', { ticket: o.ticket }, 'Order cancelled')}>Cancel</button>
                </div>))}
              </div>
            </>
          )}
          {pos.length > 0 && (
            <div className="mt16">
              <Hold kind="danger" ms={1200} onDone={() => run('close_all', { confirm: true }, 'Closing all positions')}>Close ALL ({pos.length} positions)</Hold>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="grid3 mt12">
            <div><div className="lab">Trades</div><b className="mono">{hist.length}</b></div>
            <div><div className="lab">Won</div><b className="mono">{hist.length ? Math.round(100 * wins / hist.length) : 0}%</b></div>
            <div><div className="lab">Net</div><b className={`mono ${cls(net)}`}>{money(net)}</b></div>
          </div>
          <div className="card flush mt8">
            {hist.map((t) => (
              <div key={t.ticket} className="pad bb">
                <div className="row"><span><span className={`pill ${t.direction > 0 ? 'buy' : 'sell'}`}>{side(t.direction)}</span> <b>{t.symbol}</b> <span className="muted mono">{lotsStr(t.lots)}</span></span>
                  <b className={`mono ${cls(t.profit)}`}>{money(t.profit)}</b></div>
                <div className="row muted small mt4"><span>{t.strategy} · {t.reason}</span><span className="mono">{t.R != null ? signed(t.R) + ' R' : ''}</span></div>
                <div className="muted small">{when(serverToUtc(t.opened_t), true)} → {when(serverToUtc(t.closed_t), true)}</div>
              </div>
            ))}
            {!hist.length && <Empty>No closed trades yet.</Empty>}
          </div>
        </>
      )}
      <GroupSheet gid={gsel} onClose={() => setGsel(null)} onLeg={(t) => { setGsel(null); setSel(t); }} />
      <PositionSheet ticket={sel} onClose={() => setSel(null)} />
    </div>
  );
}
