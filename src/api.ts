// Talks to the Keel Markets engine on the VPS (over Tailscale). Every call carries the API token.

export type Position = {
  ticket: number; strategy: string; symbol: string; direction: number; lots: number; entry: number;
  sl: number | null; tp: number | null; price: number | null; profit: number; R: number | null; note: string;
  opened_t: number; opened_utc?: number; risk_money: number | null;
  group_id?: string | null; leg?: number | null; tp_level?: number | null;
};
export type Group = {
  gid: string; strategy: string; symbol: string; style: string; tf: string; direction: number; entry: number; sl: number;
  sl_now: number | null; tp1: number; tp2: number; tp3: number; stage: number; status: string; legs: number; open_legs: number;
  lots: number; risk_money: number | null; opened_t: number; banked: number; floating: number; profit: number;
  R: number | null; tp_hit: number[]; tickets: number[]; price: number | null; note: string;
};
export type Watch = { t: number; state: string; text: string; phase?: string | null };
export type Pair = {
  key: string; strategy: string; title: string; symbol: string; tf: string; style: string; enabled: boolean;
  override: boolean | null; backtest_pass: boolean | null; reason: string | null; watch?: Watch | null;
  stats: { n?: number; avg_R?: number; pf?: number; t?: number; win?: number; trades_per_month?: number; recent_avg_R?: number };
};
export type Risk = {
  risk_per_trade_pct: number; max_open_positions: number; min_lot_if_below: boolean;
  lot_mode?: 'risk' | 'fixed'; fixed_lots?: number; lot_multiplier?: number; group_legs?: number;
};
export type State = {
  ts: number; connected: boolean; state: 'RUNNING' | 'PAUSED' | string; server_offset_s?: number;
  account: { login?: number; server?: string; currency?: string; balance?: number; equity?: number; margin?: number;
    margin_free?: number; leverage?: number; trade_mode?: number };
  today: { trades: number; profit: number; R: number };
  positions: Position[]; groups?: Group[]; pairs: Pair[]; risk: Risk; external?: External[]; analysis?: AnalysisRow[];
  news: { time?: number; t?: number; currency?: string; name?: string; importance?: number }[];
  calendar_age_h?: number | null; error: string; started: number; notify_errors: string[];
};
export type Trade = Position & { status: string; closed_t: number; exit_price: number; reason: string };
export type Setup = {
  id: number; ts: number; utc: number | null; symbol: string; strategy: string; style: string; tf: string;
  direction: number; entry: number; sl: number | null; tp: number | null; status: 'TAKEN' | 'SKIPPED' | 'FAILED' | 'PENDING' | string;
  reason: string; why: string; ticket: number | null; lots: number | null;
  tp1?: number | null; tp2?: number | null; tp3?: number | null; legs?: number | null;
};
export type Order = { ticket: number; symbol: string; side: string; kind: string; lots: number; price: number; sl: number | null; tp: number | null; comment: string };
export type Zone = { kind: 'demand' | 'supply' | 'ob' | 'fvg_bull' | 'fvg_bear' | string; label?: string; lo: number; hi: number; t: number | null; tf: string; strategy: string; style: string;
  phase?: string; extreme?: number; origin?: number };
export type Overlay = {
  symbol: string; digits: number; bid: number | null; ask: number | null; positions: Position[]; orders: Order[];
  groups?: Group[];
  setups: Setup[]; zones: Zone[]; watch: (Watch & { key: string; strategy: string })[];
};
export type Candles = { symbol: string; tf: string; digits: number; bars: [number, number, number, number, number][] };
export type Sym = { symbol: string; broker: string; digits: number; bid: number | null; ask: number | null; volume_min: number;
  volume_step: number; volume_max: number; point: number; money_per_price: number; stops_level: number };
export type EventRow = { id: number; ts: number; kind: string; text: string };
export type StrategyInfo = { name: string; title: string; style: string; tf: string; source: string; rules: Record<string, string> };
export type Info = { version: number; actions: string[]; syntx: boolean; timeframes: string[]; strategies: StrategyInfo[] };
export type NotifySettings = { ntfy_server: string; ntfy_topic: string; ntfy_token_set: boolean; telegram_set: boolean;
  telegram_chat: string; mute: string[]; web_push_devices: number; sent: number; errors: string[] };
export type Result = { ok: boolean; error?: string; comment?: string; retcode?: number; ticket?: number; order?: number;
  lots?: number; price?: number; closed?: number; action?: string; group?: string; legs?: number; moved?: number };
export type LiveProfile = { family: 'drops' | 'jumps' | 'two_way' | 'continuous' | string; drift: string;
  spikes_per_day: number; up_spikes: number; down_spikes: number; spike_p95: number;
  counter_drift_side: 'buy' | 'sell' | null; fill_sides: ('buy' | 'sell')[]; source: string; words: string };
export type LiveDecision = { score: number; verdict: 'arm' | 'confirm' | 'skip' | string; reasons: string[] };
export type LiveCandidate = LiveDecision & { side: 'buy' | 'sell'; setup: string; research?: any };
export type LiveMap = { state: string; words: string; top?: number; bottom?: number; touches_top?: number;
  touches_bottom?: number; position?: number; heading?: string; approach?: string; fast_candles?: boolean };
export type LivePlan = { side: 'buy' | 'sell'; entry: number; sl: number; tps: number[]; final_rr: number;
  in_zone: boolean; keep: string; with_trend: boolean; distance_atr15: number; reason: string; status: string;
  score?: number; verdict?: string; why?: string[];
  money_at_risk_all_legs?: number; money_at_tp3_all_legs?: number; near_miss?: boolean; fast_candle?: boolean;
  moves?: number; note?: string; setup?: string; market?: boolean;
  analyst?: { choice?: string; confidence?: number; read?: string; reasons?: string[]; wait_for?: string };
  zone: { bottom: number; top: number; strength: number; rejections?: number; source: string } };
export type LiveSymbol = { symbol: string; state: string; cycle: number | null; digits?: number; volume_min?: number;
  volume_step?: number; bias?: string; bias_detail?: string; phase?: string; phase_detail?: string; motion?: string;
  likely_first?: string; bid?: number; ask?: number; rank?: number | null; armable?: boolean;
  sl_stage?: number | null; profile?: LiveProfile; decision?: Partial<Record<'buy' | 'sell', LiveDecision>>;
  cooldown_until?: number; plan?: { buy?: LivePlan; sell?: LivePlan }; zones?: any; setup?: string; note?: string;
  map?: LiveMap; candidates?: LiveCandidate[]; research?: Record<string, any>;
  analyst?: { choice?: string; confidence?: number; read?: string; reasons?: string[]; wait_for?: string };
  skip?: { buy?: string; sell?: string } };
export type LivePosition = { ticket: number; symbol: string; side: string; volume: number; entry: number; price: number;
  sl: number; tp: number; profit: number; comment: string; magic: number; time: number };
export type LiveSnapshot = { version: number; time: number; enabled: boolean; account: any; positions_open: number; max_positions: number;
  positions: LivePosition[]; pending_orders: any[]; slots: { used: number; total: number; free: number };
  symbols_count: number; symbols: LiveSymbol[]; events: any[]; stats: any;
  guard: { expected_login?: number; login?: number; login_ok?: boolean; day_pnl?: number; streak_loss_usd?: number;
    streak_cycles?: number; cooldown_until?: number; profit_stop_active?: boolean };
  analyst: { mode: 'off' | 'shadow' | 'gate'; model?: string; stats?: Record<string, number>; last_error?: string };
  playbook: any; virtual: any;
  controls?: { lots: Record<string, number>; push_armed_moved: boolean } };
export type LiveChart = { symbol: string; digits: number; candles: [number, number, number, number, number][];
  zones: { kind: string; bottom: number; top: number; source: string }[];
  lines: { label: string; price: number }[]; read: { bias?: string; phase?: string; detail?: string; likely_first?: string } };

export class ApiError extends Error {
  constructor(public status: number, msg: string, public url = '') {
    super(msg);
    this.name = 'ApiError';
  }
}

export class Api {
  constructor(public base: string, public token: string) { this.base = base.replace(/\/+$/, ''); }

  private async req<T>(path: string, init: RequestInit = {}, timeoutMs = 12000): Promise<T> {
    if (!this.base) throw new ApiError(0, 'Set the server address in Settings');
    const requestUrl = this.base + path;
    const method = init.method || 'GET';
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    let r: Response;
    try {
      r = await fetch(requestUrl, {
        ...init, signal: ctl.signal, cache: 'no-store',
        headers: { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json', ...(init.headers || {}) },
      });
    } catch (e: any) {
      const detail = e?.message ? `: ${e.message}` : '';
      throw new ApiError(0, e?.name === 'AbortError'
        ? `Timeout after ${Math.round(timeoutMs / 1000)}s calling ${method} ${requestUrl}`
        : `Network or CORS error calling ${method} ${requestUrl}${detail}`, requestUrl);
    } finally { clearTimeout(timer); }
    const txt = await r.text();
    let body: any = null;
    try { body = txt ? JSON.parse(txt) : null; } catch { /* not json */ }
    const reason = body?.detail || txt || r.statusText || 'request failed';
    if (r.status === 401) throw new ApiError(401, `Authentication failed (HTTP 401): ${reason}`, requestUrl);
    if (!r.ok) throw new ApiError(r.status, `HTTP ${r.status}: ${reason}`, requestUrl);
    return body as T;
  }
  get<T>(p: string) { return this.req<T>(p); }
  post<T>(p: string, b: unknown, t?: number) { return this.req<T>(p, { method: 'POST', body: JSON.stringify(b) }, t); }

  health() { return this.req<{ ok: boolean; version?: number }>('/api/health', {}, 6000); }
  info() { return this.get<Info>('/api/info'); }
  testConnection() { return this.req<Info>('/api/info', {}, 30000); }
  state() { return this.get<State>('/api/state'); }
  symbols() { return this.get<Sym[]>('/api/symbols'); }
  candles(symbol: string, tf: string, limit = 300) {
    return this.get<Candles>(`/api/candles?symbol=${encodeURIComponent(symbol)}&tf=${tf}&limit=${limit}`);
  }
  overlay(symbol: string) { return this.get<Overlay>(`/api/overlay?symbol=${encodeURIComponent(symbol)}`); }
  setups(symbol?: string, limit = 200) {
    return this.get<Setup[]>(`/api/setups?limit=${limit}${symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''}`);
  }
  trades(limit = 200) { return this.get<Trade[]>(`/api/trades?limit=${limit}`); }
  events(limit = 150) { return this.get<EventRow[]>(`/api/events?limit=${limit}`); }
  equity() { return this.get<{ day: string; equity: number; balance: number }[]>('/api/equity'); }
  orders() { return this.get<Order[]>('/api/orders'); }
  notify() { return this.get<NotifySettings>('/api/notify'); }
  quote(b: { symbol: string; side: string; sl: number; price?: number | null; lots?: number | null }) {
    return this.post<{ price: number; lots: number; risk_money: number; risk_pct: number | null; why: string }>('/api/quote', b);
  }
  /** Every instruction to the engine goes through here and comes back with MT5's answer. */
  cmd(action: string, args: Record<string, unknown> = {}) {
    return this.post<Result>('/api/command', { action, ...args }, 30000);
  }
  analysis(symbol: string) { return this.get<AnalysisDoc>(`/api/analysis/${encodeURIComponent(symbol)}`); }
  analysisAll() { return this.get<AnalysisRow[]>('/api/analysis'); }
  headlines(symbol?: string) { return this.get<{ items: Headline[]; errors: Record<string, string> }>(`/api/headlines${symbol ? `?symbol=${symbol}` : ''}`); }
  syntx() { return this.get<any>('/api/syntx/status'); }
  syntxControl(action: string, confirm = false) { return this.post<any>('/api/syntx/control', { action, confirm }); }
  liveSnapshot() { return this.get<LiveSnapshot>('/live/snapshot'); }
  liveChart(symbol: string) { return this.get<LiveChart>(`/live/chart/${encodeURIComponent(symbol)}`); }
  liveEvents() { return this.get<any[]>('/live/events'); }
  liveStats() { return this.get<any>('/live/stats'); }
  liveControl(body: Record<string, unknown>) { return this.post<any>('/live/control', body); }
  researchSummary() { return this.get<any>('/research/summary'); }
  async analystChart(symbol: string) {
    const r = await fetch(`${this.base}/live/analyst-chart/${encodeURIComponent(symbol)}.png`,
      { headers: { Authorization: `Bearer ${this.token}` }, cache: 'no-store' });
    if (!r.ok) throw new ApiError(r.status, 'No analyst chart yet');
    return URL.createObjectURL(await r.blob());
  }
  livePosition(ticket: number, action: 'close' | 'reduce' | 'add', lots?: number) {
    return this.post<any>(`/v5/live/positions/${ticket}/${action}`, lots == null ? {} : { lots });
  }
  liveNotifyTest() { return this.post<any>('/v5/live/notify-test', {}); }
}

export type PlanTrade = { name: string; side: string; direction: number; mode: string; entry: number; zone: [number, number];
  sl: number; tp35: number; tp65: number; tp: number; rr: number | null; confidence: number; trigger: string; expires: number;
  tp_reason: string; invalid: string; eta_min?: number };
export type Plan = {
  symbol: string; profile: string; t: number; price: number; digits: number; phase: string; bias: number; headline: string;
  timeframes: Record<string, { trend: number; reason: string }>;
  session: { ny_time: string; london_time: string; session: string; killzone: string | null; next_open: string;
    next_open_in_min: number; safe: boolean; unsafe_reasons: string[]; text: string };
  leg?: { tf: string; from: number; to: number; t_from: number; t_to: number; retrace: number };
  zones: Zone[]; fibs: { r: number; price: number }[]; liquidity: { price: number; label: string }[];
  route: { t: number; p: number }[]; trades: PlanTrade[]; reasons: string[];
  expect30: { direction: number; lo: number; hi: number; text: string } | null; headline_news?: string;
};
export type Headline = { t: number; title: string; source: string; link: string; symbols: string[] };
export type AnalysisDoc = { symbol: string; plans: Record<string, Plan | null>;
  scores: Record<string, any>; headlines: Headline[] };
export type AnalysisRow = { symbol: string; profile: string; phase: string; bias: number; headline: string; t: number;
  safe: boolean; confidence: number | null; side: string | null; entry: number | null; sl: number | null; tp: number | null;
  rr: number | null; digits: number; session: string; killzone: string | null; next_open: string | null; next_open_in_min: number | null };
export type External = { ticket: number; symbol: string; side: string; lots: number; entry: number; sl: number | null;
  tp: number | null; profit: number; price: number };
