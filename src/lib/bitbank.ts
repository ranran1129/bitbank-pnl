import CryptoJS from "crypto-js";

const PRIVATE_BASE = "https://api.bitbank.cc/v1";
const PUBLIC_BASE = "https://public.bitbank.cc";

export class BitbankClient {
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  private sign(message: string): string {
    return CryptoJS.HmacSHA256(message, this.apiSecret).toString();
  }

  private nonce(): string {
    return Date.now().toString();
  }

  private async privateGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    const nonce = this.nonce();
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    const message = nonce + path + query;
    const signature = this.sign(message);

    const res = await fetch(PRIVATE_BASE + path + query, {
      headers: {
        "ACCESS-KEY": this.apiKey,
        "ACCESS-NONCE": nonce,
        "ACCESS-SIGNATURE": signature,
        "Content-Type": "application/json",
      },
    });

    if (!res.ok) throw new Error(`bitbank API error: ${res.status}`);
    const data = await res.json();
    if (data.success !== 1) throw new Error(JSON.stringify(data.data));
    return data.data as T;
  }

  // ===== Public endpoints (no auth) =====

  static async getTicker(pair: string) {
    const res = await fetch(`${PUBLIC_BASE}/${pair}/ticker`);
    const data = await res.json();
    return data.data;
  }

  static async getMultiTicker(pairs: string[]) {
    const results = await Promise.allSettled(pairs.map((p) => BitbankClient.getTicker(p)));
    const map: Record<string, { last: string; buy: string; sell: string }> = {};
    pairs.forEach((p, i) => {
      const r = results[i];
      if (r.status === "fulfilled") map[p] = r.value;
    });
    return map;
  }

  // ===== Private endpoints =====

  async getAssets() {
    return this.privateGet<{ assets: import("./calc").BitbankAsset[] }>("/user/assets");
  }

  async getSpotTrades(pair: string, count = 100, since?: number) {
    const params: Record<string, string> = { count: String(count) };
    if (since) params.since = String(since);
    return this.privateGet<{ trades: import("./calc").BitbankTrade[] }>(
      `/user/spot/trade_history`,
      { pair, ...params }
    );
  }

  async getAllSpotTrades(pairs: string[], count = 100) {
    const results = await Promise.allSettled(
      pairs.map((p) => this.getSpotTrades(p, count))
    );
    const trades: import("./calc").BitbankTrade[] = [];
    for (const r of results) {
      if (r.status === "fulfilled") trades.push(...r.value.trades);
    }
    return trades.sort((a, b) => a.executed_at - b.executed_at);
  }

  async getMarginPositions(status: "open" | "closed" = "closed") {
    return this.privateGet<{ positions: import("./calc").BitbankMarginPosition[] }>(
      "/user/margin/position_history",
      { status }
    );
  }

  async getOpenMarginPositions() {
    return this.privateGet<{ positions: import("./calc").BitbankMarginPosition[] }>(
      "/user/margin/positions"
    );
  }
}

// Supported spot pairs
export const SPOT_PAIRS = [
  "btc_jpy", "eth_jpy", "xrp_jpy", "sol_jpy", "doge_jpy",
  "ada_jpy", "dot_jpy", "ltc_jpy", "bcc_jpy", "mona_jpy",
  "xlm_jpy", "link_jpy", "avax_jpy", "matic_jpy", "bat_jpy",
];

export const MARGIN_PAIRS = [
  "btc_jpy", "eth_jpy", "xrp_jpy", "sol_jpy", "doge_jpy",
  "ada_jpy", "link_jpy", "avax_jpy", "matic_jpy",
];
