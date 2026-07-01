import { createHmac } from "crypto";

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
    return createHmac("sha256", this.apiSecret).update(message).digest("hex");
  }

  private nonce(): string {
    return Date.now().toString();
  }

  private async privateGet<T>(path: string, params?: Record<string, string>): Promise<T> {
    const nonce = this.nonce();
    const query = params ? "?" + new URLSearchParams(params).toString() : "";
    const message = nonce + "/v1" + path + query;
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

  async getAssets() {
    return this.privateGet<{ assets: import("./calc").BitbankAsset[] }>("/user/assets");
  }

  async getSpotTrades(pair: string, count = 1000) {
    return this.privateGet<{ trades: import("./calc").BitbankTrade[] }>(
      `/user/spot/trade_history`,
      { pair, count: String(count) }
    );
  }

  // 現物・信用の全取引履歴を取得（同エンドポイントに混在、position_side で判別）
  // 3ペアずつ並列取得し、バッチ間に150msのウェイトを入れてレートリミットを回避
  async getAllSpotTrades(pairs: string[], count = 1000): Promise<{
    trades: import("./calc").BitbankTrade[];
    errors: { pair: string; error: string }[];
  }> {
    const trades: import("./calc").BitbankTrade[] = [];
    const errors: { pair: string; error: string }[] = [];
    const BATCH_SIZE = 3;

    for (let i = 0; i < pairs.length; i += BATCH_SIZE) {
      const batch = pairs.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((pair) => this.getSpotTrades(pair, count))
      );
      results.forEach((r, idx) => {
        if (r.status === "fulfilled") {
          trades.push(...r.value.trades);
        } else {
          const msg = r.reason instanceof Error ? r.reason.message : String(r.reason);
          errors.push({ pair: batch[idx], error: msg });
          console.error(`[bitbank] getSpotTrades(${batch[idx]}) failed: ${msg}`);
        }
      });
      if (i + BATCH_SIZE < pairs.length) {
        await new Promise((r) => setTimeout(r, 150));
      }
    }

    return {
      trades: trades.sort((a, b) => a.executed_at - b.executed_at),
      errors,
    };
  }

  // 信用オープンポジション: GET /user/margin/positions
  async getOpenMarginPositions() {
    return this.privateGet<{ positions: import("./calc").BitbankOpenPosition[] }>(
      "/user/margin/positions"
    );
  }
}

export const SPOT_PAIRS = [
  "btc_jpy", "eth_jpy", "xrp_jpy", "sol_jpy", "doge_jpy",
  "ada_jpy", "dot_jpy", "ltc_jpy", "bcc_jpy", "mona_jpy",
  "xlm_jpy", "link_jpy", "avax_jpy", "matic_jpy", "bat_jpy",
];

export const MARGIN_PAIRS = [
  "btc_jpy", "eth_jpy", "xrp_jpy", "sol_jpy", "doge_jpy",
];
