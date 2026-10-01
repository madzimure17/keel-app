import { useEffect, useState } from 'react';
import { Empty } from '../components/ui';
import { money } from '../fmt';
import { useStore } from '../store';

export default function LiveStats() {
  const api = useStore((s) => s.api);
  const [stats, setStats] = useState<any>({ overall: {}, per_symbol: {}, by_setup: {} });
  const [research, setResearch] = useState<any>(null);
  const [virtual, setVirtual] = useState<any>({});
  useEffect(() => {
    const load = () => {
      api.liveStats().then(setStats).catch(() => {});
      api.liveSnapshot().then((s) => setVirtual(s.virtual || {})).catch(() => {});
      api.researchSummary().then(setResearch).catch(() => {});
    };
    load(); const h = setInterval(load, 5000); return () => clearInterval(h);
  }, [api]);
  const o = stats.overall || {}; const rows = Object.entries(stats.per_symbol || {}) as [string, any][];
  const pct = (v: any) => v == null ? '—' : `${Math.round(v * 100)}%`;
  return <div className="screen"><div className="hdr"><div className="title">Stats & research</div><span className="muted small">results in R</span></div>
    <div className="card"><div className="grid3"><div><div className="lab">Cycles</div><b>{o.cycles || 0}</b></div><div><div className="lab">Fills</div><b>{o.filled || 0}</b></div><div><div className="lab">Total R</div><b>{Number(o.r || 0).toFixed(2)}R</b></div></div>
      <div className="grid3 mt12"><div><div className="lab">TP1</div><b>{pct(o.tp1_rate)}</b></div><div><div className="lab">TP3</div><b className="brass">{pct(o.tp3_rate)}</b></div><div><div className="lab">Full SL</div><b>{pct(o.filled ? (o.sl || 0) / o.filled : null)}</b></div></div><div className="row mt12"><span>Misses {o.missed || 0}</span><b>Net {money(o.profit || 0)}</b></div></div>
    <div className="row sec-hdr"><b>By setup</b><span className="muted small">TP rates · R · $</span></div><div className="card flush">{Object.entries(stats.by_setup || {}).map(([name, x]: any) => <div className="pad bb" key={name}><div className="row"><b>{name.replaceAll('_', ' ')}</b><b>{Number(x.r || 0).toFixed(2)}R · {money(x.profit || 0)}</b></div><div className="muted small">{x.n || 0} trades · TP1 {pct(x.n ? x.tp1 / x.n : null)} · TP3 {pct(x.n ? x.tp3 / x.n : null)} · full SL {pct(x.n ? x.full_sl / x.n : null)}</div></div>)}{!Object.keys(stats.by_setup || {}).length && <Empty>No completed setups yet.</Empty>}</div>
    <div className="card"><div className="lab">Skipped setups followed virtually</div><b>{virtual.verdict || 'Waiting for virtual outcomes'}</b>{Object.entries(virtual.by_source || {}).map(([source, x]: any) => <div className="small mt4" key={source}>{source}: would have won {x.won || x.wins || 0} / lost {x.lost || x.losses || 0}, {Number(x.r || 0).toFixed(2)}R</div>)}</div>
    <div className="card"><div className="row"><div><div className="lab">Research</div><b>{research?.enabled_count ?? 0} enabled symbol + setup pairs</b></div><span className="pill">{research?.days || '—'} days</span></div><div className="muted small mt4">Generated {research?.generated || 'not yet'}</div>{(research?.overall || []).map((x: string) => <div className="small mt4" key={x}>{x}</div>)}<div className="mt8">{(research?.enabled_pairs || []).slice(0, 30).map((x: string) => <span className="pill mt4" key={x}>{x}</span>)}</div>{(research?.research_log || []).slice(-5).map((x: string, i: number) => <div className="muted small mt4" key={i}>{x}</div>)}</div>
    <div className="row sec-hdr"><b>Per symbol</b></div><div className="card flush">{rows.sort((a, b) => (b[1].cycles || 0) - (a[1].cycles || 0)).map(([s, x]) => <div className="pad bb" key={s}><div className="row"><b>{s}</b><b>{money(x.profit)}</b></div><div className="small muted mt4">{x.cycles} cycles · TP1 {pct(x.tp1_rate)} · TP3 {pct(x.tp3_rate)} · SL {x.sl} · misses {x.missed}</div></div>)}{!rows.length && <Empty>Stats begin after the first cycle or miss.</Empty>}</div>
  </div>;
}
