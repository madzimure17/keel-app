// App-wide state: connection settings, the engine's live state (polled), toasts, navigation.
import { useSyncExternalStore } from 'react';
import { Api, type Info, type State, type Sym, type EventRow } from './api';
import { haptic, loadPref, savePref } from './native';

declare const __WEB__: boolean;

export type Conn = { url: string; token: string; ntfy?: string; theme: 'dark' | 'light'; tz: 'local' | 'server' };
export type Route = { tab: 'live' | 'live_stats' | 'live_controls' | 'home' | 'chart' | 'analysis' | 'setups' | 'positions' | 'more'; sub?: string; symbol?: string; focus?: number };
export type Toast = { id: number; kind: 'ok' | 'bad' | 'info'; title: string; body?: string };

type S = {
  ready: boolean; conn: Conn; api: Api; state: State | null; info: Info | null; symbols: Sym[];
  online: boolean; lastError: string; lastOk: number; route: Route; toasts: Toast[]; lastEventId: number;
  chart: { symbol: string; tf: string };
  prefill: Prefill | null;                                   // a trade handed from the Analysis screen to the chart ticket
};
export type Prefill = { symbol: string; side: 1 | -1; kind: 'market' | 'limit'; price: number | null; sl: number;
  tp1: number; tp2: number; tp3: number; note: string };

const dfltConn: Conn = {
  url: typeof __WEB__ !== 'undefined' && __WEB__ ? location.origin : '', token: '', ntfy: '', theme: 'dark', tz: 'local',
};

let s: S = {
  ready: false, conn: dfltConn, api: new Api('', ''), state: null, info: null, symbols: [], online: false,
  lastError: '', lastOk: 0, route: { tab: 'live' }, toasts: [], lastEventId: 0, chart: { symbol: 'EURUSD', tf: 'M5' }, prefill: null,
};
const subs = new Set<() => void>();
function set(p: Partial<S>) { s = { ...s, ...p }; subs.forEach((f) => f()); }
export function get() { return s; }
export function useStore<T>(sel: (x: S) => T): T {
  return useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => sel(s));
}

export async function boot() {
  const conn = await loadPref<Conn>('keel.conn', dfltConn);
  const chart = await loadPref('keel.chart', s.chart);
  if (!conn.url && dfltConn.url) conn.url = dfltConn.url;
  document.documentElement.dataset.theme = conn.theme;
  set({ conn, chart, api: new Api(conn.url, conn.token), ready: true,
    route: conn.url && conn.token ? { tab: 'live' } : { tab: 'more', sub: 'connection' } });
  if (conn.url && conn.token) { refresh(); loadStatic(); }
}

export async function saveConn(c: Partial<Conn>) {
  const conn = { ...s.conn, ...c };
  document.documentElement.dataset.theme = conn.theme;
  set({ conn, api: new Api(conn.url, conn.token), state: null, info: null });
  await savePref('keel.conn', conn);
}
export function setChart(c: Partial<S['chart']>) {
  const chart = { ...s.chart, ...c };
  set({ chart });
  savePref('keel.chart', chart);
}

export function tradePlan(p: Prefill) { setChart({ symbol: p.symbol }); set({ prefill: p }); go({ tab: 'chart' }); }
export function takePrefill() { const p = s.prefill; if (p) set({ prefill: null }); return p; }

export function go(r: Route) { haptic.tap(); set({ route: r }); window.scrollTo?.(0, 0); }
/** keel://chart/EURUSD → chart; keel://positions; keel://setups; keel://history; keel://home */
export function goPath(p: string) {
  const [path, query] = p.replace(/^\/+/, '').split('?');
  if (path === 'connect' && query) {                     // keel://connect?url=…&token=… (sent once by the VPS)
    const q = new URLSearchParams(query);
    const url = q.get('url'), token = q.get('token');
    if (url && token) {
      saveConn({ url, token }).then(() => { refresh(); loadStatic(); toast('ok', 'Connected to your VPS', url); });
      set({ route: { tab: 'live' } });
      return;
    }
  }
  const [a, b] = path.split('/');
  if (a === 'live') set({ route: { tab: 'live', symbol: b ? decodeURIComponent(b) : undefined } });
  else if (a === 'chart') { if (b) setChart({ symbol: decodeURIComponent(b).toUpperCase() }); set({ route: { tab: 'chart' } }); }
  else if (a === 'positions' || a === 'history') set({ route: { tab: 'positions', sub: a === 'history' ? 'history' : undefined } });
  else if (a === 'setups') set({ route: { tab: 'analysis', sub: 'setups' } });
  else if (a === 'analysis') set({ route: { tab: 'analysis', symbol: b ? decodeURIComponent(b).toUpperCase() : undefined } });
  else if (a === 'more') set({ route: { tab: 'more', sub: b } });
  else set({ route: { tab: 'live' } });
}

let tid = 0;
export function toast(kind: Toast['kind'], title: string, body?: string, ms = 3800) {
  const t = { id: ++tid, kind, title, body };
  set({ toasts: [...s.toasts, t].slice(-3) });
  setTimeout(() => set({ toasts: s.toasts.filter((x) => x.id !== t.id) }), ms);
}

export async function refresh() {
  try {
    const st = await s.api.state();
    if (!st || !Array.isArray(st.positions) || !st.account) {
      set({ online: true, lastError: 'Engine is starting on the VPS…' });
      return;
    }
    set({ state: st, online: true, lastError: '', lastOk: Date.now() });
    if (!s.symbols.length || !s.info) loadStatic();
    pollEvents();
  } catch (e: any) {
    set({ online: false, lastError: e?.message || String(e) });
  }
}

export async function loadStatic() {
  try {
    const [info, symbols] = await Promise.all([s.api.info(), s.api.symbols()]);
    set({ info, symbols: symbols?.length ? symbols : s.symbols });
    if (symbols.length && !symbols.find((x) => x.symbol === s.chart.symbol)) setChart({ symbol: symbols[0].symbol });
  } catch { /* shown by refresh */ }
}

// In-app banner for anything the engine announced while the app is open (the phone gets the same via ntfy).
async function pollEvents() {
  try {
    const ev: EventRow[] = await s.api.events(20);
    const maxId = ev.reduce((m, e) => Math.max(m, e.id), 0);
    if (s.lastEventId) {
      ev.filter((e) => e.id > s.lastEventId && (e.kind === 'NOTIFY' || e.kind === 'ERROR')).reverse().forEach((e) => {
        const [title, ...rest] = e.text.split(': ');
        toast(e.kind === 'ERROR' ? 'bad' : 'info', title, rest.join(': '), 5000);
      });
    }
    if (maxId) set({ lastEventId: maxId });
  } catch { /* ignore */ }
}

/** Send an instruction and report MT5's answer. Returns the result (ok false on any failure). */
export async function run(action: string, args: Record<string, unknown> = {}, okText?: string) {
  try {
    const r = await s.api.cmd(action, args);
    if (r.ok) { haptic.ok(); toast('ok', okText || 'Done', describe(r)); }
    else { haptic.bad(); toast('bad', 'Not done', r.error || `${r.retcode ?? ''} ${r.comment ?? ''}`.trim()); }
    refresh();
    return r;
  } catch (e: any) {
    haptic.bad(); toast('bad', 'Not sent', e?.message || String(e));
    return { ok: false, error: e?.message } as any;
  }
}
function describe(r: any) {
  if (r.ticket && r.price) return `#${r.ticket} · ${r.lots} lots @ ${Number(Number(r.price).toPrecision(7))}`;
  if (r.order) return `order #${r.order} · ${r.lots} lots`;
  if (r.closed != null) return `${r.closed} closed`;
  return undefined;
}

export function symInfo(sym: string) { return s.symbols.find((x) => x.symbol === sym); }
