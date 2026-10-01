import { useEffect, useState } from 'react';
import type { LiveSnapshot } from '../api';
import { Hold, Seg, Stepper, Toggle } from '../components/ui';
import { toast, useStore } from '../store';

export default function LiveControls() {
  const api = useStore((s) => s.api);
  const [snap, setSnap] = useState<LiveSnapshot | null>(null);
  const [allLot, setAllLot] = useState<number | null>(.1);
  const [symbol, setSymbol] = useState('');
  const [symbolLot, setSymbolLot] = useState<number | null>(.1);
  const load = () => api.liveSnapshot().then((x) => { setSnap(x); setAllLot(x.controls?.lots?.['*'] ?? .1); if (!symbol && x.symbols.length) setSymbol(x.symbols[0].symbol); }).catch(() => {});
  useEffect(() => { load(); const h = setInterval(load, 5000); return () => clearInterval(h); }, [api]);
  const send = async (body: any, msg: string) => { try { await api.liveControl(body); toast('ok', msg); setTimeout(load, 1200); } catch (e: any) { toast('bad', 'Not changed', e.message); } };
  const lots = { ...(snap?.controls?.lots || { '*': .1 }) };
  return <div className="screen"><div className="hdr"><div className="title">Controls</div><span className="muted small">account {snap?.account?.login || '—'}</span></div>
    <div className="card"><div className="row"><div><b>Keel Synthetics</b><div className="muted small">Stop prevents new cycles; open trades remain managed.</div></div><Toggle on={!!snap?.enabled} onChange={(enabled) => send({ enabled }, enabled ? 'Keel started' : 'Keel stopped')} /></div></div>
    <div className="card"><b>Chart analyst mode</b><div className="muted small mt4">Gate asks before placement; shadow records the read; off uses rules only. If the key/API is unavailable, rules decide.</div><Seg value={(snap?.analyst?.mode || 'gate') as 'off' | 'shadow' | 'gate'} onChange={(analyst_mode) => send({ analyst_mode }, `Analyst mode: ${analyst_mode}`)} options={[["off", "Off"], ["shadow", "Shadow"], ["gate", "Gate"]]} /></div>
    <div className="card"><b>Lot per leg</b><Stepper value={allLot} onChange={setAllLot} step={.01} min={.01} max={100} digits={2} label="All symbols" /><button className="btn primary mt8" onClick={() => allLot && send({ lots: { ...lots, '*': allLot } }, 'Default lot saved')}>Save all-symbol lot</button>
      <div className="lab mt16">Per symbol override</div><select className="field" value={symbol} onChange={(e) => { setSymbol(e.target.value); setSymbolLot(lots[e.target.value] ?? allLot ?? .1); }}>{(snap?.symbols || []).map((s) => <option key={s.symbol}>{s.symbol}</option>)}</select><Stepper value={symbolLot} onChange={setSymbolLot} step={.01} min={.01} max={100} digits={2} /><button className="btn mt8" onClick={() => symbolLot && send({ lots: { ...lots, [symbol]: symbolLot } }, `${symbol} lot saved`)}>Save symbol lot</button></div>
    <div className="card"><div className="row"><div><b>Push armed and moved</b><div className="muted small">Off by default; both always stay in the app log.</div></div><Toggle on={!!snap?.controls?.push_armed_moved} onChange={(push_armed_moved) => send({ push_armed_moved }, 'Notification preference saved')} /></div><button className="btn mt12" onClick={() => api.liveNotifyTest().then(() => toast('ok', 'Test notification sent')).catch((e) => toast('bad', 'Not sent', e.message))}>Send test notification</button></div>
    <div className="card"><b>Pending orders</b><div className="muted small mt4">Deletes all pending KL limits, leaving positions untouched.</div><Hold kind="danger" ms={1000} onDone={() => send({ cancel_all_pending_id: Date.now().toString() }, 'Pending limits cancelled')}>Cancel all pending</Hold></div>
  </div>;
}
