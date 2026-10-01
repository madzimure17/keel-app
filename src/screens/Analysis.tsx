// The analyst: for every symbol and style (scalp / day / swing) Keel reads the market top-down the way you would —
// the big-picture trend, the last leg, the supply or demand zone it will come back to, the trigger it waits for, the
// liquidity it targets, the session and the news — draws it, writes down why, and trades the plans that confirm.
import { useEffect, useMemo, useState } from 'react';
import type { AnalysisDoc, AnalysisRow, Candles, Plan, PlanTrade } from '../api';
import Chart, { type Line } from '../components/Chart';
import { Empty, Seg, Toggle } from '../components/ui';
import { ago, px, when } from '../fmt';
import { go, run, tradePlan, useStore } from '../store';
import Setups from './Setups';

const PROFILES = ['SCALP', 'DAY', 'SWING'] as const;
type Prof = (typeof PROFILES)[number];
const PROF_TFS: Record<Prof, string[]> = {            // bias, bias, leg, refine, trigger
  SCALP: ['H1', 'M15', 'M5', 'M1'], DAY: ['H4', 'H1', 'M15', 'M5'], SWING: ['D1', 'H4', 'H1', 'M15'],
};
const TF_SEC: Record<string, number> = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400, D1: 86400 };
const PHASE: Record<string, { label: string; cls: string; help: string }> = {
  WAIT: { label: 'No setup', cls: '', help: 'No clear trend on the big timeframes — nothing to trade.' },
  RETRACING: { label: 'Coming to zone', cls: 'brass', help: 'Price is pulling back towards the zone. Wait.' },
  IN_ZONE: { label: 'In zone', cls: 'brass', help: 'Price is in the zone. Waiting for the trigger timeframe to break structure.' },
  CONFIRMED: { label: 'Confirmed', cls: 'buy', help: 'The trigger fired inside the zone — this is the entry.' },
  IMPULSE: { label: 'Running', cls: '', help: 'The move is running away from the zone; only a continuation retest is valid.' },
  INVALIDATED: { label: 'Invalidated', cls: 'sell', help: 'Price went through the stop level. The idea is dead.' },
};
const ARROW = (d: number) => (d > 0 ? '▲ up' : d < 0 ? '▼ down' : '◆ sideways');
const dcls = (d: number) => (d > 0 ? 'buy' : d < 0 ? 'sell' : 'muted');
const short = (s: string) => s.replace(/^unswept /, '').replace(/previous day (high|low)/, (_m, a) => (a === 'high' ? 'PDH' : 'PDL'))
  .replace(/\s[-\d.]+$/, '');
const prof = (x?: string): Prof => (PROFILES.includes(x as Prof) ? (x as Prof) : 'DAY');

export default function Analysis() {
  const route = useStore((s) => s.route);
  const [seg, setSeg] = useState<'plans' | 'setups'>(route.sub === 'setups' ? 'setups' : 'plans');
  useEffect(() => { if (route.sub === 'setups') setSeg('setups'); }, [route.sub]);
  if (route.symbol) return <Detail symbol={route.symbol} initial={prof(route.sub)} />;
  return (
    <div className="screen">
      <div className="hdr"><div className="title">Analysis</div></div>
      <Seg value={seg} onChange={setSeg} options={[['plans', 'Market plans'], ['setups', 'Setups log']]} />
      {seg === 'plans' ? <PlanList /> : <div className="mt8"><Setups embedded /></div>}
    </div>
  );
}

// ---------------------------------------------------------------- the list: every symbol × style
function PlanList() {
  const api = useStore((s) => s.api);
  const live = useStore((s) => s.state?.analysis);
  const [rows, setRows] = useState<AnalysisRow[] | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const f = () => api.analysisAll().then((r) => { setRows(r); setErr(''); }).catch((e) => setErr(e.message));
    f();
    const h = setInterval(f, 15000);
    return () => clearInterval(h);
  }, [api]);
  const all = live?.length ? live : rows || [];
  const bySym = useMemo(() => {
    const m = new Map<string, AnalysisRow[]>();
    for (const r of all) m.set(r.symbol, [...(m.get(r.symbol) || []), r]);
    const rank = (rs: AnalysisRow[]) => Math.max(...rs.map((r) => ({ CONFIRMED: 5, IN_ZONE: 4, RETRACING: 3 } as any)[r.phase] || 0));
    return [...m.entries()].sort((a, b) => rank(b[1]) - rank(a[1]) || a[0].localeCompare(b[0]));
  }, [all]);
  const ses = all[0];
  return (
    <>
      {ses && <SessionBanner text={ses.session} safe={ses.safe} />}
      <div className="muted small pad-x">Each symbol is read on three styles. Tap one to see the chart, the zones, the route and the reasons.</div>
      {err && <div className="banner warn mt8">{err}</div>}
      <div className="card flush mt8">
        {bySym.map(([sym, rs]) => (
          <button key={sym} className="plan-row" onClick={() => go({ tab: 'analysis', symbol: sym })}>
            <div className="row"><b>{sym}</b><span className="muted small">{ago(rs[0]?.t)}</span></div>
            <div className="plan-chips">
              {PROFILES.map((p) => {
                const r = rs.find((x) => x.profile === p);
                if (!r) return null;
                const ph = PHASE[r.phase] || PHASE.WAIT;
                return (
                  <span key={p} className={`pill ${ph.cls}`} onClick={(e) => { e.stopPropagation(); go({ tab: 'analysis', symbol: sym, sub: p }); }}>
                    {p[0] + p.slice(1).toLowerCase()} · {ph.label}{r.side ? ` · ${r.side}` : ''}{r.confidence != null && r.side ? ` · conf ${r.confidence}` : ''}
                  </span>
                );
              })}
            </div>
            {(() => {
              const top = rs.find((r) => r.phase === 'CONFIRMED') || rs.find((r) => r.phase === 'IN_ZONE') || rs.find((r) => r.profile === 'DAY') || rs[0];
              return top ? <div className="small mt4 muted">{top.headline}</div> : null;
            })()}
          </button>
        ))}
        {!bySym.length && <Empty>The analyst writes its first plans at the next 5-minute bar close.</Empty>}
      </div>
    </>
  );
}

function SessionBanner({ text, safe }: { text: string; safe: boolean }) {
  return <div className={`banner ${safe ? 'info' : 'warn'} mt8`}>{safe ? '🟢 ' : '⛔ '}{text}</div>;
}

// ---------------------------------------------------------------- one symbol: the full top-down read
function Detail({ symbol, initial }: { symbol: string; initial: Prof }) {
  const api = useStore((s) => s.api);
  const pairs = useStore((s) => s.state?.pairs);
  const [p, setP] = useState<Prof>(initial);
  const [doc, setDoc] = useState<AnalysisDoc | null>(null);
  const [tf, setTf] = useState(PROF_TFS[initial][2]);
  const [c, setC] = useState<Candles | null>(null);
  const [err, setErr] = useState('');
  const [layers, setLayers] = useState({ fib: true, liq: true, route: true });
  useEffect(() => { setP(initial); setTf(PROF_TFS[initial][2]); }, [symbol, initial]);
  useEffect(() => {
    const f = () => api.analysis(symbol).then((d) => { setDoc(d); setErr(''); }).catch((e) => setErr(e.message));
    f();
    const h = setInterval(f, 15000);
    return () => clearInterval(h);
  }, [api, symbol]);
  useEffect(() => {
    let live = true;
    const f = () => api.candles(symbol, tf, 300).then((x) => live && setC(x)).catch(() => {});
    setC(null); f();
    const h = setInterval(f, 8000);
    return () => { live = false; clearInterval(h); };
  }, [api, symbol, tf]);

  const plan = doc?.plans?.[p] || null;
  const d = plan?.digits ?? c?.digits ?? 5;
  const main = plan?.trades.find((t) => t.name === 'main');
  const sw = pairs?.find((x) => x.symbol === symbol && x.strategy === `ANALYST_${p}`);
  const css = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const C = { buy: css('--buy') || '#2FB5A0', sell: css('--sell') || '#E4696F', brass: css('--brass') || '#C9A24B', muted: css('--muted') || '#9AADBC', blue: '#5B9BE0' };

  const lines: Line[] = [];
  if (plan) {
    if (layers.fib) for (const f of plan.fibs.filter((x) => [0.5, 0.618, 0.705].includes(x.r))) lines.push({ id: `fib${f.r}`, price: f.price, color: C.muted, dash: true, label: `${(f.r * 100).toFixed(1).replace('.0', '')}%` });
    if (layers.liq) for (const [k, l] of plan.liquidity.slice(0, 3).entries()) lines.push({ id: `liq${k}`, price: l.price, color: C.blue, dash: true, label: short(l.label) });
    // one trade on the chart at a time: the continuation while the move runs, otherwise the main trade
    const shown = plan.trades.filter((t) => t.name === (plan.phase === 'IMPULSE' && plan.trades.some((x) => x.name === 'continuation') ? 'continuation' : 'main'));
    for (const t of shown) {
      const tag = t.name === 'main' ? '' : ' (cont.)';
      lines.push({ id: `${t.name}:e`, price: t.entry, color: C.brass, bold: t.name === 'main', label: `${t.side} entry${tag}` });
      lines.push({ id: `${t.name}:sl`, price: t.sl, color: C.sell, dash: true, label: `SL${tag}` });
      lines.push({ id: `${t.name}:t1`, price: t.tp35, color: C.buy, dash: true, label: `TP 35 %${tag}` });
      lines.push({ id: `${t.name}:t2`, price: t.tp65, color: C.buy, dash: true, label: `TP 65 %${tag}` });
      lines.push({ id: `${t.name}:t3`, price: t.tp, color: C.buy, bold: t.name === 'main', label: `final TP${tag}` });
    }
  }
  const zones = (plan?.zones || []).map((z) => ({ ...z, strategy: 'ANALYST', style: p, t: z.t ?? null, tf: z.tf || '' }));

  const trade = (t: PlanTrade, kind: 'market' | 'limit') => {
    if (!plan) return;
    const e0 = kind === 'market' ? plan.price : t.entry;
    const dist = t.tp - e0;
    const r = (v: number) => Number(v.toFixed(d));
    tradePlan({ symbol, side: t.direction > 0 ? 1 : -1, kind, price: kind === 'market' ? null : r(t.entry), sl: r(t.sl),
      tp1: kind === 'limit' ? r(t.tp) : r(e0 + 0.35 * dist), tp2: r(e0 + 0.65 * dist), tp3: r(t.tp), note: `analyst ${p}: ${plan.headline}`.slice(0, 200) });
  };

  const sc = doc?.scores || {};
  return (
    <div className="screen">
      <div className="hdr">
        <button className="link" onClick={() => go({ tab: 'analysis' })}>‹ All markets</button>
        <button className="link" onClick={() => { go({ tab: 'chart' }); }}>Full chart ›</button>
      </div>
      <div className="row"><b className="sym">{symbol}</b>{plan && <span className={`pill ${PHASE[plan.phase]?.cls || ''}`}>{PHASE[plan.phase]?.label || plan.phase}</span>}</div>
      <div className="mt8"><Seg value={p} onChange={(v) => { setP(v); setTf(PROF_TFS[v][2]); }}
        options={PROFILES.map((x) => [x, `${x[0] + x.slice(1).toLowerCase()} ${PROF_TFS[x][2]}`] as [Prof, string])} /></div>
      {err && <div className="banner warn mt8">{err}</div>}
      {!plan && !err && <Empty>No {p.toLowerCase()} plan for {symbol} yet — it is written at the next 5-minute bar close.</Empty>}
      {plan && <>
        <SessionBanner text={plan.session.text} safe={plan.session.safe} />
        {plan.headline_news && <div className="banner info">📰 {plan.headline_news}</div>}
        <div className="plan-head">{plan.headline}</div>
        <div className="muted small">{PHASE[plan.phase]?.help} · read {ago(plan.t)} from closed bars</div>

        <div className="mt8"><Seg value={tf} onChange={setTf} options={PROF_TFS[p].map((x, k) => [x, `${x}${k < 2 ? ' bias' : k === 2 ? ' leg' : k === 3 ? ' trig' : ''}`] as [string, string])} /></div>
        <div className="layer-row">
          {(['fib', 'liq', 'route'] as const).map((k) => (
            <button key={k} className={`chip small ${layers[k] ? 'on' : ''}`} onClick={() => setLayers({ ...layers, [k]: !layers[k] })}>
              {k === 'fib' ? 'fibonacci' : k === 'liq' ? 'liquidity' : 'route'}</button>
          ))}
        </div>
        <Chart bars={c?.bars || []} digits={d} tfSec={TF_SEC[tf]} zones={zones} lines={lines} height={340}
          route={layers.route ? plan.route : undefined} />
        <div className="muted small">Blue line: the route Keel expects (now → zone → target). Shaded: the zone, order block and fair value gaps.</div>

        <div className="row sec-hdr"><b>Top-down read</b></div>
        <div className="card flush">
          {PROF_TFS[p].map((x) => {
            const r = plan.timeframes[x];
            if (!r) return null;
            return (
              <div key={x} className="pad bb">
                <div className="row"><b className="mono">{x}</b><b className={`small ${dcls(r.trend)}`}>{ARROW(r.trend)}</b></div>
                <div className="muted small mt4">{r.reason || '—'}</div>
              </div>
            );
          })}
          {plan.leg && <div className="pad small"><b>Leg ({plan.leg.tf})</b> {px(plan.leg.from, d)} → {px(plan.leg.to, d)} · retraced <b>{Math.round(plan.leg.retrace * 100)} %</b></div>}
        </div>

        {plan.trades.map((t) => <TradeCard key={t.name} t={t} d={d} onTrade={trade} />)}
        {!plan.trades.length && plan.phase !== 'WAIT' && <div className="card mt8 small muted">No trade: no target pays at least 1.5 R from the zone, or the idea is invalidated.</div>}

        <div className="row sec-hdr"><b>Why — written out</b></div>
        <div className="card">
          <ol className="reasons">{plan.reasons.map((r, k) => <li key={k}>{r}</li>)}</ol>
        </div>

        {plan.expect30 && (
          <div className="card mt8">
            <div className="lab">Next 30 minutes</div>
            <div className="mt4"><b className={dcls(plan.expect30.direction)}>{ARROW(plan.expect30.direction)}</b> · <span className="mono">{px(plan.expect30.lo, d)} – {px(plan.expect30.hi, d)}</span></div>
            <div className="muted small mt4">{plan.expect30.text}. Every 30-minute call is checked afterwards; the hit rate is below.</div>
          </div>
        )}

        {plan.liquidity.length > 0 && <>
          <div className="row sec-hdr"><b>Liquidity it targets</b></div>
          <div className="card flush">{plan.liquidity.slice(0, 6).map((l, k) => (
            <div key={k} className="row pad bb small"><span>{l.label}</span><b className="mono">{px(l.price, d)}</b></div>))}</div>
        </>}

        <div className="row sec-hdr"><b>How the analyst has done</b><span className="muted small">last 14 days, this symbol</span></div>
        <div className="card">
          {PROFILES.map((x) => sc[x] ? (
            <div key={x} className="row small mt4"><span>{x} 30-min calls</span><b className="mono">{Math.round(sc[x].hit * 100)} % of {sc[x].calls}</b></div>
          ) : null)}
          {sc.trades ? <div className="row small mt4"><span>Analyst trades</span>
            <b className="mono">{sc.trades.won}/{sc.trades.n} won · {sc.trades.final_tp} reached final TP · {sc.trades.profit >= 0 ? '+' : ''}{sc.trades.profit}</b></div>
            : <div className="muted small mt4">No analyst trades closed yet on {symbol}.</div>}
          <div className="muted small mt8">A coin toss scores about 40 % on this 30-minute test. Judge the analyst on these numbers, not on how sure the text sounds.</div>
        </div>

        <div className="row card-inset mt12">
          <div><b>Let the analyst trade {symbol} {p.toLowerCase()}</b><div className="muted small">When a plan confirms in a safe session, Keel opens the 6 positions itself.</div></div>
          <Toggle on={sw ? sw.enabled : true} onChange={(v) => run('enable', { key: `ANALYST_${p}|${symbol}`, on: v }, v ? 'Analyst on' : 'Analyst off')} />
        </div>
      </>}

      <div className="row sec-hdr"><b>Headlines</b><span className="muted small">BBC · CNBC · FXStreet</span></div>
      <div className="card flush">
        {(doc?.headlines || []).map((h, k) => (
          <a key={k} className="pad bb headline" href={h.link} target="_blank" rel="noreferrer">
            <div className="small">{h.title}</div>
            <div className="muted small">{h.source} · {when(h.t, true)}</div>
          </a>
        ))}
        {!doc?.headlines?.length && <Empty>No headlines about {symbol} in the last 24 h.</Empty>}
      </div>
      <div className="muted small mt8">Scheduled releases (the economic calendar) block new entries around the news time. Headlines only warn — they never block on their own.</div>
    </div>
  );
}

function TradeCard({ t, d, onTrade }: { t: PlanTrade; d: number; onTrade: (t: PlanTrade, k: 'market' | 'limit') => void }) {
  const mode = t.mode === 'market' ? 'enter now' : t.mode === 'limit' ? 'limit order in the zone' : 'wait for confirmation';
  return (
    <div className="card mt8 plan-trade">
      <div className="row">
        <span><span className={`pill ${t.direction > 0 ? 'buy' : 'sell'}`}>{t.side}</span> <b>{t.name === 'main' ? 'Main trade' : 'Continuation'}</b></span>
        <span className="pill brass">confidence {t.confidence}</span>
      </div>
      <div className="muted small mt4">{mode} · trigger: {t.trigger}</div>
      <div className="grid3 mt8 mono small">
        <div><div className="lab">Entry</div>{px(t.entry, d)}</div>
        <div><div className="lab">Stop</div><span className="sell">{px(t.sl, d)}</span></div>
        <div><div className="lab">R:R</div>{t.rr ?? '—'}</div>
      </div>
      <div className="grid3 mt8 mono small">
        <div><div className="lab">TP 35 %</div><span className="buy">{px(t.tp35, d)}</span></div>
        <div><div className="lab">TP 65 %</div><span className="buy">{px(t.tp65, d)}</span></div>
        <div><div className="lab">Final</div><b className="buy">{px(t.tp, d)}</b></div>
      </div>
      <div className="muted small mt8">Final TP = {t.tp_reason}. Zone {px(t.zone[0], d)}–{px(t.zone[1], d)}. Invalid on {t.invalid}.
        {t.eta_min ? ` Expected in about ${Math.floor(t.eta_min / 60)} h ${t.eta_min % 60} min.` : ''} Valid until {when(t.expires)}.</div>
      <div className="grid2 mt8">
        {t.mode !== 'market' ? <button className="btn" onClick={() => onTrade(t, 'limit')}>Limit at {px(t.entry, d)}</button> : <span />}
        <button className="btn primary" onClick={() => onTrade(t, 'market')}>Trade this now</button>
      </div>
    </div>
  );
}
