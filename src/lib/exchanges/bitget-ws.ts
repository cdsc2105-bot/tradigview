import type { Ticker24h } from "@/lib/binance/types";

const BITGET_WS = "wss://ws.bitget.com/v2/ws/public";
const INST_TYPE = "USDT-FUTURES";

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
 * Real-time Bitget public WebSocket (v2) for futures tickers.
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
  /** instId → handlers */
  private handlers = new Map<string, Set<TickerHandler>>();

  connect() {
    if (this.ws || this.closing) return;
    this.ws = new WebSocket(BITGET_WS);

    this.ws.onopen = () => {
      this.connected = true;
      this.reconnectAttempts = 0;
      // (re)subscribe everything we care about
      const symbols = [...this.handlers.keys()];
      if (symbols.length > 0) this.sendSubscribe(symbols);
      // keepalive
      this.pingTimer = setInterval(() => {
        if (this.ws && this.connected) this.ws.send("ping");
      }, 20_000);
    };

    this.ws.onmessage = (ev) => {
      if (ev.data === "pong") return;
      let msg: unknown;
      try {
        msg = JSON.parse(ev.data as string);
      } catch {
        return;
      }
      const m = msg as {
        action?: string;
        arg?: { channel?: string; instId?: string };
        data?: TickerData[];
      };
      if (m.arg?.channel === "ticker" && Array.isArray(m.data)) {
        for (const d of m.data) this.dispatch(d);
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

  private sendSubscribe(symbols: string[]) {
    this.ws?.send(
      JSON.stringify({
        op: "subscribe",
        args: symbols.map((instId) => ({
          instType: INST_TYPE,
          channel: "ticker",
          instId,
        })),
      }),
    );
  }

  private sendUnsubscribe(symbols: string[]) {
    if (!this.connected) return;
    this.ws?.send(
      JSON.stringify({
        op: "unsubscribe",
        args: symbols.map((instId) => ({
          instType: INST_TYPE,
          channel: "ticker",
          instId,
        })),
      }),
    );
  }

  private dispatch(d: TickerData) {
    const set = this.handlers.get(d.instId);
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

  /** Subscribe to a set of symbols. Returns an unsubscribe fn. */
  subscribeTickers(symbols: string[], onTick: TickerHandler): () => void {
    const fresh: string[] = [];
    for (const s of symbols) {
      let set = this.handlers.get(s);
      if (!set) {
        set = new Set();
        this.handlers.set(s, set);
        fresh.push(s);
      }
      set.add(onTick);
    }
    if (this.connected && fresh.length > 0) this.sendSubscribe(fresh);

    return () => {
      const gone: string[] = [];
      for (const s of symbols) {
        const set = this.handlers.get(s);
        if (!set) continue;
        set.delete(onTick);
        if (set.size === 0) {
          this.handlers.delete(s);
          gone.push(s);
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
    singleton = new BitgetWS();
    singleton.connect();
  }
  return singleton;
}
