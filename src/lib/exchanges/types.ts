export type Exchange = "binance" | "bitget";

export interface ExchangeConfig {
  name: string;
  label: string;
  type: "spot" | "perpetual";
}

export const EXCHANGES: Record<Exchange, ExchangeConfig> = {
  binance: { name: "binance", label: "Binance", type: "spot" },
  bitget: { name: "bitget", label: "Bitget Perp", type: "perpetual" },
};
