// A symbol's chart with everything Keel knows about it: your zones, setups, positions, orders, and a trade ticket.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Candles, Overlay, Setup } from '../api';
import Chart, { type Line, type Marker } from '../components/Chart';
import SetupCard from '../components/SetupCard';
import { GroupRow, GroupSheet, newTicket, PositionSheet, PosRow, TicketPanel, type Ticket } from '../components/Trade';
import { Empty, Hold, Seg, Sheet } from '../components/ui';
import { lotsStr, px, when } from '../fmt';
import { get, run, setChart, symInfo, takePrefill, useStore } from '../store';

const TFS = ['M1', 'M5', 'M15', 'M30', 'H1', 'H4', 'D1'] as const;
const TF_SEC: Record<string, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 };
type Layers = { zones: boolean; setups: boolean; trades: boolean };

export default function ChartScreen() {
  const { symbol, tf } = useStore((s) => s.chart);
  const symbols = useStore((s) => s.symbols);
  const api = useStore((s) => s.api);
  const route = useStore((s) => s.route);
  const positionsAll = useStore((s) => s.state?.positions);
  const [c, setC] = useState<Candles | null>(null);
  const [ov, setOv] = useState<Overlay | null>(null);
  const [err, setErr] = useState('');
  const [ticket, setTicket] = useState<(Ticket & { note?: string }) | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [setup, setSetup] = useState<Setup | null>(null);
  const [move, setMove] = useState<{ ticket: number; which: 'sl' | 'tp'; price: number; group?: string } | null>(null);
  const [gsel, setGsel] = useState<string | null>(null);
  const groupsAll = useStore((s) => s.state?.groups);
  const [layers, setLayers] = useState<Layers>({ zones: true, setups: true, trades: true });
  const [zoneStyle, setZoneStyle] = useState<'ALL' | 'SCALP' | 'DAY' | 'SWING'>('ALL');
  const key = `${symbol}|${tf}`;
  const keyRef = useRef(key);
  keyRef.current = key;

  const load = useCallback(async () => {
    const k = `${symbol}|${tf}`;
    try {
      const [cc, oo] = await Promise.all([api.candles(symbol, tf, 400), api.overlay(symbol)]);
      if (keyRef.current !== k) return;
      setC(cc); setOv(oo); setErr('');
    } catch (e: any) { if (keyRef.current === k) setErr(e.message); }
  }, [api, symbol, tf]);

  useEffect(() => { setC(null); setOv(null); load(); const h = setInterval(load, 4000); return () => clearInterval(h); }, [load]);
  useEffect(() => { if (route.focus) setSel(route.focus); }, [route.focus]);
  useEffect(() => {
    setTicket(null); setMove(null); setSetup(null);
    const pf = takePrefill();                                 // "Trade this" from the Analysis screen
    const sy = pf && symInfo(pf.symbol);
    if (pf && sy && pf.symbol === symbol) {
      const base = newTicket(sy, pf.side, pf.price ?? pf.sl, Math.abs((pf.price ?? pf.tp1) - pf.sl) || sy.point * 100,
        get().state?.risk.risk_per_trade_pct ?? 0.5);
      setTicket({ ...base, kind: pf.kind, price: pf.price, sl: pf.sl, tp: pf.tp1, tp2: pf.tp2, tp3: pf.tp3,
        multi: pf.kind === 'market', note: pf.note } as Ticket);
    }
  }, [symbol]);

  const sym = symInfo(symbol);
  const digits = c?.digits ?? sym?.digits ?? 5;
  const bars = c?.bars || [];
  const bid = ov?.bid ?? null, ask = ov?.ask ?? null;
  const positions = (positionsAll || []).filter((p) => p.symbol === symbol);
  const groups = (groupsAll || []).filter((g) => g.symbol === symbol);
  const singles = positions.filter((p) => !p.group_id || !groups.find((g) => g.gid === p.group_id));

  const atr = useMemo(() => {
    const b = bars.slice(-15);
    return b.length ? b.reduce((s, x) => s + (x[2] - x[3]), 0) / b.length : 0;
  }, [bars]);

  const openTicket = (dir: 1 | -1) => {
    if (!sym) return;
    const last = (dir > 0 ? ask : bid) ?? bars[bars.length - 1]?.[4];
    if (!last) return;
    const riskPct = get().state?.risk.risk_per_trade_pct ?? 0.5;
    setTicket(newTicket(sym, dir, last, atr || last * 0.001, riskPct));
  };

  const lines: Line[] = [];
  const col = { buy: 'var(--buy)', sell: 'var(--sell)' };
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const C = { buy: css('--buy') || '#2FB5A0', sell: css('--sell') || '#E4696F', brass: css('--brass') || '#C9A24B', muted: css('--muted') || '#9AADBC' };
  void col;
  if (bid != null) lines.push({ id: 'bid', price: bid, color: C.muted, label: '', dash: true });
  if (layers.trades) {
    for (const g of groups) {                               // one set of lines per trade, not per position
      const cc = g.direction > 0 ? C.buy : C.sell;
      lines.push({ id: `grp:${g.gid}`, price: g.entry, color: cc, bold: true,
        label: `${g.direction > 0 ? 'BUY' : 'SELL'} ${g.open_legs}/${g.legs} ${g.profit >= 0 ? '+' : ''}${g.profit.toFixed(2)}` });
      const slP = move?.group === g.gid ? move.price : (g.sl_now ?? g.sl);
      lines.push({ id: `gsl:${g.gid}`, price: slP, color: C.sell, label: g.stage === 1 ? 'SL BE+' : g.stage === 2 ? 'SL @TP1' : 'SL', drag: !ticket, dash: true });
      ([g.tp1, g.tp2, g.tp3]).forEach((v, k) => lines.push({ id: `gtp${k}:${g.gid}`, price: v, color: C.buy,
        label: `TP${k + 1}${g.tp_hit.includes(k + 1) ? ' ✓' : ''}`, dash: true }));
    }
    for (const p of singles) {
      const cc = p.direction > 0 ? C.buy : C.sell;
      lines.push({ id: `pos:${p.ticket}`, price: p.entry, color: cc, bold: true,
        label: `${p.direction > 0 ? 'BUY' : 'SELL'} ${lotsStr(p.lots)} ${p.profit >= 0 ? '+' : ''}${p.profit.toFixed(2)}` });
      const slP = move?.ticket === p.ticket && move.which === 'sl' ? move.price : p.sl;
      const tpP = move?.ticket === p.ticket && move.which === 'tp' ? move.price : p.tp;
      if (slP) lines.push({ id: `sl:${p.ticket}`, price: slP, color: C.sell, label: 'SL', drag: !ticket, dash: true });
      if (tpP) lines.push({ id: `tp:${p.ticket}`, price: tpP, color: C.buy, label: 'TP', drag: !ticket, dash: true });
    }
    for (const o of ov?.orders || []) {
      lines.push({ id: `ord:${o.ticket}`, price: o.price, color: C.brass, dash: true, label: `${o.side} ${o.kind.toUpperCase()} ${lotsStr(o.lots)}` });
    }
  }
  if (setup) {
    lines.push({ id: 'su:e', price: setup.entry, color: C.brass, label: 'setup entry', dash: true });
    if (setup.sl) lines.push({ id: 'su:sl', price: setup.sl, color: C.sell, label: 'setup SL', dash: true });
    if (setup.tp1 != null && setup.tp2 != null && setup.tp3 != null) {
      [setup.tp1, setup.tp2, setup.tp3].forEach((v, k) => lines.push({ id: `su:tp${k}`, price: v!, color: C.buy, label: `setup TP${k + 1}`, dash: true }));
    } else if (setup.tp) lines.push({ id: 'su:tp', price: setup.tp, color: C.buy, label: 'setup TP', dash: true });
  }
  if (ticket) {
    const entry = ticket.kind === 'market' ? (ticket.side > 0 ? ask : bid) : ticket.price;
    if (ticket.kind !== 'market' && entry != null) lines.push({ id: 't:price', price: entry, color: C.brass, label: ticket.kind.toUpperCase(), drag: true, bold: true });
    if (ticket.sl != null) lines.push({ id: 't:sl', price: ticket.sl, color: C.sell, label: 'SL', drag: true, bold: true });
    const multi = ticket.multi && ticket.kind === 'market';
    if (ticket.tp != null) lines.push({ id: 't:tp', price: ticket.tp, color: C.buy, label: multi ? 'TP1' : 'TP', drag: true, bold: true });
    if (multi && ticket.tp2 != null) lines.push({ id: 't:tp2', price: ticket.tp2, color: C.buy, label: 'TP2', drag: true, bold: true });
    if (multi && ticket.tp3 != null) lines.push({ id: 't:tp3', price: ticket.tp3, color: C.buy, label: 'TP3', drag: true, bold: true });
  }
  const markers: Marker[] = layers.setups ? (ov?.setups || []).filter((s) => s.utc).map((s) => ({
    id: s.id, t: s.utc!, dir: s.direction,
    color: s.status === 'TAKEN' ? (s.direction > 0 ? C.buy : C.sell) : s.status === 'FAILED' ? C.sell : s.status === 'PENDING' ? C.brass : C.muted,
    hollow: s.status !== 'TAKEN',
  })) : [];
  const zones = layers.zones ? (ov?.zones || []).filter((z) => zoneStyle === 'ALL' || z.style === zoneStyle) : [];

  const onDrag = (id: string, price: number, done: boolean) => {
    if (!isFinite(price)) return;                        // drag cancelled (second finger)
    const r = Number(price.toFixed(digits));
    if (id.startsWith('t:') && ticket) {
      const f = id === 't:sl' ? 'sl' : id === 't:tp' ? 'tp' : id === 't:tp2' ? 'tp2' : id === 't:tp3' ? 'tp3' : 'price';
      setTicket({ ...ticket, [f]: r });
      return;
    }
    const gm = id.match(/^gsl:(.+)$/);
    if (gm && done) { setMove({ ticket: 0, which: 'sl', price: r, group: gm[1] }); return; }
    const m = id.match(/^(sl|tp):(\d+)$/);
    if (m && done) setMove({ ticket: Number(m[2]), which: m[1] as 'sl' | 'tp', price: r });
  };
  const onLine = (id: string) => {
    const g = id.match(/^(?:grp|gsl|gtp\d):(.+)$/);
    if (g) { setGsel(g[1]); return; }
    const m = id.match(/^(?:pos|sl|tp):(\d+)$/);
    if (m) setSel(Number(m[1]));
  };
  const saveMove = async () => {
    if (!move) return;
    if (move.group) {
      await run('group_sl', { group: move.group, sl: move.price }, `Stop of all positions moved to ${move.price.toFixed(digits)}`);
      setMove(null);
      return;
    }
    const p = positions.find((x) => x.ticket === move.ticket);
    if (!p) { setMove(null); return; }
    await run('modify', { ticket: move.ticket, sl: move.which === 'sl' ? move.price : p.sl ?? 0, tp: move.which === 'tp' ? move.price : p.tp ?? 0 },
      `${move.which.toUpperCase()} moved to ${move.price.toFixed(digits)}`);
    setMove(null);
  };

  const watch = (ov?.watch || []).slice().sort((a, b) => (a.state === 'SIGNAL' ? -1 : 0) - (b.state === 'SIGNAL' ? -1 : 0));
  const nameOf = (n: string) => get().info?.strategies.find((x) => x.name === n)?.title || n;

  return (
    <div className="screen chart-screen">
      <div className="chips">
        {symbols.map((s) => (
          <button key={s.symbol} className={`chip ${s.symbol === symbol ? 'on' : ''}`}
            onClick={() => { setTicket(null); setSetup(null); setMove(null); setChart({ symbol: s.symbol }); }}>{s.symbol}</button>
        ))}
      </div>
      <div className="row mt8">
        <div><b className="sym">{symbol}</b> <span className="mono muted">{px(bid, digits)} / {px(ask, digits)}</span></div>
      </div>
      <div className="mt8"><Seg value={tf} options={TFS.map((t) => [t, t] as [string, string])} onChange={(t) => setChart({ tf: t })} /></div>
      <div className="layer-row">
        {(['zones', 'setups', 'trades'] as const).map((k) => (
          <button key={k} className={`chip small ${layers[k] ? 'on' : ''}`} onClick={() => setLayers({ ...layers, [k]: !layers[k] })}>{k}</button>
        ))}
        {layers.zones && <select className="mini-sel" value={zoneStyle} onChange={(e) => setZoneStyle(e.target.value as any)}>
          <option value="ALL">all zones</option><option value="SCALP">scalp (M15)</option><option value="DAY">day (H1)</option><option value="SWING">swing (H4)</option>
        </select>}
      </div>
      {err && <div className="banner warn">{err}</div>}
      <Chart bars={bars} digits={digits} tfSec={TF_SEC[tf]} zones={zones} lines={lines} markers={markers}
        onDrag={onDrag} onLine={onLine} onMarker={(id) => setSetup((ov?.setups || []).find((s) => s.id === id) || null)} />

      {move && (
        <div className="card confirm-bar">
          <div>Move {move.which.toUpperCase()} of {move.group ? 'all positions of this trade' : `#${move.ticket}`} to <b className="mono">{move.price.toFixed(digits)}</b>?</div>
          <div className="grid2 mt8"><button className="btn" onClick={() => setMove(null)}>Cancel</button><button className="btn primary" onClick={saveMove}>Save</button></div>
        </div>
      )}

      {ticket ? <TicketPanel symbol={symbol} t={ticket} setT={setTicket} bid={bid} ask={ask} onClose={() => setTicket(null)} />
        : (
          <div className="grid2 mt12">
            <button className="btn trade sell-btn" onClick={() => openTicket(-1)}>SELL<small className="mono">{px(bid, digits)}</small></button>
            <button className="btn trade buy-btn" onClick={() => openTicket(1)}>BUY<small className="mono">{px(ask, digits)}</small></button>
          </div>
        )}

      {positions.length > 0 && (
        <>
          <div className="row sec-hdr"><b>Your {symbol} positions</b>
            <Hold kind="plain" onDone={() => run('close_symbol', { symbol, confirm: true }, `${symbol} closed`)}>Close all {symbol}</Hold></div>
          <div className="card flush">
            {groups.map((g) => <GroupRow key={g.gid} g={g} onTap={() => setGsel(g.gid)} />)}
            {singles.map((p) => <PosRow key={p.ticket} p={p} onTap={() => setSel(p.ticket)} />)}
          </div>
        </>
      )}
      {!!ov?.orders.length && (
        <>
          <div className="row sec-hdr"><b>Pending orders</b></div>
          <div className="card flush">{ov.orders.map((o) => (
            <div key={o.ticket} className="list-item pad">
              <div><b>{o.side} {o.kind.toUpperCase()}</b> <span className="mono">{lotsStr(o.lots)} @ {px(o.price, digits)}</span>
                <div className="muted small mono">SL {px(o.sl, digits)} · TP {px(o.tp, digits)}</div></div>
              <button className="btn small-btn w-auto" onClick={() => run('cancel_order', { ticket: o.ticket }, 'Order cancelled')}>Cancel</button>
            </div>))}
          </div>
        </>
      )}

      <div className="row sec-hdr"><b>What Keel sees on {symbol}</b><span className="muted small">last closed bar</span></div>
      <div className="card flush">
        {watch.length ? watch.map((w) => (
          <div key={w.key} className="watch pad">
            <div className="row"><b className="small">{nameOf(w.strategy)}</b><span className={`pill ${w.state === 'SIGNAL' || w.phase === 'RETEST' ? 'brass' : w.state === 'IN TRADE' ? 'buy' : ''}`}>{w.phase && w.state === 'WATCHING' ? w.phase : w.state}</span></div>
            <div className="small mt4">{w.text}</div>
            <div className="muted small">{when(w.t ? w.t - (get().state?.server_offset_s || 0) : null)}</div>
          </div>
        )) : <Empty>Nothing yet: each strategy reports here at its next bar close.</Empty>}
      </div>

      <div className="row sec-hdr"><b>Recent setups</b></div>
      <div className="card flush">
        {(ov?.setups || []).slice(0, 8).map((s) => <div key={s.id} className="pad bb"><SetupCard s={s} compact onOpen={() => setSetup(s)} /></div>)}
        {!ov?.setups.length && <Empty>No setups on {symbol} yet.</Empty>}
      </div>

      <GroupSheet gid={gsel} onClose={() => setGsel(null)} onLeg={(t) => { setGsel(null); setSel(t); }} />
      <PositionSheet ticket={sel} onClose={() => setSel(null)} />
      <Sheet open={!!setup} onClose={() => setSetup(null)} title="Setup">
        {setup && <>
          <SetupCard s={setup} />
          <div className="muted small mt8">Its entry, stop and target are drawn on the chart as dashed lines.</div>
          <div className="grid2 mt12">
            <button className="btn" onClick={() => setSetup(null)}>Back to chart</button>
            <button className="btn primary" onClick={() => {
              const sy = symInfo(setup.symbol);
              if (sy) setTicket({ ...newTicket(sy, setup.direction > 0 ? 1 : -1, setup.entry, atr, get().state?.risk.risk_per_trade_pct ?? 0.5),
                sl: setup.sl, tp: setup.tp1 ?? setup.tp, tp2: setup.tp2 ?? null, tp3: setup.tp3 ?? null,
                multi: setup.tp1 != null && setup.tp2 != null && setup.tp3 != null });
              setSetup(null);
            }}>Trade it now</button>
          </div>
        </>}
      </Sheet>
    </div>
  );
}
