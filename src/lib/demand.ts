// Demand in words people use. Raw demand (0..1, relative to the act's best city) is for ranking and
// room sizing only; anything a booker or user reads should use the market's rank instead.

import type { Market } from "./types";

/** "#3 of 43 fan markets — 97% as strong as Boston, the act's best." */
export function describeDemand(market: Pick<Market, "rank" | "demand" | "name">, markets: Pick<Market, "name">[]): string {
  const total = markets.length;
  if (market.rank === 1) return `#1 of ${total} fan markets — the act's strongest`;
  const best = markets[0]?.name ?? "the top market";
  return `#${market.rank} of ${total} fan markets — ${Math.round(market.demand * 100)}% as strong as ${best}, the act's best`;
}

/** A raw score like "0.965" or "demand 0.97" in reader-facing text means the rank wasn't used. */
const RAW_SCORE = /(?<![\d.,$])0\.\d{2,}(?!\d)/;

export function findRawScore(text: string): string | undefined {
  return text.match(RAW_SCORE)?.[0];
}
