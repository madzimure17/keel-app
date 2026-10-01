// Every setup Keel's strategies produced — taken, skipped, failed or waiting — with the reason, newest first.
import { useEffect, useState } from 'react';
import type { Setup } from '../api';
import SetupCard from '../components/SetupCard';
import { Empty, Seg } from '../components/ui';
import { go, setChart, useStore } from '../store';

type F = 'ALL' | 'TAKEN' | 'SKIPPED' | 'FAILED' | 'PENDING';

export default function Setups({ embedded }: { embedded?: boolean } = {}) {
  const api = useStore((s) => s.api);
  const symbols = useStore((s) => s.symbols);
  const [rows, setRows] = useState<Setup[]>([]);
  const [f, setF] = useState<F>('ALL');
  const [style, setStyle] = useState('ALL');
  const [sym, setSym] = useState('');
  const [err, setErr] = useState('');
  useEffect(() => {
    const load = () => api.setups(sym || undefined, 300).then((r) => { setRows(r); setErr(''); }).catch((e) => setErr(e.message));
    load();
    const h = setInterval(load, 8000);
    return () => clearInterval(h);
  }, [api, sym]);
  const shown = rows.filter((r) => (f === 'ALL' || r.status === f) && (style === 'ALL' || r.style === style));
  const count = (s: string) => rows.filter((r) => r.status === s).length;
  return (
    <div className={embedded ? '' : 'screen'}>
      {!embedded && <div className="hdr"><div className="title">Setups</div></div>}
      <div className="muted small pad-x">Every signal your strategies produced, and what Keel did with it. Tap one to see it on the chart.</div>
      <div className="mt8"><Seg value={f} onChange={setF} options={[['ALL', 'All'], ['TAKEN', `Taken ${count('TAKEN')}`], ['SKIPPED', `Skipped ${count('SKIPPED')}`], ['FAILED', 'Failed'], ['PENDING', 'Orders']]} /></div>
      <div className="row mt8 gap">
        <select className="mini-sel grow" value={sym} onChange={(e) => setSym(e.target.value)}>
          <option value="">All symbols</option>{symbols.map((s) => <option key={s.symbol} value={s.symbol}>{s.symbol}</option>)}
        </select>
        <select className="mini-sel grow" value={style} onChange={(e) => setStyle(e.target.value)}>
          <option value="ALL">All styles</option><option value="SCALP">Scalp</option><option value="DAY">Day</option><option value="SWING">Swing</option><option value="MANUAL">Manual</option>
        </select>
      </div>
      {err && <div className="banner warn mt8">{err}</div>}
      <div className="mt8">
        {shown.map((s) => (
          <div key={s.id} className="card"><SetupCard s={s} onOpen={() => { setChart({ symbol: s.symbol }); go({ tab: 'chart' }); }} /></div>
        ))}
        {!shown.length && <Empty>No setups here yet. They appear as soon as a strategy sees one at a bar close.</Empty>}
      </div>
    </div>
  );
}
