// Room sizing. Safe to import from client components (no Node APIs).
//
// The act's scale sets the room; local demand only moves it down. Demand is relative to the act's
// own best city, so on its own it would put every act — big or small — into halls in its top markets.

import type { ActScale, VenueTier } from "./types";

export type { ActScale };

export const TIER_CAPACITY: Record<VenueTier, string> = {
  club: "250–600",
  theater: "800–2,500",
  hall: "3,000–6,000",
};

const ORDER: VenueTier[] = ["club", "theater", "hall"];

/**
 * All-time Last.fm listeners → the room an act headlines in a typical market.
 * Calibrated against acts with known touring rooms: Ratboys (127k, clubs), MJ Lenderman (265k, theaters),
 * Fontaines D.C. (692k, halls), Khruangbin (901k, halls and up).
 */
export const LISTENER_THRESHOLDS = { theater: 150_000, hall: 600_000 } as const;

export function scaleFromListeners(listeners?: number): ActScale {
  if (typeof listeners !== "number" || !Number.isFinite(listeners) || listeners <= 0) {
    // No listener data (common for comedians): fall back to demand, capped at theater — undersell rather than overreach.
    return { tier: "theater", source: "unknown", reason: "no-data" };
  }
  const tier =
    listeners >= LISTENER_THRESHOLDS.hall ? "hall" : listeners >= LISTENER_THRESHOLDS.theater ? "theater" : "club";
  return { tier, listeners, source: "lastfm" };
}

/** Last.fm counts music plays, so a stand-up who sells out theaters can show 6k listeners. */
export const COMEDIAN_SCALE: ActScale = { tier: "theater", source: "unknown", reason: "comedian" };

/** Markets below this demand get one size smaller than the act's usual room. */
export const WEAK_MARKET = 0.5;

const stepDown = (tier: VenueTier): VenueTier => ORDER[Math.max(0, ORDER.indexOf(tier) - 1)];

/** The room to book in one market. */
export function roomFor(scale: ActScale, demand: number): VenueTier {
  if (scale.source === "unknown") {
    const byDemand: VenueTier = demand >= 0.8 ? "hall" : demand >= WEAK_MARKET ? "theater" : "club";
    return ORDER.indexOf(byDemand) > ORDER.indexOf(scale.tier) ? scale.tier : byDemand;
  }
  return demand < WEAK_MARKET ? stepDown(scale.tier) : scale.tier;
}

export function formatListeners(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n);
}
