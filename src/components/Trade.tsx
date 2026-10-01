// Trade ticket (new trade from the chart) and position manager (close, part-close, add, lots up/down, SL/TP, breakeven).
import { useEffect, useMemo, useState } from 'react';
import type { Group, Position, Sym } from '../api';
import { cls, floorTo, lotsStr, money, pipSize, px, side as sideTxt, signed } from '../fmt';
import { get, go, run, setChart, symInfo, useStore } from '../store';
import { Hold, Seg, Sheet, Stepper, Toggle } from './ui';

export type Ticket = {
  side: 1 | -1; kind: 'market' | 'limit' | 'stop'; price: number | null; sl: number | null; tp: number | null;
  sizing: 'risk' | 'lots' | 'keel'; riskPct: number; lots: number;
  multi: boolean; tp2: number | null; tp3: number | null;          // 3 TPs → a group of positions (2 per TP)
};

export function newTicket(sym: Sym, sideDir: 1 | -1, last: number, atr: number, riskPct: number): Ticket {
  const dist = Math.max(atr * 1.5, (sym.stops_level + 5) * sym.point);
  const sl = last - sideDir * dist;
  const r = (v: number) => Number(v.toFixed(sym.digits));
  // final TP = 2 R; TP1 at 35 % and TP2 at 65 % of the way there (Keel's cascade) — drag them to the levels you see
  const fin = dist * 2;
  return { side: sideDir, kind: 'market', price: r(last), sl: r(sl), tp: r(last + sideDir * fin * 0.35), sizing: 'risk',
    riskPct, lots: sym.volume_min, multi: true, tp2: r(last + sideDir * fin * 0.65), tp3: r(last + sideDir * fin) };
}

export function ticketLots(t: Ticket, sym: Sym, entry: number, equity: number) {
  if (t.sizing === 'lots') return t.lots;
  if (t.sizing === 'keel' || t.sl == null) return null;
  const dist = Math.abs(entry - t.sl);
  if (!(dist > 0) || !(sym.money_per_price > 0)) return null;
  const raw = (equity * t.riskPct / 100) / (dist * sym.money_per_price);
  const l = floorTo(raw, sym.volume_step || 0.01);
  return l < sym.volume_min ? 0 : Math.min(l, sym.volume_max);
}

export function TicketPanel({ symbol, t, setT, bid, ask, onClose }: {
  symbol: string; t: Ticket & { note?: string }; setT: (t: Ticket) => void; bid: number | null; ask: number | null; onClose: () => void;
}) {
  const sym = symInfo(symbol);
  const st = useStore((s) => s.state);
  const api = useStore((s) => s.api);
  const [quote, setQuote] = useState<{ lots: number; risk_money: number; why: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (t.sizing !== 'keel' || t.sl == null) { setQuote(null); return; }
    const h = setTimeout(() => {
      api.quote({ symbol, side: sideTxt(t.side), sl: t.sl!, price: t.kind === 'market' ? null : t.price })
        .then(setQuote).catch(() => setQuote(null));
    }, 350);
    return () => clearTimeout(h);
  }, [t.sizing, t.sl, t.price, t.kind, t.side, symbol]);
  if (!sym) return null;
  const d = sym.digits, pip = pipSize(d, sym.point);
  const market = t.side > 0 ? ask : bid;
  const entry = t.kind === 'market' ? (market ?? t.price ?? 0) : (t.price ?? 0);
  const equity = st?.account?.equity || 0;
  const cur = st?.account?.currency || '';
  const lots = ticketLots(t, sym, entry, equity);
  const riskDist = t.sl != null ? Math.abs(entry - t.sl) : null;
  const shownLots = t.sizing === 'keel' ? quote?.lots ?? null : lots;
  const riskMoney = riskDist != null && shownLots ? riskDist * sym.money_per_price * shownLots : null;
  const rr = t.sl != null && t.tp != null && riskDist ? Math.abs(t.tp - entry) / riskDist : null;
  const wrongSl = t.sl != null && (entry - t.sl) * t.side <= 0;
  const multi = t.multi && t.kind === 'market';
  const legsN = st?.risk?.group_legs || 6;
  const wrongTp = t.tp != null && (t.tp - entry) * t.side <= 0 ||
    (multi && [t.tp2, t.tp3].some((x) => x == null || (x - entry) * t.side <= 0));
  const perLeg = multi && shownLots ? Math.max(sym.volume_min, floorTo(shownLots / legsN, sym.volume_step || 0.01)) : null;

  const flip = (s: 1 | -1) => {
    if (s === t.side) return;
    const e = entry;
    const m = (v: number | null) => (v != null ? Number((2 * e - v).toFixed(d)) : null);
    setT({ ...t, side: s, sl: m(t.sl), tp: m(t.tp), tp2: m(t.tp2), tp3: m(t.tp3) });
  };
  const can = !busy && !wrongSl && !wrongTp && (t.kind === 'market' || (t.price ?? 0) > 0) &&
    (t.sizing === 'keel' ? t.sl != null || true : (lots ?? 0) > 0);
  const send = async () => {
    setBusy(true);
    const r = await run('open', {
      symbol, side: sideTxt(t.side), type: t.kind, price: t.kind === 'market' ? null : t.price, sl: t.sl, tp: t.tp,
      ...(multi ? { tps: [t.tp, t.tp2, t.tp3], legs: legsN } : {}),
      lots: t.sizing === 'keel' ? null : lots, note: t.note || `from the app (${t.sizing === 'risk' ? t.riskPct + ' % risk' : t.sizing === 'lots' ? 'fixed lots' : 'Keel sizing'})`,
    }, `${sideTxt(t.side)} ${symbol} sent${multi ? ` · ${legsN} positions` : ''}`);
    setBusy(false);
    if (r.ok) onClose();
  };

  return (
    <div className="card ticket">
      <div className="row"><b>New trade · {symbol}</b><button className="link" onClick={onClose}>Cancel</button></div>
      <div className="grid2 mt8">
        <button className={`btn side ${t.side > 0 ? 'buy-on' : ''}`} onClick={() => flip(1)}>BUY<small className="mono">{px(ask, d)}</small></button>
        <button className={`btn side ${t.side < 0 ? 'sell-on' : ''}`} onClick={() => flip(-1)}>SELL<small className="mono">{px(bid, d)}</small></button>
      </div>
      <div className="mt8"><Seg value={t.kind} options={[['market', 'Market'], ['limit', 'Limit'], ['stop', 'Stop']]}
        onChange={(k) => setT({ ...t, kind: k, price: k === 'market' ? t.price : t.price ?? market })} /></div>
      {t.kind !== 'market' && (
        <Stepper label={`${t.kind === 'limit' ? 'Limit' : 'Stop'} price`} value={t.price} digits={d} step={pip}
          onChange={(v) => setT({ ...t, price: v })}
          suffix={t.kind === 'limit' ? `a ${t.side > 0 ? 'buy limit sits below' : 'sell limit sits above'} the price` : `a ${t.side > 0 ? 'buy stop sits above' : 'sell stop sits below'} the price`} />
      )}
      {t.kind === 'market' && (
        <div className="row card-inset mt8">
          <div><b>{legsN} positions · 3 TPs</b><div className="muted small">2 extractors close at 35 %, 2 runners at 65 %, the last 2 at the final TP. After TP1 the stop goes to breakeven, after TP2 to TP1, then it trails.</div></div>
          <Toggle on={t.multi} onChange={(v) => setT({ ...t, multi: v })} />
        </div>
      )}
      <Stepper label={<span className="sell">Stop loss</span>} value={t.sl} digits={d} step={pip} onChange={(v) => setT({ ...t, sl: v })}
        suffix={wrongSl ? <span className="sell">wrong side of the price</span> : riskDist != null ? `${(riskDist / pip).toFixed(1)} pips` : 'none'} />
      {multi ? (
        <div>
          {([['tp', 'TP1 · 35 % (2 extractors)'], ['tp2', 'TP2 · 65 % (2 runners)'], ['tp3', 'TP3 · final (2 runners)']] as const).map(([k, lab]) => {
            const v = t[k] as number | null;
            return <Stepper key={k} label={<span className="buy">{lab}</span>} value={v} digits={d} step={pip} onChange={(x) => setT({ ...t, [k]: x })}
              suffix={v != null && riskDist ? `${(Math.abs(v - entry) / riskDist).toFixed(2)} R` : 'none'} />;
          })}
        </div>
      ) : (
        <Stepper label={<span className="buy">Take profit</span>} value={t.tp} digits={d} step={pip} onChange={(v) => setT({ ...t, tp: v })}
          suffix={wrongTp ? <span className="sell">wrong side of the price</span> : rr != null ? `${rr.toFixed(2)} R` : 'none'} />
      )}
      {wrongTp && multi && <div className="small sell">every TP must be beyond the price, in order</div>}
      {multi && t.tp3 != null && (
        <button className="link small" onClick={() => {
          const dd = t.tp3! - entry;
          setT({ ...t, tp: Number((entry + 0.35 * dd).toFixed(d)), tp2: Number((entry + 0.65 * dd).toFixed(d)) });
        }}>Put TP1 / TP2 at 35 % / 65 % of the way to TP3</button>
      )}
      <div className="muted small">Drag the SL / TP lines on the chart, or use − / +.</div>
      <div className="lab mt8">Size</div>
      <Seg value={t.sizing} options={[['risk', 'Risk %'], ['lots', 'Lots'], ['keel', 'Keel setting']]} onChange={(v) => setT({ ...t, sizing: v })} />
      {t.sizing === 'risk' && <Stepper value={t.riskPct} digits={2} step={0.25} min={0.05} max={20} onChange={(v) => setT({ ...t, riskPct: v ?? 0.5 })}
        suffix={t.sl == null ? 'needs a stop loss' : lots === 0 ? 'below the broker minimum lot' : `= ${lotsStr(lots || 0)} lots`} />}
      {t.sizing === 'lots' && <Stepper value={t.lots} digits={2} step={sym.volume_step} min={sym.volume_min} max={sym.volume_max} onChange={(v) => setT({ ...t, lots: v ?? sym.volume_min })} />}
      {t.sizing === 'keel' && <div className="muted small mt8">{quote ? (quote.lots ? `${lotsStr(quote.lots)} lots from your risk setting` : quote.why) : t.sl == null ? 'minimum lot (no stop)' : '…'}</div>}
      <div className="summary mono">
        <span>Risk {riskMoney != null ? money(riskMoney, cur) : '—'}{riskMoney != null && equity ? ` (${(100 * riskMoney / equity).toFixed(2)} %)` : ''}</span>
        <span>{shownLots ? (perLeg ? `${legsN} × ${lotsStr(perLeg)} lots` : `${lotsStr(shownLots)} lots`) : ''}</span>
      </div>
      <Hold kind={t.side > 0 ? 'primary' : 'sell'} onDone={send} disabled={!can}>
        {busy ? 'Sending…' : `${sideTxt(t.side)} ${t.kind === 'market' ? '' : t.kind.toUpperCase() + ' '}${symbol}${shownLots ? ' · ' + lotsStr(shownLots) : ''}`}
      </Hold>
    </div>
  );
}

export function PositionSheet({ ticket, onClose }: { ticket: number | null; onClose: () => void }) {
  const st = useStore((s) => s.state);
  const p = st?.positions?.find((x) => x.ticket === ticket) || null;
  return (
    <Sheet open={ticket != null} onClose={onClose}
      title={p ? <><span className={p.direction > 0 ? 'buy' : 'sell'}>{sideTxt(p.direction)}</span> {p.symbol} · #{p.ticket}</> : 'Position'}>
      {p ? <PositionBody p={p} onClose={onClose} /> : <div className="muted">This position is closed.</div>}
    </Sheet>
  );
}

function PositionBody({ p, onClose }: { p: Position; onClose: () => void }) {
  const sym = symInfo(p.symbol);
  const cur = useStore((s) => s.state?.account?.currency || '');
  const d = sym?.digits ?? 5, pip = sym ? pipSize(d, sym.point) : 0.0001;
  const step = sym?.volume_step || 0.01, vmin = sym?.volume_min || 0.01;
  const [target, setTarget] = useState(p.lots);
  const [sl, setSl] = useState<number | null>(p.sl || null);
  const [tp, setTp] = useState<number | null>(p.tp || null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setTarget(p.lots); }, [p.lots]);
  useEffect(() => { setSl(p.sl || null); setTp(p.tp || null); }, [p.sl, p.tp]);
  const delta = Number((target - p.lots).toFixed(8));
  const act = async (a: string, args: Record<string, unknown>, ok: string) => { setBusy(true); const r = await run(a, args, ok); setBusy(false); return r; };
  const wrongSl = sl != null && p.price != null && (p.price - sl) * p.direction <= 0;
  const changedStops = (sl || null) !== (p.sl || null) || (tp || null) !== (p.tp || null);
  const partial = (f: number) => {
    const v = floorTo(p.lots * f, step);
    return v >= vmin && p.lots - v >= vmin - 1e-9 ? v : null;
  };
  return (
    <div>
      <div className="grid3">
        <div><div className="lab">P/L</div><div className={`big2 mono ${cls(p.profit)}`}>{money(p.profit, cur)}</div></div>
        <div><div className="lab">R</div><div className={`big2 mono ${cls(p.R)}`}>{signed(p.R)}</div></div>
        <div><div className="lab">Lots</div><div className="big2 mono">{lotsStr(p.lots)}</div></div>
      </div>
      <div className="kv mono"><span>Entry {px(p.entry, d)}</span><span>Now {px(p.price, d)}</span></div>
      <div className="muted small">{p.strategy} · {p.note}</div>

      <div className="section">Lot size</div>
      <Stepper value={target} digits={2} step={step} min={vmin} max={sym?.volume_max} onChange={(v) => setTarget(v ?? p.lots)}
        suffix={delta > 0 ? `adds ${lotsStr(delta)} lots (new position, same SL/TP)` : delta < 0 ? `closes ${lotsStr(-delta)} lots now` : 'change it with − / +'} />
      {delta !== 0 && (
        <Hold kind={delta > 0 ? 'primary' : 'danger'} disabled={busy}
          onDone={() => delta > 0 ? act('add', { ticket: p.ticket, lots: delta }, `Added ${lotsStr(delta)} lots`)
            : act('reduce', { ticket: p.ticket, lots: -delta }, `Closed ${lotsStr(-delta)} lots`)}>
          {delta > 0 ? `Add ${lotsStr(delta)} lots` : `Reduce by ${lotsStr(-delta)} lots`}
        </Hold>
      )}
      <div className="grid3 mt8">
        {[0.25, 0.5, 0.75].map((f) => {
          const v = partial(f);
          return <button key={f} className="btn small-btn" disabled={!v || busy}
            onClick={() => v && act('reduce', { ticket: p.ticket, lots: v }, `Closed ${lotsStr(v)} lots`)}>Close {f * 100}%</button>;
        })}
      </div>

      <div className="section">Stop loss & take profit</div>
      <div className="grid2">
        <Stepper label={<span className="sell">SL</span>} value={sl} digits={d} step={pip} onChange={setSl}
          suffix={wrongSl ? <span className="sell">wrong side</span> : sl != null ? `${(Math.abs(p.entry - sl) / pip).toFixed(1)} pips from entry` : 'none'} />
        <Stepper label={<span className="buy">TP</span>} value={tp} digits={d} step={pip} onChange={setTp}
          suffix={tp != null ? `${(Math.abs(tp - p.entry) / pip).toFixed(1)} pips from entry` : 'none'} />
      </div>
      <div className="grid2 mt8">
        <button className="btn" disabled={busy || (p.price != null && (p.price - p.entry) * p.direction <= 0)}
          onClick={() => act('breakeven', { ticket: p.ticket }, 'Stop moved to entry')}>Breakeven</button>
        <button className="btn primary" disabled={busy || !changedStops || wrongSl}
          onClick={() => act('modify', { ticket: p.ticket, sl: sl ?? 0, tp: tp ?? 0 }, 'SL / TP saved')}>Save SL / TP</button>
      </div>

      <div className="section" />
      <div className="grid2">
        <button className="btn" onClick={() => { setChart({ symbol: p.symbol }); onClose(); go({ tab: 'chart', focus: p.ticket }); }}>Open chart</button>
        <Hold kind="danger" disabled={busy} onDone={async () => { const r = await act('close', { ticket: p.ticket }, `Closed #${p.ticket}`); if (r.ok) onClose(); }}>Close</Hold>
      </div>
    </div>
  );
}

export function PosRow({ p, onTap }: { p: Position; onTap: () => void }) {
  const d = symInfo(p.symbol)?.digits ?? 5;
  const cur = get().state?.account?.currency || '';
  const style = useMemo(() => (p.note.match(/^\[([A-Z]+)(?: ([A-Z0-9]+))?\]/) || [])[1] || p.strategy, [p.note, p.strategy]);
  return (
    <button className="pos-row" onClick={onTap}>
      <div className="row">
        <div><span className={`pill ${p.direction > 0 ? 'buy' : 'sell'}`}>{sideTxt(p.direction)}</span> <b>{p.symbol}</b> <span className="muted mono">{lotsStr(p.lots)}</span></div>
        <div className={`mono b ${cls(p.profit)}`}>{money(p.profit, cur)}</div>
      </div>
      <div className="row muted small mt4">
        <span>{p.strategy} · {style}</span>
        <span className="mono">{px(p.entry, d)} → {px(p.price, d)}{p.R != null ? ` · ${signed(p.R)}R` : ''}</span>
      </div>
    </button>
  );
}

const NONE: Position[] = [];

/** One setup traded as several positions: 2 at TP1, 2 at TP2, 2 at TP3. */
export function GroupRow({ g, onTap }: { g: Group; onTap: () => void }) {
  const d = symInfo(g.symbol)?.digits ?? 5;
  const cur = get().state?.account?.currency || '';
  return (
    <button className="pos-row" onClick={onTap}>
      <div className="row">
        <div><span className={`pill ${g.direction > 0 ? 'buy' : 'sell'}`}>{sideTxt(g.direction)}</span> <b>{g.symbol}</b>{' '}
          <span className="muted small">{g.style}{g.style !== 'MANUAL' ? ' ' + g.tf : ''} · {g.open_legs}/{g.legs} open</span></div>
        <div className={`mono b ${cls(g.profit)}`}>{money(g.profit, cur)}</div>
      </div>
      <div className="row small mt4">
        <span className="tps">{[1, 2, 3].map((k) => <span key={k} className={`tpchip ${g.tp_hit.includes(k) ? 'hit' : ''}`}>TP{k}{g.tp_hit.includes(k) ? ' ✓' : ''}</span>)}</span>
        <span className="muted mono">{px(g.entry, d)} → {px(g.price, d)}{g.R != null ? ` · ${signed(g.R)}R` : ''}</span>
      </div>
      <div className="muted small mt4">{g.stage === 1 ? 'Stop at breakeven+: this trade can no longer lose' : g.stage === 2 ? 'Stop at TP1: profit locked' : `Stop ${px(g.sl_now ?? g.sl, d)}`}</div>
    </button>
  );
}

export function GroupSheet({ gid, onClose, onLeg }: { gid: string | null; onClose: () => void; onLeg: (ticket: number) => void }) {
  const g = useStore((s) => s.state?.groups?.find((x) => x.gid === gid) || null);
  const positions = useStore((s) => s.state?.positions) || NONE;
  const cur = useStore((s) => s.state?.account?.currency || '');
  const [sl, setSl] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSl(g ? (g.sl_now ?? g.sl) : null); }, [g?.gid, g?.sl_now]);
  const sym = g ? symInfo(g.symbol) : undefined;
  const d = sym?.digits ?? 5, pip = sym ? pipSize(d, sym.point) : 0.0001;
  const act = async (a: string, args: Record<string, unknown>, ok: string) => { setBusy(true); const r = await run(a, args, ok); setBusy(false); return r; };
  return (
    <Sheet open={gid != null} onClose={onClose}
      title={g ? <><span className={g.direction > 0 ? 'buy' : 'sell'}>{sideTxt(g.direction)}</span> {g.symbol} · {g.legs} positions</> : 'Trade'}>
      {!g ? <div className="muted">This trade is closed. Its result is in Positions → History.</div> : (
        <div>
          <div className="grid3">
            <div><div className="lab">P/L</div><div className={`big2 mono ${cls(g.profit)}`}>{money(g.profit, cur)}</div></div>
            <div><div className="lab">Banked</div><div className={`big2 mono ${cls(g.banked)}`}>{money(g.banked)}</div></div>
            <div><div className="lab">R</div><div className={`big2 mono ${cls(g.R)}`}>{signed(g.R)}</div></div>
          </div>
          <div className="muted small mt8">{g.strategy} · {g.note}</div>
          <div className="section">Targets</div>
          <div className="card-inset">
            {([['TP1', g.tp1, 1], ['TP2', g.tp2, 2], ['TP3', g.tp3, 3]] as const).map(([lab, v, k]) => (
              <div key={lab} className="row mono small"><span>{lab} {g.tp_hit.includes(k) ? '✓' : ''}</span><span>{px(v, d)}</span>
                <span className="muted">{g.tp_hit.includes(k) ? 'hit' : `${(Math.abs(v - g.entry) / Math.max(Math.abs(g.entry - g.sl), 1e-12)).toFixed(2)} R`}</span></div>
            ))}
            <div className="row mono small"><span className="sell">Stop</span><span>{px(g.sl_now ?? g.sl, d)}</span>
              <span className="muted">{g.stage === 1 ? 'breakeven+' : g.stage === 2 ? 'at TP1' : 'original'}</span></div>
          </div>
          <div className="section">Stop for all open positions</div>
          <Stepper value={sl} digits={d} step={pip} onChange={setSl} />
          <div className="grid2 mt8">
            <button className="btn" disabled={busy} onClick={() => act('group_breakeven', { group: g.gid }, 'Stops moved to breakeven+')}>Breakeven</button>
            <button className="btn primary" disabled={busy || sl == null || sl === (g.sl_now ?? g.sl)}
              onClick={() => act('group_sl', { group: g.gid, sl }, 'Stops moved')}>Move stop</button>
          </div>
          <div className="section">Positions</div>
          <div className="card-inset flush">
            {positions.filter((p) => p.group_id === g.gid).map((p) => (
              <button key={p.ticket} className="leg-row" onClick={() => onLeg(p.ticket)}>
                <span className="mono">#{p.ticket}</span><span>TP{(p.tp_level ?? 0) + 1}</span><span className="mono">{lotsStr(p.lots)}</span>
                <span className={`mono ${cls(p.profit)}`}>{money(p.profit)}</span>
              </button>
            ))}
          </div>
          <div className="grid2 mt12">
            <button className="btn" onClick={() => { setChart({ symbol: g.symbol }); onClose(); go({ tab: 'chart' }); }}>Open chart</button>
            <Hold kind="danger" disabled={busy} onDone={async () => { const r = await act('close_group', { group: g.gid }, `Closing ${g.open_legs} positions`); if (r.ok) onClose(); }}>Close all {g.open_legs}</Hold>
          </div>
        </div>
      )}
    </Sheet>
  );
}
