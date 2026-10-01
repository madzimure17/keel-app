import { useEffect, useState } from 'react';
import { GroupRow, GroupSheet, PositionSheet, PosRow } from '../components/Trade';
import { Empty, Hold, I } from '../components/ui';
import { ago, cls, money, serverToUtc, signed, when } from '../fmt';
import { go, refresh, run, toast, useStore } from '../store';

export default function Home() {
  const st = useStore((s) => s.state);
  const online = useStore((s) => s.online);
  const err = useStore((s) => s.lastError);
  const api = useStore((s) => s.api);
  const info = useStore((s) => s.info);
  const [sel, setSel] = useState<number | null>(null);
  const [gsel, setGsel] = useState<string | null>(null);
  const [eq, setEq] = useState<{ day: string; equity: number }[]>([]);
  const [sx, setSx] = useState<any>(null);
  const [sxErr, setSxErr] = useState('');

  useEffect(() => { api.equity().then(setEq).catch(() => {}); }, [api]);
  useEffect(() => {
    if (!info?.syntx) return;
    const f = () => api.syntx().then((d) => { setSx(d); setSxErr(''); }).catch((e) => setSxErr(e.message));
    f();
    const h = setInterval(f, 10000);
    return () => clearInterval(h);
  }, [api, info?.syntx]);

  if (!st) {
    return (
      <div className="screen">
        <Header />
        <div className={`banner ${online ? 'info' : 'warn'}`}>{err || 'Connecting…'}</div>
        {err && <button className="btn" onClick={() => go({ tab: 'more', sub: 'connection' })}>Check connection</button>}
      </div>
    );
  }
  const a = st.account, cur = a.currency || '';
  const running = st.state === 'RUNNING';
  const open = st.positions;
  const floating = open.reduce((s, p) => s + (p.profit || 0), 0);
  const nOn = st.pairs.filter((p) => p.enabled).length;

  return (
    <div className="screen">
      <Header />
      {!st.connected && <div className="banner warn">MT5 is not connected on the VPS. {st.error}</div>}
      {st.connected && st.error && <div className="banner warn">{st.error}</div>}
      {!online && <div className="banner warn">Offline: {err}. Showing the last data.</div>}

      <div className="card hero">
        <div className="row">
          <div>
            <div className="lab">Equity</div>
            <div className="big mono">{money(a.equity, cur)}</div>
            <div className="muted small mono">Balance {money(a.balance, cur)} · Free margin {money(a.margin_free, cur)}</div>
          </div>
          <span className={`pill ${running ? 'buy' : 'brass'}`}><span className="dot" />{running ? 'Running' : 'Paused'}</span>
        </div>
        <div className="grid3 mt12">
          <div><div className="lab">Open P/L</div><div className={`mono b ${cls(floating)}`}>{money(floating)}</div></div>
          <div><div className="lab">Today</div><div className={`mono b ${cls(st.today.profit)}`}>{money(st.today.profit)}</div>
            <div className="muted small">{st.today.trades} closed · {signed(st.today.R)} R</div></div>
          <div><div className="lab">Open trades</div><div className="mono b">{(st.groups || []).length + open.filter((p) => !p.group_id || !(st.groups || []).find((g) => g.gid === p.group_id)).length}</div>
            <div className="muted small">{nOn} strategy×symbol on</div></div>
        </div>
        {eq.length > 1 && <Spark data={eq.map((x) => x.equity)} />}
        <div className="mt12">
          {running
            ? <Hold kind="plain" onDone={() => run('pause', {}, 'Keel paused: no new trades')}><I.pause s={18} /> Pause Keel (open trades stay managed)</Hold>
            : <Hold kind="primary" onDone={() => run('start', {}, 'Keel running')}><I.play s={18} /> Start Keel</Hold>}
        </div>
        <div className="muted small mt8">Account {a.login} · {a.server} · 1:{a.leverage}{a.trade_mode === 0 ? ' · demo' : a.trade_mode === 2 ? ' · real' : ''}</div>
      </div>

      {!!st.analysis?.length && (() => {
        const rs = st.analysis!;
        const hot = rs.filter((r) => r.phase === 'CONFIRMED' || r.phase === 'IN_ZONE' || r.phase === 'RETRACING')
          .sort((x, y) => ({ CONFIRMED: 0, IN_ZONE: 1, RETRACING: 2 } as any)[x.phase] - ({ CONFIRMED: 0, IN_ZONE: 1, RETRACING: 2 } as any)[y.phase]
            || (y.confidence || 0) - (x.confidence || 0)).slice(0, 5);
        return (
          <>
            <div className={`banner ${rs[0].safe ? 'info' : 'warn'} mt12`}>{rs[0].safe ? '🟢 ' : '⛔ '}{rs[0].session}</div>
            <div className="row sec-hdr"><b>Markets to watch</b><button className="link" onClick={() => go({ tab: 'analysis' })}>All plans ›</button></div>
            <div className="card flush">
              {hot.map((r) => (
                <button key={r.symbol + r.profile} className="plan-row" onClick={() => go({ tab: 'analysis', symbol: r.symbol, sub: r.profile })}>
                  <div className="row"><span><b>{r.symbol}</b> <span className="muted small">{r.profile.toLowerCase()}</span></span>
                    <span className={`pill ${r.phase === 'CONFIRMED' ? 'buy' : 'brass'}`}>{r.phase === 'CONFIRMED' ? 'Confirmed' : r.phase === 'IN_ZONE' ? 'In zone' : 'Coming to zone'}{r.side ? ` · ${r.side}` : ''}</span></div>
                  <div className="muted small mt4">{r.headline}</div>
                </button>
              ))}
              {!hot.length && <Empty>No market is near a zone right now. Keel keeps reading every 5 minutes.</Empty>}
            </div>
          </>
        );
      })()}

      <div className="row sec-hdr"><b>Open positions</b><button className="link" onClick={() => go({ tab: 'positions' })}>Manage ›</button></div>
      <div className="card flush">
        {(st.groups || []).slice(0, 5).map((g) => <GroupRow key={g.gid} g={g} onTap={() => setGsel(g.gid)} />)}
        {open.filter((p) => !p.group_id || !(st.groups || []).find((g) => g.gid === p.group_id)).slice(0, 5)
          .map((p) => <PosRow key={p.ticket} p={p} onTap={() => setSel(p.ticket)} />)}
        {!open.length && <Empty>No open positions. Keel opens them when a setup appears; you can open one from the chart.</Empty>}
      </div>

      {info?.syntx && (
        <>
          <div className="row sec-hdr"><b>SyntX engine</b><span className="muted small">separate account</span></div>
          <div className="card">
            {sxErr ? <div className="muted">{sxErr}</div> : !sx ? <div className="muted">…</div> : (
              <>
                <div className="row"><span>State</span><b>{String(sx.state ?? sx.status ?? sx.mode ?? '—')}</b></div>
                {sx.equity != null && <div className="row mt4"><span>Equity</span><span className="mono">{money(sx.equity)}</span></div>}
                <div className="grid2 mt8">
                  <button className="btn" onClick={() => api.syntxControl('start').then(() => toast('ok', 'SyntX start sent')).catch((e) => toast('bad', 'SyntX', e.message))}>Start</button>
                  <button className="btn" onClick={() => api.syntxControl('pause').then(() => toast('ok', 'SyntX pause sent')).catch((e) => toast('bad', 'SyntX', e.message))}>Pause</button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      <div className="row sec-hdr"><b>High-impact news, next 24 h</b><span className="muted small">no new trades ±15 min</span></div>
      <div className="card flush">
        {st.news?.length ? st.news.map((n, i) => (
          <div className="list-item pad" key={i}><span><b>{n.currency}</b> {n.name}</span><span className="muted mono">{when(serverToUtc(n.t ?? n.time))}</span></div>
        )) : <Empty>{st.calendar_age_h == null ? 'No calendar yet: attach the KeelNews EA in the Markets terminal.' : 'Nothing high-impact in the next 24 hours.'}</Empty>}
      </div>
      {!!st.notify_errors?.length && <div className="banner warn">Notifications: {st.notify_errors.slice(-1)[0]}</div>}
      <div className="muted small center">Updated {ago(st.ts)}</div>
      <GroupSheet gid={gsel} onClose={() => setGsel(null)} onLeg={(t) => { setGsel(null); setSel(t); }} />
      <PositionSheet ticket={sel} onClose={() => setSel(null)} />
    </div>
  );
}

function Header() {
  const online = useStore((s) => s.online);
  return (
    <div className="hdr">
      <div className="title">Keel</div>
      <button className="icon-btn" onClick={refresh} aria-label="refresh"><span className={`conn ${online ? 'on' : ''}`} /><I.refresh s={20} /></button>
    </div>
  );
}

function Spark({ data }: { data: number[] }) {
  const w = 300, h = 44;
  const lo = Math.min(...data), hi = Math.max(...data);
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - 3 - ((v - lo) / (hi - lo || 1)) * (h - 6)}`).join(' ');
  const up = data[data.length - 1] >= data[0];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={up ? 'var(--buy)' : 'var(--sell)'} strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
