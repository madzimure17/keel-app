// Instructions typed in plain words → engine commands. Shown back to you as a preview before they are sent.
import type { Position } from './api';

export type Cmd = { action: string; args: Record<string, unknown>; text: string };
export type Parsed = { cmds: Cmd[]; errors: string[] };

export const EXAMPLES = [
  'buy 0.10 EURUSD sl 1.0820 tp 1.0900',
  'sell limit 0.05 XAUUSD at 2410 sl 2425 tp 2380',
  'close #123456',
  'close half #123456',
  'add 0.05 #123456',
  'sl #123456 1.0835',
  'breakeven all',
  'close EURUSD',
  'close all',
  'close group EURUSD   ·   breakeven group EURUSD',
  'legs 6   (positions per setup: 6, 3 or 1)',
  'risk 1%',
  'lots 0.10   (fixed lots)   ·   lots risk   (back to risk %)',
  'multiplier 2',
  'off ZONES_SCALP GBPUSD   ·   on ZONES_DAY US500',
  'pause   ·   start',
];

const num = (s?: string) => (s == null ? undefined : Number(s.replace(',', '.')));

export function parse(text: string, positions: Position[], symbols: string[],
  groups: { gid: string; symbol: string; open_legs: number }[] = []): Parsed {
  const cmds: Cmd[] = [], errors: string[] = [];
  const sy = new Set(symbols.map((s) => s.toUpperCase()));
  for (const raw of text.split(/[\n;]+/)) {
    const line = raw.trim();
    if (!line) continue;
    const L = line.toLowerCase().replace(/\s+/g, ' ');
    const tk = (L.match(/#(\d{3,})/) || L.match(/(?:^|\s)(\d{5,})(?=\s|$)/) || [])[1];      // "#123456" or a bare ticket, never a price
    const ticket = tk ? Number(tk) : undefined;
    const pos = ticket ? positions.find((p) => p.ticket === ticket) : undefined;
    const symbol = line.toUpperCase().split(/[\s,]+/).find((w) => sy.has(w));
    const push = (action: string, args: Record<string, unknown>, t: string) => cmds.push({ action, args, text: t });
    let m: RegExpMatchArray | null;

    if (/^(start|resume|run)$/.test(L)) push('start', {}, 'Start Keel (new trades allowed)');
    else if ((m = line.match(/^close\s+(?:group|trade)\s+(\S+)$/i))) {
      const key = m[1].toUpperCase();
      const gs = (groups || []).filter((g) => g.gid.toUpperCase() === key || g.symbol === key);
      if (!gs.length) { errors.push(`${line}: no open 6-position trade for ${key}`); continue; }
      gs.forEach((g) => push('close_group', { group: g.gid }, `Close all ${g.open_legs} positions of ${g.symbol} trade ${g.gid}`));
    } else if ((m = line.match(/^(?:be|breakeven)\s+(?:group|trade)\s+(\S+)$/i))) {
      const key = m[1].toUpperCase();
      const gs = (groups || []).filter((g) => g.gid.toUpperCase() === key || g.symbol === key);
      if (!gs.length) { errors.push(`${line}: no open 6-position trade for ${key}`); continue; }
      gs.forEach((g) => push('group_breakeven', { group: g.gid }, `Stops of ${g.symbol} trade ${g.gid} to breakeven+`));
    }
    else if ((m = L.match(/^legs (6|3|1)$/))) push('set_risk', { group_legs: Number(m[1]) }, `${m[1]} position(s) per setup`);
    else if (/^(pause|stop)$/.test(L)) push('pause', {}, 'Pause Keel (no new trades; open ones still managed)');
    else if (/^close (all|everything)$/.test(L)) push('close_all', { confirm: true }, `Close ALL ${positions.length} positions`);
    else if ((m = L.match(/^(?:close|reduce) (half|quarter|\d+(?:\.\d+)?%|\d*\.\d+|\d+(?:\.\d+)? ?lots?) /)) && ticket) {
      if (!pos) { errors.push(`${line}: no open position #${ticket}`); continue; }
      const k = m[1];
      const lots = k === 'half' ? pos.lots / 2 : k === 'quarter' ? pos.lots / 4 : k.endsWith('%') ? pos.lots * parseFloat(k) / 100 : parseFloat(k);
      const v = Math.floor(lots * 100 + 1e-9) / 100;
      if (v < 0.01 || pos.lots - v < 0.01 - 1e-9) { errors.push(`${line}: ${pos.lots} lots can't be split that way (minimum lot); use "close #${ticket}"`); continue; }
      push('reduce', { ticket, lots: v }, `Close ${v} of ${pos.lots} lots of #${ticket} ${pos.symbol}`);
    } else if (/^close /.test(L) && ticket) {
      push('close', { ticket }, `Close #${ticket}${pos ? ' ' + pos.symbol : ''}`);
    } else if (/^close /.test(L) && symbol) {
      push('close_symbol', { symbol, confirm: true }, `Close every ${symbol} position (${positions.filter((p) => p.symbol === symbol).length})`);
    } else if (/^add/.test(L) && ticket) {
      if (!pos) { errors.push(`${line}: no open position #${ticket}`); continue; }
      const lots = num((L.replace('#' + tk, ' ').replace(new RegExp('(^|\\s)' + tk + '(?=\\s|$)'), ' ').match(/(\d*\.?\d+)/) || [])[1]) || pos.lots;
      push('add', { ticket, lots }, `Add ${lots} lots to #${ticket} ${pos.symbol} (same SL/TP)`);
    } else if ((m = L.match(/^(sl|tp|stop|target) /)) && ticket) {
      if (!pos) { errors.push(`${line}: no open position #${ticket}`); continue; }
      const v = num((L.replace('#' + tk, ' ').replace(new RegExp('(^|\\s)' + tk + '(?=\\s|$)'), ' ').match(/(\d*\.?\d+)/) || [])[1]);
      if (v == null || /\b(none|remove|off)\b/.test(L)) {
        const which = m[1] === 'sl' || m[1] === 'stop' ? 'sl' : 'tp';
        push('modify', { ticket, sl: which === 'sl' ? 0 : pos.sl ?? 0, tp: which === 'tp' ? 0 : pos.tp ?? 0 }, `Remove ${which.toUpperCase()} of #${ticket}`);
      } else {
        const sl = m[1] === 'sl' || m[1] === 'stop';
        push('modify', { ticket, sl: sl ? v : pos.sl ?? 0, tp: sl ? pos.tp ?? 0 : v }, `${sl ? 'SL' : 'TP'} of #${ticket} → ${v}`);
      }
    } else if (/^(be|breakeven|break even)\b/.test(L)) {
      const list = ticket ? positions.filter((p) => p.ticket === ticket)
        : symbol ? positions.filter((p) => p.symbol === symbol) : /all/.test(L) ? positions : [];
      if (!list.length) errors.push(`${line}: which position? (#ticket, a symbol, or "all")`);
      list.forEach((p) => push('breakeven', { ticket: p.ticket }, `Stop to entry on #${p.ticket} ${p.symbol}`));
    } else if (/^cancel /.test(L) && ticket) push('cancel_order', { ticket }, `Cancel order #${ticket}`);
    else if ((m = L.match(/^(buy|sell)\b/))) {
      if (!symbol) { errors.push(`${line}: which symbol?`); continue; }
      const kind = /\blimit\b/.test(L) ? 'limit' : /\bstop\b(?! ?loss)/.test(L.replace(/\bsl\b.*$/, '')) ? 'stop' : 'market';
      const rest = L.replace(symbol.toLowerCase(), ' ').replace(/\s+/g, ' ').trim();
      const lots = num((rest.match(/^(?:buy|sell)(?: (?:limit|stop))? (\d*\.?\d+)/) || [])[1]) ??
        num((rest.match(/(\d*\.?\d+) ?lots?/) || [])[1]);
      const sl = num((rest.match(/\bsl (\d*\.?\d+)/) || [])[1]);
      const tp = num((rest.match(/\btp (\d*\.?\d+)/) || [])[1]);
      const price = num((rest.match(/(?:\bat|@) ?(\d*\.?\d+)/) || [])[1]);
      if (kind !== 'market' && !price) { errors.push(`${line}: a ${kind} order needs "at <price>"`); continue; }
      push('open', { symbol, side: m[1].toUpperCase(), type: kind, lots: lots ?? null, sl: sl ?? null, tp: tp ?? null, price: price ?? null, note: `instruction: ${line}` },
        `${m[1].toUpperCase()}${kind !== 'market' ? ' ' + kind.toUpperCase() + ' @ ' + price : ''} ${symbol} · ${lots ? lots + ' lots' : sl ? 'lots from your risk %' : 'minimum lot'}${sl ? ' · SL ' + sl : ''}${tp ? ' · TP ' + tp : ''}`);
    } else if ((m = L.match(/^risk (\d*\.?\d+) ?%?$/))) push('set_risk', { risk_per_trade_pct: Number(m[1]), lot_mode: 'risk' }, `Risk ${m[1]} % per trade (lots from the stop)`);
    else if ((m = L.match(/^(?:lots|fixed)(?: lots)? (\d*\.?\d+)$/))) push('set_risk', { lot_mode: 'fixed', fixed_lots: Number(m[1]) }, `Every Keel trade: ${m[1]} lots`);
    else if (/^lots risk$/.test(L)) push('set_risk', { lot_mode: 'risk' }, 'Size Keel trades from risk %');
    else if ((m = L.match(/^(?:multiplier|mult|x) (\d*\.?\d+)$/))) push('set_risk', { lot_multiplier: Number(m[1]) }, `Lot multiplier × ${m[1]}`);
    else if ((m = L.match(/^max(?: positions)? (\d+)$/))) push('set_risk', { max_open_positions: Number(m[1]) }, `Max ${m[1]} open positions`);
    else if ((m = line.match(/^(on|off|enable|disable)\s+([A-Za-z0-9_]+)\s+([A-Za-z0-9.]+)$/i))) {
      const on = /^(on|enable)$/i.test(m[1]);
      push('enable', { key: `${m[2].toUpperCase()}|${m[3].toUpperCase()}`, on }, `${m[2].toUpperCase()} on ${m[3].toUpperCase()}: ${on ? 'ON' : 'OFF'}`);
    } else errors.push(`Didn't understand: "${line}"`);
  }
  return { cmds, errors };
}
