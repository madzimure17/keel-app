import { useEffect, useState } from 'react';
import type { LiveCandidate, LiveChart, LiveDecision, LivePlan, LiveSnapshot } from '../api';
import Chart from '../components/Chart';
import { Empty, I } from '../components/ui';
import { money, px, when } from '../fmt';
import { go, useStore } from '../store';

const stateOrder: Record<string, number> = { in_trade: 0, pending: 1, review: 2, watch: 3, staged: 4, idle: 9 };
const slStage = (stage?: number | null) => stage === 2 ? 'at TP1' : stage === 1 ? 'breakeven' : 'initial';
const reasons = (d?: LiveDecision) => (d?.reasons || []).slice(0, 3).map((x) => x.replace(/^(ARM|CONFIRM|SKIP):\s*/, ''));
const because = (d?: LiveDecision) => d?.verdict === 'skip' ? 'Skip because' : d?.verdict === 'confirm' ? 'Trade after confirmation because' : 'Trade because';

function useLive() {
  const api = useStore((s) => s.api);
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let on = true;
    const load = () => api.liveSnapshot().then((x) => { if (on) { setSnap(x); setError(''); } }).catch((e) => on && setError(e.message));
    load(); const h = setInterval(load, 3000);
    return () => { on = false; clearInterval(h); };
  }, [api]);
  return { api, snap, error };
}

export default function Live() {
  const symbol = useStore((s) => s.route.symbol);
  const { api, snap, error } = useLive();
  const [chart, setChart] = useState<LiveChart | null>(null);
  useEffect(() => {
    if (!symbol) { setChart(null); return; }
    const load = () => api.liveChart(symbol).then(setChart).catch(() => {});
    load(); const h = setInterval(load, 5000); return () => clearInterval(h);
  }, [api, symbol]);
  if (symbol) return <Detail symbol={symbol} snap={snap} chart={chart} error={error} />;
  const rows = [...(snap?.symbols || [])].sort((a, b) =>
    (stateOrder[a.state] ?? 9) - (stateOrder[b.state] ?? 9) || (a.rank ?? 999) - (b.rank ?? 999));
  return <div className="screen">
    <div className="hdr"><div><div className="title">Live setups</div><div className="muted small">{snap?.symbols_count ?? 0} SyntX symbols - {snap?.slots.used ?? 0}/{snap?.slots.total ?? 8} slots</div></div><span className={`pill ${snap?.enabled ? 'buy' : 'sell'}`}>{snap?.enabled ? 'Running' : 'Stopped'}</span></div>
    {error && <div className="banner warn">{error}</div>}
    {snap && <><div className="card"><div className="row"><div><div className="lab">Account</div><b>{snap.account.login} {snap.account.real ? 'REAL' : 'DEMO'}</b></div><div className="right"><div className="lab">Balance / equity</div><b>{money(snap.account.balance)} / {money(snap.account.equity)}</b></div></div><div className={`banner mt8 ${snap.guard?.login_ok ? '' : 'warn'}`}>{snap.guard?.login_ok ? `Locked to ${snap.guard.expected_login} ✓` : 'WRONG ACCOUNT'}</div><div className="small mt8">Loss streak <b>{money(snap.guard?.streak_loss_usd || 0)} / $100</b> ({snap.guard?.streak_cycles || 0} cycles){snap.guard?.cooldown_until ? ` · cool-down until ${when(snap.guard.cooldown_until)}` : ''}</div><div className="muted small mt4">Profit stop +$500/day — real accounts only {snap.account.real ? (snap.guard?.profit_stop_active ? '· ACTIVE' : '') : '· off on demo'}</div></div>
    <div className="card"><div className="row"><div><div className="lab">Chart analyst</div><b>{snap.analyst?.mode || 'off'} · {snap.analyst?.model || 'no model'}</b></div><span className="pill">{snap.analyst?.stats?.approved || 0} approved</span></div><div className="muted small mt4">Vetoed {snap.analyst?.stats?.vetoed || 0} · switched {snap.analyst?.stats?.switched || 0} · fallback {snap.analyst?.stats?.fallback || 0}</div>{snap.analyst?.last_error && <div className="small sell mt4">{snap.analyst.last_error}</div>}</div></>}
    <div className="card flush">{rows.map((r) => <button className="plan-row" key={r.symbol} onClick={() => go({ tab: 'live', symbol: r.symbol })}>
      <div className="row"><b>{r.symbol}</b><span><span className={`pill ${r.state === 'in_trade' ? 'buy' : r.state !== 'idle' ? 'brass' : ''}`}>{r.state.replace('_', ' ')}</span>{r.cycle != null && <span className="pill">SL {slStage(r.sl_stage)}</span>}</span></div>
      <div className="muted small mt4">{r.map?.words || r.profile?.words || 'Building the market map'}</div>
      <div className="small mt4"><b>{r.map?.state || r.phase || '-'}</b> · heading {r.map?.heading || '-'} · {r.map?.approach || 'waiting'}</div>
      {(() => { const c = r.candidates?.[0]; const p = r.plan?.buy || r.plan?.sell; return <SideCompact side={(c?.side || p?.side || '').toUpperCase()} p={p} decision={c} d={r.digits} />; })()}
    </button>)}{!rows.length && <Empty>The first 41-symbol scan is running.</Empty>}</div>
  </div>;
}

function SideCompact({ side, p, decision, d = 2 }: { side: string; p?: LivePlan; decision?: LiveDecision; d?: number }) {
  if (!p && !decision) return <div className="muted small mt4">{side}: no valid plan</div>;
  const watch = p?.status === 'watch';
  return <div className="small mt4">
    <div className="row"><span className={side === 'BUY' ? 'buy' : 'sell'}><b>{side} {decision?.score ?? p?.score ?? '-'} - {(decision?.verdict || p?.verdict || p?.status || 'planned').toUpperCase()}</b></span><span>{p?.near_miss ? 'near miss ' : ''}{p?.fast_candle ? 'momentum' : ''}</span></div>
    {watch && p && <div className="brass mt4">WATCH: waiting for a rejection candle at {px(p.zone.bottom, d)}-{px(p.zone.top, d)}</div>}
    {!watch && p && <div className="muted mt4">Limit {px(p.entry, d)} - {p.status}</div>}
    {decision && <div className="muted mt4">{because(decision)} {reasons(decision).join('; ')}</div>}
  </div>;
}

function Detail({ symbol, snap, chart, error }: { symbol: string; snap: LiveSnapshot | null; chart: LiveChart | null; error: string }) {
  const api = useStore((s) => s.api);
  const row = snap?.symbols.find((x) => x.symbol === symbol);
  const [analystPng, setAnalystPng] = useState('');
  useEffect(() => { let url = ''; api.analystChart(symbol).then((x) => { url = x; setAnalystPng(x); }).catch(() => setAnalystPng('')); return () => { if (url) URL.revokeObjectURL(url); }; }, [api, symbol]);
  const d = row?.digits ?? chart?.digits ?? 2;
  const zones = (chart?.zones || []).map((z) => ({ kind: z.kind, lo: z.bottom, hi: z.top, t: null, tf: 'M1', strategy: 'LIVE', style: '', label: z.source } as any));
  const lines = (chart?.lines || []).map((l, i) => ({ id: String(i), price: l.price, label: l.label,
    color: l.label.includes('SL') ? '#E4696F' : l.label.includes('BUY') ? '#2FB5A0' : l.label.includes('SELL') ? '#E4696F' : '#C9A24B', dash: !l.label.includes('LIMIT') }));
  const events = (snap?.events || []).filter((e: any) => e.symbol === symbol).slice(-30).reverse();
  return <div className="screen">
    <div className="hdr"><button className="link" onClick={() => go({ tab: 'live' })}><I.back s={20} /> Live setups</button><span className={`pill ${row?.state === 'in_trade' ? 'buy' : 'brass'}`}>{row?.state || 'idle'}</span></div>
    <div className="row"><div className="title">{symbol}</div><b>{row?.bias || '-'} - {row?.phase || '-'}</b></div>
    {error && <div className="banner warn">{error}</div>}
    <Chart bars={chart?.candles || []} digits={d} tfSec={60} zones={zones} lines={lines} height={340} />
    {analystPng && <div className="card mt12"><div className="lab">Chart analyst's 4-panel view</div><img src={analystPng} alt="Latest chart seen by the analyst" style={{ width: '100%', borderRadius: 8 }} /></div>}
    <div className="card mt12"><div className="lab">Where it's playing</div><b>{row?.map?.words || 'Map not ready'}</b><div className="muted small mt4">{row?.map ? `${row.map.state} · box ${px(row.map.bottom, d)}–${px(row.map.top, d)} · touches ${row.map.touches_bottom || 0}/${row.map.touches_top || 0} · heading ${row.map.heading || '-'} · ${row.map.approach || '-'}` : ''}</div></div>
    <div className="card mt12"><div className="lab">Personality</div><b>{row?.profile?.words || 'Measuring one day of M1 candles'}</b><div className="muted small mt4">{row?.profile ? `${row.profile.family} - drift ${row.profile.drift} - ${row.profile.spikes_per_day} spikes/day - p95 ${px(row.profile.spike_p95, d)}` : 'Profile not ready'}</div></div>
    <div className="card mt12"><div className="row"><div><div className="lab">Keel's read</div><b>{row?.bias_detail || chart?.read.bias || 'Waiting for completed bars'}</b></div>{row?.cycle != null && <span className="pill">SL {slStage(row.sl_stage)}</span>}</div><div className="small mt4">{row?.phase_detail || chart?.read.detail}</div><div className="muted small mt4">Motion {row?.motion || '-'} - likely first {row?.likely_first?.toUpperCase() || '-'}</div></div>
    {(['buy', 'sell'] as const).map((side) => <SideDetail key={side} side={side} p={row?.plan?.[side]} decision={row?.decision?.[side]} d={d} />)}
    {!!row?.candidates?.length && <div className="card"><div className="lab">Candidates</div>{row.candidates.map((c, i) => <Candidate key={i} c={c} />)}</div>}
    {row?.research && <div className="card"><div className="lab">Research</div>{Object.entries(row.research).map(([setup, x]: any) => <div className="small mt4" key={setup}><b>{setup.replaceAll('_', ' ')}</b>: {x?.enabled ? `${Number(x.test_exp_r ?? x.exp_r ?? 0).toFixed(2)}R per trade over ${x.test_n ?? x.n ?? 0} test trades` : 'not proven — not enabled'}</div>)}</div>}
    <div className="row sec-hdr"><b>Change log</b><span className="muted small">latest first</span></div>
    <div className="card flush">{events.map((e: any, i: number) => <div className="pad bb small" key={i}><div className="row"><b>{e.kind}</b><span className="muted">{when(e.t)}</span></div><div className="mt4">{e.message}</div></div>)}{!events.length && <Empty>No changes for this symbol yet.</Empty>}</div>
  </div>;
}

function Candidate({ c }: { c: LiveCandidate }) {
  const trade = (c.reasons || []).filter((x) => x.startsWith('+') || x.startsWith('ARM'));
  const wait = (c.reasons || []).filter((x) => x.startsWith('-') || /^(SKIP|CONFIRM)/.test(x));
  return <div className="mt8"><b className={c.side}>{c.side.toUpperCase()} · {c.setup.replaceAll('_', ' ')} · {c.score} · {c.verdict.toUpperCase()}</b>{trade.length > 0 && <div className="small buy">Trade because: {trade.join('; ')}</div>}{wait.length > 0 && <div className="small brass">Skip / wait because: {wait.join('; ')}</div>}</div>;
}

function SideDetail({ side, p, decision, d }: { side: 'buy' | 'sell'; p?: LivePlan; decision?: LiveDecision; d: number }) {
  if (!p && !decision) return null;
  const name = side.toUpperCase();
  const verdict = decision?.verdict || p?.verdict || p?.status || 'planned';
  const watch = p?.status === 'watch';
  return <div className="card"><div className="row"><b className={side}>{name} - score {decision?.score ?? p?.score ?? '-'} - {verdict.toUpperCase()}</b>{p && <span className="pill">{p.with_trend ? 'with trend' : 'counter-trend'}</span>}</div>
    {watch && p && <div className="banner warn mt8"><b>WATCH</b>: waiting for a rejection candle at {px(p.zone.bottom, d)}-{px(p.zone.top, d)}</div>}
    {decision && <div className={`small mt8 ${decision.verdict === 'skip' ? 'sell' : 'buy'}`}><b>{because(decision)}</b> {reasons(decision).join('; ')}</div>}
    {p && <>
      {p.analyst && <div className="banner mt8"><b>Analyst {p.analyst.choice || 'rules'} {p.analyst.confidence != null ? `${p.analyst.confidence}%` : ''}</b> · {p.analyst.read || p.analyst.wait_for || 'rules decide'}</div>}
      <div className="grid3 mt8 mono small"><div><div className="lab">Entry</div>{px(p.entry, d)}</div><div><div className="lab">SL</div>{px(p.sl, d)}</div><div><div className="lab">TP1</div>{px(p.tps?.[0], d)}</div></div>
      <div className="grid3 mt8 mono small"><div><div className="lab">TP2</div>{px(p.tps?.[1], d)}</div><div><div className="lab">TP3</div>{px(p.tps?.[2], d)}</div><div><div className="lab">Final R:R</div>{p.final_rr}</div></div>
      <div className="small mt8"><b>Keep/cancel:</b> {p.keep}</div><div className="small mt4"><b>Zone reason:</b> {p.zone?.source || p.reason}</div>
      <div className="row mt8 small"><span>Risk all 6</span><b>{money(p.money_at_risk_all_legs)}</b></div><div className="row small"><span>At TP3 all 6</span><b>{money(p.money_at_tp3_all_legs)}</b></div>
      {(p.near_miss || p.fast_candle) && <div className="banner warn mt8">{p.near_miss ? 'Near miss flagged. ' : ''}{p.fast_candle ? 'Momentum candle into zone.' : ''}</div>}
    </>}
  </div>;
}
