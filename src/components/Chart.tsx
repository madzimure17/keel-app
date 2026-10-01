// Candlestick chart on a canvas: pan with one finger, pinch to zoom, drag stop/target lines, tap setup markers.
import { useEffect, useRef, useState } from 'react';
import type { Zone } from '../api';

export type Bar = [number, number, number, number, number];            // utc, o, h, l, c
export type Line = { id: string; price: number; color: string; label: string; dash?: boolean; drag?: boolean; bold?: boolean };
export type Marker = { id: number; t: number; dir: number; color: string; hollow?: boolean };

type Props = {
  bars: Bar[]; digits: number; tfSec: number; zones?: Zone[]; lines?: Line[]; markers?: Marker[];
  onDrag?: (id: string, price: number, done: boolean) => void; onMarker?: (id: number) => void; onLine?: (id: string) => void;
  height?: number;
  route?: { t: number; p: number }[];                                  // the analyst's expected path (UTC seconds, price)
};

const AXIS = 62, BOTTOM = 20;

function cssVar(el: Element, n: string) { return getComputedStyle(el).getPropertyValue(n).trim() || '#888'; }
function alpha(hex: string, a: number) {
  const m = hex.replace('#', '');
  if (m.length !== 6) return hex;
  const n = parseInt(m, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function idxAt(bars: Bar[], t: number) {           // last bar whose time <= t
  let lo = 0, hi = bars.length - 1, r = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (bars[m][0] <= t) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}

export default function Chart(p: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const view = useRef({ per: 8, off: 0 });            // px per bar, bars scrolled back from the newest
  const geo = useRef<{ yOf: (v: number) => number; vOf: (y: number) => number; xOf: (i: number) => number } | null>(null);
  const props = useRef(p);
  props.current = p;
  const dragPrice = useRef<{ id: string; price: number } | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const raf = useRef(0);

  const draw = () => {
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(paint);
  };

  function paint() {
    const c = cv.current, w = wrap.current;
    if (!c || !w) return;
    const P = props.current;
    const W = w.clientWidth, H = P.height || w.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
      c.width = Math.round(W * dpr); c.height = Math.round(H * dpr);
      c.style.width = W + 'px'; c.style.height = H + 'px';
    }
    const g = c.getContext('2d')!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const col = {
      bg: cssVar(w, '--surface'), line: cssVar(w, '--line'), text: cssVar(w, '--text'), muted: cssVar(w, '--muted'),
      buy: cssVar(w, '--buy'), sell: cssVar(w, '--sell'), brass: cssVar(w, '--brass'),
    };
    g.fillStyle = col.bg; g.fillRect(0, 0, W, H);
    const bars = P.bars;
    const plotW = W - AXIS, plotH = H - BOTTOM;
    if (!bars.length) {
      g.fillStyle = col.muted; g.font = '13px -apple-system, system-ui'; g.textAlign = 'center';
      g.fillText('No bars yet', plotW / 2, plotH / 2);
      return;
    }
    const v = view.current;
    const n = bars.length;
    const maxOff = Math.max(0, n - 10);
    v.off = Math.min(Math.max(v.off, 0), maxOff);
    const right = n - 1 - Math.floor(v.off);                   // index of the right-most drawn bar
    const frac = v.off - Math.floor(v.off);
    const lastT = bars[n - 1][0];
    const fut = Math.max(0, ...(P.route || []).map((r) => (r.t - lastT) / P.tfSec));
    const RIGHT_PAD_BARS = Math.min(Math.max(5, Math.ceil(fut) + 3), Math.floor(plotW / v.per / 3));
    const futScale = fut > 0 ? Math.min(1, (RIGHT_PAD_BARS - 2) / fut) : 1;   // a long route is compressed, not cut
    const xOf = (i: number) => plotW - (RIGHT_PAD_BARS + (right - i) - frac) * v.per - v.per / 2;
    const first = Math.max(0, Math.floor(right - (plotW / v.per) + RIGHT_PAD_BARS) - 1);
    let lo = Infinity, hi = -Infinity;
    for (let i = first; i <= right; i++) { lo = Math.min(lo, bars[i][3]); hi = Math.max(hi, bars[i][2]); }
    const span0 = Math.max(hi - lo, Math.abs(hi) * 1e-5);
    for (const L of P.lines || []) {                                   // keep near lines in view
      if (L.price >= lo - span0 * 1.5 && L.price <= hi + span0 * 1.5) { lo = Math.min(lo, L.price); hi = Math.max(hi, L.price); }
    }
    if (dragPrice.current) { lo = Math.min(lo, dragPrice.current.price); hi = Math.max(hi, dragPrice.current.price); }
    for (const r of P.route || []) { lo = Math.min(lo, r.p); hi = Math.max(hi, r.p); }
    const pad = (hi - lo) * 0.08 || 1e-4;
    lo -= pad; hi += pad;
    const yOf = (val: number) => 8 + (hi - val) / (hi - lo) * (plotH - 16);
    const vOf = (y: number) => hi - (y - 8) / (plotH - 16) * (hi - lo);
    geo.current = { yOf, vOf, xOf };
    const d = P.digits;
    g.font = '11px ui-monospace, "JetBrains Mono", Menlo, monospace';

    // grid + price axis
    const step = niceStep((hi - lo) / 5);
    g.strokeStyle = alpha(col.line.startsWith('#') ? col.line : '#26394A', 0.7); g.lineWidth = 1;
    g.fillStyle = col.muted; g.textAlign = 'left'; g.textBaseline = 'middle';
    for (let val = Math.ceil(lo / step) * step; val <= hi; val += step) {
      const y = Math.round(yOf(val)) + 0.5;
      g.beginPath(); g.moveTo(0, y); g.lineTo(plotW, y); g.stroke();
      g.fillText(val.toFixed(d), plotW + 6, y);
    }
    // time axis
    g.textAlign = 'center'; g.textBaseline = 'alphabetic';
    const every = Math.max(1, Math.ceil(90 / v.per));
    for (let i = right; i >= first; i--) {
      if ((n - 1 - i) % every !== 0) continue;
      const x = xOf(i);
      if (x < 20 || x > plotW - 20) continue;
      const dt = new Date(bars[i][0] * 1000);
      const lab = P.tfSec >= 14400 ? dt.toLocaleDateString([], { day: 'numeric', month: 'short' })
        : dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      g.fillText(lab, x, H - 5);
    }
    g.save(); g.beginPath(); g.rect(0, 0, plotW, plotH); g.clip();

    // zones (your supply & demand) — from the base candle to the right edge
    for (const z of P.zones || []) {
      const i0 = z.t ? idxAt(bars, z.t) : first;
      const x0 = Math.max(0, i0 < 0 ? 0 : xOf(i0) - v.per / 2);
      const y0 = yOf(z.hi), y1 = yOf(z.lo);
      if (y1 < 0 || y0 > plotH) continue;
      const cz = z.kind === 'demand' || z.kind === 'fvg_bull' ? col.buy : z.kind === 'ob' ? col.brass : col.sell;
      g.fillStyle = alpha(cz, 0.13); g.fillRect(x0, y0, plotW - x0, Math.max(2, y1 - y0));
      g.strokeStyle = alpha(cz, 0.55); g.setLineDash([]);
      g.beginPath(); g.moveTo(x0, y0 + 0.5); g.lineTo(plotW, y0 + 0.5); g.moveTo(x0, y1 - 0.5); g.lineTo(plotW, y1 - 0.5); g.stroke();
      g.fillStyle = alpha(cz, 0.9); g.textAlign = 'left'; g.font = '10px -apple-system, system-ui';
      g.fillText((z as any).label || `${z.tf} ${z.kind} · ${z.style}`, Math.max(x0 + 4, 4), y0 + 11);
    }
    g.font = '11px ui-monospace, "JetBrains Mono", Menlo, monospace';

    // candles
    const bw = Math.max(1, Math.min(v.per * 0.7, v.per - 1));
    for (let i = first; i <= right; i++) {
      const [, o, h, l, cl] = bars[i];
      const x = xOf(i);
      const up = cl >= o;
      g.strokeStyle = g.fillStyle = up ? col.buy : col.sell;
      g.beginPath(); g.moveTo(Math.round(x) + 0.5, yOf(h)); g.lineTo(Math.round(x) + 0.5, yOf(l)); g.stroke();
      const yT = yOf(Math.max(o, cl)), yB = yOf(Math.min(o, cl));
      g.fillRect(x - bw / 2, yT, bw, Math.max(1, yB - yT));
    }

    // setup markers
    for (const m of P.markers || []) {
      const i = idxAt(bars, m.t);
      if (i < first || i > right) continue;
      const x = xOf(i);
      const y = m.dir > 0 ? yOf(bars[i][3]) + 12 : yOf(bars[i][2]) - 12;
      const s = 6;
      g.beginPath();
      if (m.dir > 0) { g.moveTo(x, y - s); g.lineTo(x - s, y + s); g.lineTo(x + s, y + s); }
      else { g.moveTo(x, y + s); g.lineTo(x - s, y - s); g.lineTo(x + s, y - s); }
      g.closePath();
      if (m.hollow) { g.strokeStyle = m.color; g.lineWidth = 1.5; g.stroke(); g.lineWidth = 1; }
      else { g.fillStyle = m.color; g.fill(); }
    }
    g.restore();

    // price lines (positions, orders, ticket, bid) with labels on the axis; off-screen ones pinned to the edge
    for (const L of P.lines || []) {
      const price = dragPrice.current?.id === L.id ? dragPrice.current.price : L.price;
      let y = yOf(price);
      const off = y < 0 || y > plotH;
      y = Math.min(Math.max(y, 8), plotH - 8);
      g.strokeStyle = L.color; g.lineWidth = L.bold ? 1.6 : 1;
      g.setLineDash(off ? [2, 4] : L.dash ? [6, 4] : []);
      g.beginPath(); g.moveTo(0, Math.round(y) + 0.5); g.lineTo(plotW, Math.round(y) + 0.5); g.stroke();
      g.setLineDash([]); g.lineWidth = 1;
      g.fillStyle = L.color; g.fillRect(plotW, y - 9, AXIS, 18);
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.textBaseline = 'middle';
      g.fillText((off ? (price > hi ? '↑' : '↓') : '') + price.toFixed(d), plotW + 4, y);
      if (L.label) {
        g.font = '600 10px -apple-system, system-ui';
        const tw = g.measureText(L.label).width + 10;
        g.fillStyle = L.color; g.fillRect(plotW - tw - 4, y - 8, tw, 16);
        g.fillStyle = '#fff'; g.fillText(L.label, plotW - tw + 1, y);
        g.font = '11px ui-monospace, "JetBrains Mono", Menlo, monospace';
        if (L.drag) {                                              // grab handle
          g.fillStyle = L.color; g.beginPath(); g.arc(plotW - tw - 16, y, 7, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff'; g.fillRect(plotW - tw - 20, y - 2, 8, 1.3); g.fillRect(plotW - tw - 20, y + 1, 8, 1.3);
        }
      }
      g.textBaseline = 'alphabetic';
    }
    g.save(); g.beginPath(); g.rect(0, 0, plotW, plotH); g.clip();
    // the expected route: now → zone → target, drawn into the future
    if (P.route && P.route.length > 1) {
      const xT = (t: number) => {
        if (t >= lastT) return xOf(n - 1 + (t - lastT) / P.tfSec * futScale);
        const i = idxAt(bars, t);
        return xOf(Math.max(i, 0));
      };
      const path = () => { g.beginPath(); P.route!.forEach((r, k) => { const x = xT(r.t), y = yOf(r.p); if (k) g.lineTo(x, y); else g.moveTo(x, y); }); };
      g.setLineDash([]); g.lineJoin = 'round';
      g.strokeStyle = 'rgba(0,0,0,.55)'; g.lineWidth = 6; path(); g.stroke();   // halo: readable over labels
      g.strokeStyle = '#3B7BF0'; g.lineWidth = 3; path(); g.stroke();
      const a = P.route[P.route.length - 1], b = P.route[P.route.length - 2];
      const ax = xT(a.t), ay = yOf(a.p), bx = xT(b.t), by = yOf(b.p);
      const ang = Math.atan2(ay - by, ax - bx);
      g.fillStyle = '#3B7BF0'; g.beginPath(); g.moveTo(ax, ay);
      g.lineTo(ax - 13 * Math.cos(ang - 0.45), ay - 13 * Math.sin(ang - 0.45));
      g.lineTo(ax - 13 * Math.cos(ang + 0.45), ay - 13 * Math.sin(ang + 0.45)); g.closePath(); g.fill();
      g.lineWidth = 1;
    }
    g.restore();
  }

  useEffect(draw);
  useEffect(() => {
    const ro = new ResizeObserver(draw);
    if (wrap.current) ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  // ---- touch handling
  useEffect(() => {
    const c = cv.current!;
    const pts = new Map<number, { x: number; y: number }>();
    let mode: 'none' | 'pan' | 'pinch' | 'drag' = 'none';
    let start = { x: 0, y: 0, t: 0, off: 0, per: 8, dist: 0 };
    let dragId = '';
    let moved = 0;
    const local = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };

    const down = (e: PointerEvent) => {
      c.setPointerCapture(e.pointerId);
      const q = local(e);
      pts.set(e.pointerId, q);
      if (pts.size === 2) {
        if (mode === 'drag') { dragPrice.current = null; props.current.onDrag?.(dragId, NaN, true); }
        const [a, b] = [...pts.values()];
        mode = 'pinch'; start = { ...start, per: view.current.per, dist: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
        return;
      }
      moved = 0;
      start = { x: q.x, y: q.y, t: Date.now(), off: view.current.off, per: view.current.per, dist: 0 };
      mode = 'pan';
      const G = geo.current;
      if (G && props.current.onDrag) {
        for (const L of props.current.lines || []) {
          if (L.drag && Math.abs(G.yOf(L.price) - q.y) < 20) { mode = 'drag'; dragId = L.id; dragPrice.current = { id: L.id, price: L.price }; break; }
        }
      }
    };
    const move = (e: PointerEvent) => {
      if (!pts.has(e.pointerId)) return;
      const q = local(e);
      pts.set(e.pointerId, q);
      moved = Math.max(moved, Math.hypot(q.x - start.x, q.y - start.y));
      if (mode === 'pinch' && pts.size >= 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        view.current.per = Math.min(40, Math.max(2, start.per * d / start.dist));
        draw();
      } else if (mode === 'pan') {
        view.current.off = start.off + (q.x - start.x) / view.current.per;
        setScrolled(view.current.off > 2);
        draw();
      } else if (mode === 'drag' && geo.current) {
        const price = geo.current.vOf(q.y);
        dragPrice.current = { id: dragId, price };
        props.current.onDrag?.(dragId, price, false);
        draw();
      }
    };
    const up = (e: PointerEvent) => {
      pts.delete(e.pointerId);
      if (mode === 'drag' && dragPrice.current) {
        props.current.onDrag?.(dragId, dragPrice.current.price, true);
        dragPrice.current = null;
      } else if (mode === 'pan' && moved < 6 && Date.now() - start.t < 400) {
        tap(start.x, start.y);
      }
      if (pts.size === 0) mode = 'none';
      else if (mode === 'pinch') mode = 'none';
      draw();
    };
    const tap = (x: number, y: number) => {
      const G = geo.current, P = props.current;
      if (!G) return;
      let best: { id: number; d: number } | null = null;
      for (const m of P.markers || []) {
        const i = idxAt(P.bars, m.t);
        if (i < 0) continue;
        const my = m.dir > 0 ? G.yOf(P.bars[i][3]) + 12 : G.yOf(P.bars[i][2]) - 12;
        const dd = Math.hypot(G.xOf(i) - x, my - y);
        if (dd < 22 && (!best || dd < best.d)) best = { id: m.id, d: dd };
      }
      if (best) { P.onMarker?.(best.id); return; }
      for (const L of P.lines || []) if (Math.abs(G.yOf(L.price) - y) < 12) { P.onLine?.(L.id); return; }
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    return () => {
      c.removeEventListener('pointerdown', down); c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up);
    };
  }, []);

  return (
    <div ref={wrap} className="chart" style={p.height ? { height: p.height } : undefined}>
      <canvas ref={cv} style={{ touchAction: 'none', display: 'block' }} />
      {scrolled && (
        <button className="chart-latest" onClick={() => { view.current.off = 0; setScrolled(false); draw(); }}>Latest ›</button>
      )}
    </div>
  );
}

function niceStep(raw: number) {
  if (!(raw > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const m = raw / p;
  return (m < 1.5 ? 1 : m < 3 ? 2 : m < 7 ? 5 : 10) * p;
}
