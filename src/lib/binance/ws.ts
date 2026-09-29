import type { Candle, Timeframe } from "./types";

/**
 * Spot streams, main host first. data-stream.binance.vision is Binance's
 * market-data-only mirror, reachable where stream.binance.com is blocked.
 */
const WS_SPOT = ["wss://stream.binance.com:9443/stream", "wss://data-stream.binance.vision/stream"];
/** Binance USDT-M futures use a separate host with the same stream protocol. */
const WS_FUTURES = ["wss://fstream.binance.com/stream"];

interface KlineMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    k: {
      t: number; // open time
      T: number; // close time
      s: string;
      i: string;
      o: string;
      c: string;
      h: string;
      l: string;
      v: string;
      x: boolean; // is closed
    };
  };
}

interface MiniTickerMsg {
  stream: string;
  data: {
    e: string;
    E: number;
    s: string;
    c: string; // close
    o: string; // open
    h: string;
    l: string;
    v: string;
    q: string;
  };
}

interface AggTradeMsg {
  stream: string;
  data: {
    e: string;
    s: string;
    p: string; // price
    q: string; // quantity
    T: number; // trade time (ms)
  };
}

type WSMsg = KlineMsg | MiniTickerMsg | AggTradeMsg;

export interface Trade {
  price: number;
  qty: number;
  /** Trade time, unix ms */
  time: number;
}

export interface KlineSubscription {
  symbol: string;
  interval: Timeframe;
  onCandle: (c: Candle) => void;
}

export interface TickerSubscription {
  symbols: string[];
  onTick: (s: { symbol: string; close: number; open: number; pct: number }) => void;
}

/**
 * Single multiplexed WS connection to Binance, with auto-reconnect.
 * Subscriptions can be added/removed at runtime via SUBSCRIBE/UNSUBSCRIBE.
 */
export class BinanceWS {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private nextId = 1;
  private klineSubs = new Map<string, KlineSubscription>();
  private tickerSubs = new Map<string, (m: MiniTickerMsg["data"]) => void>();
  private tradeSubs = new Map<string, (t: Trade) => void>();
  private connected = false;
  private closing = false;
  /** Which of `urls` to use; moves on when a host can't even be reached */
  private urlIndex = 0;
  /** Last time anything arrived — a live kline stream talks every second or two */
  private lastMessageAt = 0;
  private livenessTimer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly urls: string[] = WS_SPOT) {}

  private get hasSubscriptions() {
    return this.klineSubs.size + this.tickerSubs.size + this.tradeSubs.size > 0;
  }

  /**
   * After sleep, a network change or a frozen background tab a socket can die
   * without ever firing `close` — it just goes quiet. Treat long silence on an
   * open, subscribed socket as dead and reconnect.
   */
  private checkAlive(maxSilenceMs: number) {
    if (!this.ws || !this.connected || !this.hasSubscriptions) return;
    if (Date.now() - this.lastMessageAt > maxSilenceMs) this.reconnectNow();
  }

  /** Drop the current socket (if any) and connect again right away. */
  private reconnectNow() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
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

  /** The tab is visible / online again: make sure the stream is really flowing. */
  wake() {
    if (this.closing || !this.hasSubscriptions) return;
    if (!this.ws) this.reconnectNow();
    else this.checkAlive(4_000);
  }

  connect() {
    if (this.ws || this.closing) return;
    this.livenessTimer ??= setInterval(() => this.checkAlive(10_000), 3_000);
    this.lastMessageAt = Date.now();
    this.ws = new WebSocket(this.urls[this.urlIndex]);
    let opened = false;

    this.ws.onopen = () => {
      opened = true;
      this.connected = true;
      this.reconnectAttempts = 0;
      // Re-subscribe everything
      const streams: string[] = [];
      this.klineSubs.forEach((s) => {
        streams.push(`${s.symbol.toLowerCase()}@kline_${s.interval}`);
      });
      this.tickerSubs.forEach((_v, k) => streams.push(k));
      this.tradeSubs.forEach((_v, k) => streams.push(k));
      if (streams.length > 0) this.send({ method: "SUBSCRIBE", params: streams, id: this.nextId++ });
    };

    this.ws.onmessage = (ev) => {
      this.lastMessageAt = Date.now();
      try {
        const msg = JSON.parse(ev.data) as WSMsg | { result: unknown; id: number };
        if ("stream" in msg) this.dispatch(msg);
      } catch {
        // ignore
      }
    };

    this.ws.onclose = () => {
      this.connected = false;
      this.ws = null;
      if (this.closing) return;
      if (!opened && this.urls.length > 1) {
        // Never got through — this host is blocked here; try the next one now.
        this.urlIndex = (this.urlIndex + 1) % this.urls.length;
        if (this.urlIndex !== 0) {
          this.connect();
          return;
        }
      }
      this.scheduleReconnect();
    };

    this.ws.onerror = () => {
      this.ws?.close();
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) return;
    const delay = Math.min(30000, 1000 * 2 ** this.reconnectAttempts);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }

  private send(payload: object) {
    if (this.ws && this.connected) this.ws.send(JSON.stringify(payload));
  }

  private dispatch(msg: WSMsg) {
    if (msg.stream.includes("@kline_")) {
      const sub = this.klineSubs.get(msg.stream);
      if (!sub) return;
      const k = (msg as KlineMsg).data.k;
      sub.onCandle({
        time: Math.floor(k.t / 1000),
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        isFinal: k.x,
      });
    } else if (msg.stream.includes("@aggTrade")) {
      const handler = this.tradeSubs.get(msg.stream);
      const d = (msg as AggTradeMsg).data;
      if (handler) handler({ price: parseFloat(d.p), qty: parseFloat(d.q), time: d.T });
    } else if (msg.stream.includes("@miniTicker")) {
      const handler = this.tickerSubs.get(msg.stream);
      if (handler) handler((msg as MiniTickerMsg).data);
    }
  }

  subscribeKline(sub: KlineSubscription): () => void {
    const stream = `${sub.symbol.toLowerCase()}@kline_${sub.interval}`;
    this.klineSubs.set(stream, sub);
    if (this.connected) this.send({ method: "SUBSCRIBE", params: [stream], id: this.nextId++ });
    return () => {
      this.klineSubs.delete(stream);
      if (this.connected) this.send({ method: "UNSUBSCRIBE", params: [stream], id: this.nextId++ });
    };
  }

  /**
   * Every trade as it prints (aggregated per price by Binance) — lets the chart
   * move tick by tick instead of waiting for the ~1s kline snapshot.
   */
  subscribeTrades(symbol: string, onTrade: (t: Trade) => void): () => void {
    const stream = `${symbol.toLowerCase()}@aggTrade`;
    this.tradeSubs.set(stream, onTrade);
    if (this.connected) this.send({ method: "SUBSCRIBE", params: [stream], id: this.nextId++ });
    return () => {
      this.tradeSubs.delete(stream);
      if (this.connected) this.send({ method: "UNSUBSCRIBE", params: [stream], id: this.nextId++ });
    };
  }

  subscribeMiniTickers(
    symbols: string[],
    onTick: (s: { symbol: string; close: number; open: number; pct: number }) => void,
  ): () => void {
    const streams = symbols.map((s) => `${s.toLowerCase()}@miniTicker`);
    streams.forEach((stream) => {
      this.tickerSubs.set(stream, (d) => {
        const close = parseFloat(d.c);
        const open = parseFloat(d.o);
        onTick({
          symbol: d.s,
          close,
          open,
          pct: open === 0 ? 0 : ((close - open) / open) * 100,
        });
      });
    });
    if (this.connected) this.send({ method: "SUBSCRIBE", params: streams, id: this.nextId++ });
    return () => {
      streams.forEach((s) => this.tickerSubs.delete(s));
      if (this.connected) this.send({ method: "UNSUBSCRIBE", params: streams, id: this.nextId++ });
    };
  }

  close() {
    this.closing = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.livenessTimer) clearInterval(this.livenessTimer);
    this.ws?.close();
    this.ws = null;
  }
}

/** Check the sockets whenever the tab comes back into view or goes online. */
function onWake(ws: BinanceWS) {
  const wake = () => {
    if (!document.hidden) ws.wake();
  };
  document.addEventListener("visibilitychange", wake);
  window.addEventListener("focus", wake);
  window.addEventListener("online", wake);
  window.addEventListener("pageshow", wake);
}

// Singletons — one WS connection per venue per browser tab
let spotSingleton: BinanceWS | null = null;
export function getBinanceWS(): BinanceWS {
  if (typeof window === "undefined") {
    // SSR safety: dummy
    return new BinanceWS();
  }
  if (!spotSingleton) {
    spotSingleton = new BinanceWS(WS_SPOT);
    spotSingleton.connect();
    onWake(spotSingleton);
  }
  return spotSingleton;
}

let futuresSingleton: BinanceWS | null = null;
export function getBinanceFuturesWS(): BinanceWS {
  if (typeof window === "undefined") {
    return new BinanceWS(WS_FUTURES);
  }
  if (!futuresSingleton) {
    futuresSingleton = new BinanceWS(WS_FUTURES);
    futuresSingleton.connect();
    onWake(futuresSingleton);
  }
  return futuresSingleton;
}
