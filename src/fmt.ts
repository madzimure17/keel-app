import { get } from './store';

export const px = (v: number | null | undefined, d = 5) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));
export const num = (v: number | null | undefined, d = 2) => (v == null || !isFinite(v) ? '—' : v.toFixed(d));
export const signed = (v: number | null | undefined, d = 2) =>
  v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
export function money(v: number | null | undefined, cur?: string) {
  if (v == null || !isFinite(v)) return '—';
  const s = Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${v < 0 ? '−' : ''}${s}${cur ? ' ' + cur : ''}`;
}
export const cls = (v: number | null | undefined) => (v == null ? '' : v > 0 ? 'buy' : v < 0 ? 'sell' : '');
export const side = (d: number) => (d > 0 ? 'BUY' : 'SELL');

/** Server timestamps (MT5 time) → UTC seconds, using the offset the engine reports. */
export function serverToUtc(t: number | null | undefined) {
  if (!t) return null;
  return t - (get().state?.server_offset_s || 0);
}
export function when(utc: number | null | undefined, withDate = false) {
  if (!utc) return '—';
  const d = new Date(utc * 1000);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  if (!withDate && d.toDateString() === now.toDateString()) return time;
  return `${d.toLocaleDateString([], { day: 'numeric', month: 'short' })} ${time}`;
}
export function ago(utc: number | null | undefined) {
  if (!utc) return '';
  const s = Math.max(0, Date.now() / 1000 - utc);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
/** A "pip": 10 points on 5/3-digit quotes, 1 point otherwise. */
export function pipSize(digits: number, point: number) { return digits === 5 || digits === 3 ? point * 10 : point; }
export function roundTo(v: number, step: number) { return Math.round(v / step) * step; }
export function floorTo(v: number, step: number) { return Math.floor(v / step + 1e-9) * step; }
export function lotsStr(v: number) { return (Math.round(v * 100) / 100).toString(); }
