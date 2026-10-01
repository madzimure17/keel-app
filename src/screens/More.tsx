// More: instructions console, strategies (switches + plain-English rules), risk & lots, notifications, connection, activity.
import { useEffect, useMemo, useState } from 'react';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHintALLOption } from '@capacitor/barcode-scanner';
import type { EventRow, NotifySettings, Pair } from '../api';
import { EXAMPLES, parse, type Cmd } from '../commands';
import { Empty, Hold, I, Seg, Stepper, Toggle } from '../components/ui';
import { ago, num, signed } from '../fmt';
import { isNative } from '../native';
import { get, go, loadStatic, refresh, run, saveConn, toast, useStore } from '../store';

declare const __WEB__: boolean;

const MENU: [string, string, keyof typeof I, string][] = [
  ['console', 'Instructions', 'term', 'Type what you want done: "close half #123", "buy 0.1 EURUSD sl 1.08"'],
  ['strategies', 'Strategies', 'book', 'What each one does, switch any strategy × symbol on/off'],
  ['risk', 'Risk & lot size', 'shield', 'Risk %, fixed lots, multiplier, max positions'],
  ['notify', 'Notifications', 'bell', 'iPhone alerts through the free ntfy app, Telegram'],
  ['connection', 'Connection', 'link', 'Server address, API token, theme'],
  ['activity', 'Activity log', 'list', 'Everything the engine did and every instruction you sent'],
  ['help', 'Install & refresh', 'gear', 'SideStore 7-day refresh, app version'],
];

export default function More() {
  const route = useStore((s) => s.route);
  const sub = route.sub;
  const back = <button className="icon-btn back" onClick={() => go({ tab: 'more' })}><I.back /> </button>;
  const page = MENU.find((m) => m[0] === sub);
  if (!page) {
    return (
      <div className="screen">
        <div className="hdr"><div className="title">More</div></div>
        <div className="card flush">
          {MENU.map(([k, t, ic, d]) => {
            const Ic = I[ic];
            return (
              <button key={k} className="menu-row" onClick={() => go({ tab: 'more', sub: k })}>
                <span className="menu-ic"><Ic s={20} /></span>
                <span className="grow"><b>{t}</b><div className="muted small">{d}</div></span><I.go s={18} />
              </button>
            );
          })}
        </div>
      </div>
    );
  }
  return (
    <div className="screen">
      <div className="hdr">{back}<div className="title sm">{page[1]}</div><span style={{ width: 36 }} /></div>
      {sub === 'console' && <Console />}
      {sub === 'strategies' && <Strategies />}
      {sub === 'risk' && <RiskPage />}
      {sub === 'notify' && <Notify />}
      {sub === 'connection' && <Connection />}
      {sub === 'activity' && <Activity />}
      {sub === 'help' && <Help />}
    </div>
  );
}

function Console() {
  const st = useStore((s) => s.state);
  const symbols = useStore((s) => s.symbols);
  const [text, setText] = useState('');
  const [log, setLog] = useState<{ t: number; text: string; ok: boolean; res: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const parsed = useMemo(() => parse(text, st?.positions || [], symbols.map((s) => s.symbol), st?.groups || []), [text, st, symbols]);
  const send = async () => {
    setBusy(true);
    for (const c of parsed.cmds as Cmd[]) {
      const r = await run(c.action, c.args, c.text);
      setLog((l) => [{ t: Date.now(), text: c.text, ok: !!r.ok, res: r.ok ? (r.ticket ? `#${r.ticket}` : 'done') : r.error || r.comment || 'failed' }, ...l].slice(0, 50));
    }
    setBusy(false);
    setText('');
  };
  return (
    <>
      <div className="muted small">Write one instruction per line. Keel shows what it will do; hold the button to send. MT5's answer comes back below.</div>
      <textarea className="field console" rows={4} value={text} placeholder="close half #123456" autoCapitalize="off" autoCorrect="off" spellCheck={false}
        onChange={(e) => setText(e.target.value)} />
      {(parsed.cmds.length > 0 || parsed.errors.length > 0) && (
        <div className="card">
          {parsed.cmds.map((c, i) => <div key={i} className="row small"><span>→ {c.text}</span></div>)}
          {parsed.errors.map((e, i) => <div key={'e' + i} className="small sell">{e}</div>)}
        </div>
      )}
      <Hold kind="primary" disabled={busy || !parsed.cmds.length || parsed.errors.length > 0} onDone={send}>
        {busy ? 'Sending…' : `Send ${parsed.cmds.length || ''} instruction${parsed.cmds.length === 1 ? '' : 's'}`}
      </Hold>
      {log.length > 0 && <div className="card flush mt12">{log.map((l, i) => (
        <div key={i} className="pad bb small"><span className={l.ok ? 'buy' : 'sell'}>{l.ok ? '✓' : '✗'}</span> {l.text} <span className="muted">· {l.res}</span></div>))}</div>}
      <div className="section">Examples (tap to use)</div>
      <div className="card flush">{EXAMPLES.map((e) => (
        <button key={e} className="example" onClick={() => setText((t) => (t ? t + '\n' : '') + e.split('  ')[0])}>{e}</button>))}</div>
      <div className="muted small">Your open tickets: {(st?.positions || []).map((p) => `#${p.ticket} ${p.symbol}`).join(', ') || 'none'}</div>
    </>
  );
}

function Strategies() {
  const st = useStore((s) => s.state);
  const info = useStore((s) => s.info);
  const [open, setOpen] = useState<string | null>(null);
  const groups = useMemo(() => {
    const g = new Map<string, Pair[]>();
    for (const p of st?.pairs || []) g.set(p.strategy, [...(g.get(p.strategy) || []), p]);
    return [...g.entries()];
  }, [st]);
  if (!st) return <Empty>Connecting…</Empty>;
  return (
    <>
      <div className="muted small">Every strategy trades every symbol it fits, unless you switch it off here. Your switch always wins. Tap a strategy to read its rules.</div>
      {groups.map(([name, pairs]) => {
        const si = info?.strategies.find((x) => x.name === name);
        const on = pairs.filter((p) => p.enabled).length;
        return (
          <div key={name} className="card">
            <button className="row plain" onClick={() => setOpen(open === name ? null : name)}>
              <div className="left"><b>{si?.title || name}</b><div className="muted small">{name} · {pairs[0].style} · {pairs[0].tf} · {on}/{pairs.length} on</div></div>
              <span className={`chev ${open === name ? 'open' : ''}`}><I.go s={16} /></span>
            </button>
            {open === name && si && (
              <div className="rules">
                {Object.entries(si.rules || {}).map(([k, v]) => <div key={k}><span className="lab">{k}</span><div className="small">{v}</div></div>)}
                <div className="muted small">Source: {si.source}</div>
              </div>
            )}
            {open === name && pairs.map((p) => (
              <div key={p.key} className="pair">
                <div className="row">
                  <div><b>{p.symbol}</b> {p.override != null && <span className="pill brass">your switch</span>}</div>
                  <Toggle on={p.enabled} onChange={(v) => run('enable', { key: p.key, on: v }, `${name} ${p.symbol} ${v ? 'on' : 'off'}`)} />
                </div>
                <div className="muted small mono">
                  backtest {p.stats?.n ? `${p.stats.n} trades · ${signed(p.stats.avg_R, 3)} R avg · PF ${num(p.stats.pf)} · win ${num((p.stats.win ?? 0) * 100, 0)}%` : 'not run yet'}
                  {p.backtest_pass != null ? (p.backtest_pass ? ' · passes' : ' · does not pass') : ''}
                </div>
                {p.watch && <div className="small mt4"><span className="pill">{p.watch.state}</span> {p.watch.text}</div>}
                {p.override != null && <button className="link small" onClick={() => run('reset_override', { key: p.key }, 'Back to automatic')}>reset to automatic</button>}
              </div>
            ))}
          </div>
        );
      })}
      <Hold kind="plain" onDone={() => run('backtest', {}, 'Backtest started (a few minutes)')}>Re-run the backtest on this broker's history</Hold>
    </>
  );
}

function RiskPage() {
  const risk = useStore((s) => s.state?.risk);
  const eq = useStore((s) => s.state?.account?.equity || 0);
  const [r, setR] = useState(risk);
  useEffect(() => { if (risk && !r) setR(risk); }, [risk]);
  if (!r) return <Empty>Connecting…</Empty>;
  const mode = r.lot_mode || 'risk';
  const mult = r.lot_multiplier ?? 1;
  const save = () => run('set_risk', { ...r, lot_mode: mode, lot_multiplier: mult }, 'Risk settings saved');
  return (
    <>
      <div className="muted small">These size every trade Keel opens. Your own trades from the ticket use what you set there.</div>
      <div className="lab mt12">How Keel sizes trades</div>
      <Seg value={mode} onChange={(v) => setR({ ...r, lot_mode: v })} options={[['risk', 'Risk % of equity'], ['fixed', 'Fixed lots']]} />
      {mode === 'risk'
        ? <Stepper label="Risk per trade (%)" value={r.risk_per_trade_pct} digits={2} step={0.25} min={0.01} max={50}
            onChange={(v) => setR({ ...r, risk_per_trade_pct: v ?? 0.5 })} suffix={`= about ${(eq * r.risk_per_trade_pct / 100 * mult).toFixed(2)} per trade at today's equity`} />
        : <Stepper label="Lots per trade" value={r.fixed_lots ?? 0.01} digits={2} step={0.01} min={0.01} onChange={(v) => setR({ ...r, fixed_lots: v ?? 0.01 })} />}
      <Stepper label="Lot multiplier (× on every Keel trade)" value={mult} digits={2} step={0.25} min={0.1} max={20}
        onChange={(v) => setR({ ...r, lot_multiplier: v ?? 1 })} suffix="2 = double size, 0.5 = half" />
      <div className="lab mt12">Positions per setup (split over TP1 / TP2 / TP3)</div>
      <Seg value={String(r.group_legs ?? 6) as '6' | '3' | '1'} onChange={(v) => setR({ ...r, group_legs: Number(v) })}
        options={[['6', '6 (2 per TP)'], ['3', '3 (1 per TP)'], ['1', '1 (TP1 only)']]} />
      <div className="muted small">If the lots are too small for 6, Keel uses 3, then 1 (or the minimum lot per position when that switch is on).</div>
      <Stepper label="Max open trades (a 6-position setup counts as one)" value={r.max_open_positions} digits={0} step={1} min={1} max={200}
        onChange={(v) => setR({ ...r, max_open_positions: Math.round(v ?? 12) })} />
      <div className="row card mt8"><div><b>Trade the minimum lot</b><div className="muted small">when your risk % buys less than the broker's minimum</div></div>
        <Toggle on={!!r.min_lot_if_below} onChange={(v) => setR({ ...r, min_lot_if_below: v })} /></div>
      <Hold kind="primary" onDone={save}>Save risk settings</Hold>
    </>
  );
}

function Notify() {
  const api = useStore((s) => s.api);
  const [n, setN] = useState<NotifySettings | null>(null);
  const [topic, setTopic] = useState('');
  const [server, setServer] = useState('https://ntfy.sh');
  const [tg, setTg] = useState({ token: '', chat: '' });
  const load = () => api.notify().then((d) => { setN(d); setTopic(d.ntfy_topic); setServer(d.ntfy_server); setTg((t) => ({ ...t, chat: d.telegram_chat })); }).catch(() => {});
  useEffect(() => { load(); }, [api]);
  const gen = () => {
    const a = new Uint8Array(9); crypto.getRandomValues(a);
    setTopic('keel-' + [...a].map((b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join(''));
  };
  const mute = n?.mute || [];
  const setMute = (tag: string, off: boolean) => run('set_notify', { mute: off ? [...mute, tag] : mute.filter((x) => x !== tag) }, 'Saved').then(load);
  const copy = (s: string) => { navigator.clipboard?.writeText(s).then(() => toast('ok', 'Copied', s)).catch(() => toast('info', s)); };
  return (
    <>
      <div className="card">
        <b>iPhone notifications (ntfy)</b>
        <div className="small mt4">A sideloaded app can't receive Apple push directly, so Keel sends through <b>ntfy</b>, a free app from the App Store. Tapping a notification opens Keel on that chart.</div>
        <ol className="small steps">
          <li>Install <b>ntfy</b> from the App Store.</li>
          <li>Tap <b>New topic</b> below, then <b>Save</b>.</li>
          <li>Tap <b>Copy topic</b>. In ntfy tap <b>+</b>, paste it, keep server <b>ntfy.sh</b>, tap <b>Subscribe</b>. Allow notifications.</li>
          <li>Tap <b>Send test</b> here: your phone buzzes within seconds.</li>
        </ol>
        <div className="lab">Topic (keep it secret: anyone with it can read your alerts)</div>
        <input className="field mono" value={topic} onChange={(e) => setTopic(e.target.value.trim())} placeholder="keel-…" autoCapitalize="off" />
        <div className="grid3 mt8">
          <button className="btn small-btn" onClick={gen}>New topic</button>
          <button className="btn small-btn" disabled={!topic} onClick={() => copy(topic)}>Copy topic</button>
          <button className="btn small-btn primary" onClick={() => run('set_notify', { ntfy_topic: topic, ntfy_server: server }, 'Notifications saved').then(load)}>Save</button>
        </div>
        <div className="lab mt8">ntfy server</div>
        <input className="field mono" value={server} onChange={(e) => setServer(e.target.value.trim())} autoCapitalize="off" />
        <button className="btn mt8" onClick={() => run('test_push', {}, 'Test sent')}>Send test</button>
        {n && <div className="muted small mt8">Sent {n.sent} · {n.errors.length ? <span className="sell">{n.errors.slice(-1)[0]}</span> : 'no errors'}</div>}
      </div>
      <div className="card">
        <b>What to send</b>
        {[['trade', 'Trades opened, closed, reduced'], ['error', 'Order errors'], ['summary', 'Daily summary (17:00 New York)'], ['keel', 'Start / pause, backtest']].map(([tag, t]) => (
          <div key={tag} className="row mt8"><span className="small">{t}</span><Toggle on={!mute.includes(tag)} onChange={(v) => setMute(tag, !v)} /></div>
        ))}
      </div>
      <div className="card">
        <b>Telegram (optional)</b> {n?.telegram_set && <span className="pill buy">on</span>}
        <div className="muted small">Bot token from @BotFather, chat id from @userinfobot.</div>
        <input className="field mono" value={tg.token} onChange={(e) => setTg({ ...tg, token: e.target.value.trim() })} placeholder={n?.telegram_set ? 'saved (enter to replace)' : 'bot token'} autoCapitalize="off" />
        <input className="field mono" value={tg.chat} onChange={(e) => setTg({ ...tg, chat: e.target.value.trim() })} placeholder="chat id" autoCapitalize="off" />
        <button className="btn mt8" onClick={() => run('set_notify', { ...(tg.token ? { telegram_token: tg.token } : {}), telegram_chat: tg.chat }, 'Telegram saved').then(load)}>Save Telegram</button>
      </div>
    </>
  );
}

function Connection() {
  const conn = useStore((s) => s.conn);
  const online = useStore((s) => s.online);
  const err = useStore((s) => s.lastError);
  const [url, setUrl] = useState(conn.url);
  const [token, setToken] = useState(conn.token);
  const [msg, setMsg] = useState('');
  const scan = async () => {
    try {
      const r = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHintALLOption.ALL,
        scanInstructions: 'Point the camera at OWNER_APP_SETUP.png', scanButton: false });
      const v = JSON.parse(r.ScanResult || '{}');
      if (!v.api || !v.token) throw new Error('This is not a Keel setup QR');
      const u = String(v.api).replace(/\/+$/, ''); const t = String(v.token);
      setUrl(u); setToken(t); await saveConn({ url: u, token: t, ntfy: String(v.ntfy || '') });
      setMsg('Setup QR saved ✓'); toast('ok', 'Keel setup saved');
    } catch (e: any) { setMsg(e?.message || 'QR scan cancelled'); }
  };
  const test = async () => {
    const u = url.trim().replace(/\/+$/, '');
    await saveConn({ url: u.startsWith('http') ? u : 'https://' + u, token: token.trim() });
    setMsg('Testing…');
    try {
      const h = await get().api.health();
      await get().api.liveSnapshot();
      setMsg(`Connected ✓ (engine API v${h.version ?? '?'})`);
      toast('ok', 'Connected');
      refresh(); loadStatic();
      setTimeout(() => go({ tab: 'live' }), 600);
    } catch (e: any) { setMsg(e.message); }
  };
  return (
    <>
      <div className="card">
        <button className="btn primary" onClick={scan}>Scan setup QR</button>
        <div className="muted small mt8">Point the camera at C:\Keel\OWNER_APP_SETUP.png on the VPS screen, or enter the values below.</div>
        <div className="lab">Server address</div>
        <input className="field mono" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-vps.example:8443"
          autoCapitalize="off" autoCorrect="off" inputMode="url" />
        <div className="lab mt8">API token (stored only in Capacitor Preferences)</div>
        <input className="field mono" value={token} onChange={(e) => setToken(e.target.value)} placeholder="paste the token" autoCapitalize="off" autoCorrect="off" />
        <button className="btn primary mt12" onClick={test}>Save & test</button>
        {msg && <div className={`small mt8 ${msg.includes('✓') ? 'buy' : 'sell'}`}>{msg}</div>}
        <div className="muted small mt8">Tailscale must be ON on this iPhone. Status: {online ? 'online' : err || 'not connected'}</div>
        {conn.ntfy && <a className="btn mt8" href={conn.ntfy}>Open notification topic in ntfy</a>}
      </div>
      <div className="card row"><span>Theme</span>
        <Seg value={conn.theme} onChange={(v) => saveConn({ theme: v })} options={[['dark', 'Dark'], ['light', 'Light']]} /></div>
    </>
  );
}

function Activity() {
  const api = useStore((s) => s.api);
  const [ev, setEv] = useState<EventRow[]>([]);
  const [f, setF] = useState('ALL');
  useEffect(() => { const l = () => api.events(300).then(setEv).catch(() => {}); l(); const h = setInterval(l, 8000); return () => clearInterval(h); }, [api]);
  const kinds = ['ALL', ...Array.from(new Set(ev.map((e) => e.kind)))];
  return (
    <>
      <div className="chips">{kinds.map((k) => <button key={k} className={`chip small ${f === k ? 'on' : ''}`} onClick={() => setF(k)}>{k}</button>)}</div>
      <div className="card flush mt8">
        {ev.filter((e) => f === 'ALL' || e.kind === f).map((e) => (
          <div key={e.id} className="pad bb small"><span className={`pill ${e.kind === 'ERROR' ? 'sell' : e.kind === 'APP' ? 'brass' : ''}`}>{e.kind}</span> {e.text}
            <div className="muted">{ago(e.ts)}</div></div>
        ))}
        {!ev.length && <Empty>Nothing yet.</Empty>}
      </div>
    </>
  );
}

function Help() {
  return (
    <div className="card small">
      <b>Keel {isNative ? 'iPhone app' : typeof __WEB__ !== 'undefined' && __WEB__ ? 'web app' : 'app'} v2.0</b>
      <p>Installed with <b>SideStore</b> on a free Apple ID, so it must be refreshed every 7 days:
        open <b>SideStore → My Apps → Refresh All</b> (with its VPN/LocalDevVPN on). SideStore can also refresh in the background. If Keel stops opening, that is the 7 days running out: refresh, nothing is lost.</p>
      <p>Keel talks only to your VPS through <b>Tailscale</b>; keep Tailscale on.</p>
      <p>Notifications come through the <b>ntfy</b> app (More → Notifications).</p>
    </div>
  );
}
