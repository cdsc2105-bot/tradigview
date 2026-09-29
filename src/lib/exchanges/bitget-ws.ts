import type { Ticker24h } from "@/lib/binance/types";

const BITGET_WS = "wss://ws.bitget.com/v2/ws/public";

/** Bitget product lines on the public socket: USDT perpetuals and spot. */
export type BitgetInstType = "USDT-FUTURES" | "SPOT";

/** Handlers are keyed per product line — BTCUSDT spot ≠ BTCUSDT perpetual. */
const key = (instType: BitgetInstType, instId: string) => `${instType}:${instId}`;

interface TickerData {
  instId: string;
  lastPr: string;
  open24h: string;
  high24h: string;
  low24h: string;
  change24h: string; // fraction, e.g. "0.0123"
  baseVolume: string;
  quoteVolume: string;
}

type TickerHandler = (t: Ticker24h) => void;

/**
 * Real-time Bitget public WebSocket (v2) for futures and spot tickers.
 *
 * Bitget has no REST batch push, so the watchlist used to poll. This streams
 * ticker updates instead — sub-second, only pushing when the market actually
 * moves. Requires a literal "ping" every <30s or the server drops us; the
 * server answers "pong".
 */
export class BitgetWS {
  private ws: WebSocket | null = null;
  private connected = false;
  private closing = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  /** "instType:instId" → handlers */
  private handlers = new Map<string, Set<TickerHandler>>();

  /** Last time anything (ticks or the pong to our ping) arrived */
  private lastMessageAt = 0;
  private livenessTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * A socket can die silently (sleep, network change, frozen tab). We ping
   * every 20s and Bitget answers, so over 45s of silence means it's gone.
   */
  private checkAlive(maxSilenceMs: number) {
    if (!this.ws || !this.connected || this.handlers.size === 0) return;
    if (Date.now() - this.lastMessageAt > maxSilenceMs) this.reconnectNow();
  }

  private reconnectNow() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    const old = this.ws;
    this.ws = null;
    this.connected = false;
    if (old) {
      old.onclose = null;
      old.onerror = null;
      old.onmessage = null;
      old.close();
    }
    this.connect();
  }

  /** The tab is visible / online again: reconnect unless ticks are flowing. */
  wake() {
    if (this.closing || this.handlers.size === 0) return;
    if (!this.ws) {
      this.reconnectNow();
      return;
    }
    // Ask for a pong; if nothing at all arrives within 3s, start over.
    const since = Date.now();
    if (this.connected) this.ws.send("ping");
    setTimeout(() => {
      if (this.lastMessageAt < since) this.reconnectNow();
    }, 3_000);
  }

  connect() {
    if (this.ws || this.closing) return;
    this.livenessTimer ??= setInterval(() => this.checkAlive(45_000), 10_000);
    this.lastMessageAt = Date.now();
    this.ws = new WebSocket(BITGET_WS);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      // (re)subscribe everything we care about
      const keys = [...this.handlers.keys()];
      if (keys.length > 0) this.sendSubscribe(keys);
      // keepalive
      this.pingTimer = setInterval(() => {
        if (this.ws && this.connected) this.ws.send("ping");
      }, 20_000);
    };

    this.ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      if (ev.data === "pong") return;
      let msg: unknown;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      const m = msg as {
        action?: string;
        arg?: { channel?: string; instId?: string; instType?: BitgetInstType };
        data?: TickerData[];
      };
      if (m.arg?.channel === "ticker" && Array.isArray(m.data)) {
        const instType = m.arg.instType ?? "USDT-FUTURES";
        for (const d of m.data) this.dispatch(instType, d);
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      if (this.pingTimer) {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
      }
      if (!this.closing) this.scheduleReconnect();
    };

    this.ws.onerror = () => this.ws?.close();
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(15_000, 1_000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  /** Subscribe message args from handler keys ("instType:instId"). */
  private argsOf(keys: string[]) {
    return keys.map((k) => {
      const [instType, instId] = k.split(":");
      return { instType, channel: "ticker", instId };
    });
  }

  private sendSubscribe(keys: string[]) {
    this.ws?.send(JSON.stringify({ op: "subscribe", args: this.argsOf(keys) }));
  }

  private sendUnsubscribe(keys: string[]) {
    if (!this.connected) return;
    this.ws?.send(JSON.stringify({ op: "unsubscribe", args: this.argsOf(keys) }));
  }

  private dispatch(instType: BitgetInstType, d: TickerData) {
    const set = this.handlers.get(key(instType, d.instId));
    if (!set) return;
    const lastPrice = Number(d.lastPr);
    const open24h = Number(d.open24h);
    const t: Ticker24h = {
      symbol: d.instId,
      lastPrice,
      priceChange: lastPrice - open24h,
      priceChangePercent: Number(d.change24h) * 100,
      highPrice: Number(d.high24h),
      lowPrice: Number(d.low24h),
      volume: Number(d.baseVolume),
      quoteVolume: Number(d.quoteVolume),
    };
    for (const h of set) h(t);
  }

  /** Subscribe to a set of symbols (perpetuals by default). Returns an unsubscribe fn. */
  subscribeTickers(
    symbols: string[],
    onTick: TickerHandler,
    instType: BitgetInstType = "USDT-FUTURES",
  ): () => void {
    const keys = symbols.map((s) => key(instType, s));
    const fresh: string[] = [];
    for (const k of keys) {
      let set = this.handlers.get(k);
      if (!set) {
        set = new Set();
        this.handlers.set(k, set);
        fresh.push(k);
      }
      set.add(onTick);
    }
    if (this.connected && fresh.length > 0) this.sendSubscribe(fresh);

    return () => {
      const gone: string[] = [];
      for (const k of keys) {
        const set = this.handlers.get(k);
        if (!set) continue;
        set.delete(onTick);
        if (set.size === 0) {
          this.handlers.delete(k);
          gone.push(k);
        }
      }
      if (gone.length > 0) this.sendUnsubscribe(gone);
    };
  }
}

let singleton: BitgetWS | null = null;
export function getBitgetWS(): BitgetWS {
  if (typeof window === "undefined") return new BitgetWS();
  if (!singleton) {
    const ws = new BitgetWS();
    ws.connect();
    // Check the socket whenever the tab comes back into view or goes online
    const wake = () => {
      if (!document.hidden) ws.wake();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    singleton = ws;
  }
  return singleton;
}
