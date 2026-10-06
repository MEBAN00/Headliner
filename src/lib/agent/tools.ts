// Tool definitions the planner model sees, and the dispatcher that runs them against a TourSession.
// Schemas are written for OpenAI strict mode: every property is listed in `required`, optional
// values are nullable, and `additionalProperties` is false everywhere.

import type { PlanDraft, TourSession } from "./session";
import type { VenueTier } from "../types";

const TIERS: VenueTier[] = ["club", "theater", "hall"];

export type ToolSpec = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

const object = (properties: Record<string, unknown> = {}) => ({
  type: "object",
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});

export const TOOLS: ToolSpec[] = [
  {
    name: "find_artist",
    description: "Resolve an artist or comedian name to a Qloo entity. Call this first.",
    parameters: object({ name: { type: "string", description: "Act name as the user typed it" } }),
  },
  {
    name: "get_fan_markets",
    description:
      "Read the act's Qloo heatmap and aggregate it into touring markets. Returns markets sorted by demand " +
      "(0..1, normalized so the strongest market is 1). This is the primary evidence for city selection.",
    parameters: object(),
  },
  {
    name: "get_audience_profile",
    description: "Age and gender skew of the act's audience, from Qloo demographics.",
    parameters: object(),
  },
  {
    name: "find_opener_candidates",
    description:
      "Find similar acts and compare their audience geography with the headliner's. For each candidate: " +
      "affinity (taste similarity), overlap (share of headliner demand they also draw — high means they fit the bill), " +
      "addedReach (share of their demand in markets where the headliner is weak — high means they sell extra tickets).",
    parameters: object({
      take: { type: ["integer", "null"], description: "Candidates to compare, 2–10 (null for 6)" },
    }),
  },
  {
    name: "get_local_taste",
    description:
      "Music genres the act's fans in each market over-index on (Qloo), filtered to what's distinctive per city. " +
      "Pass every routed market in one call. Use for marketing angles.",
    parameters: object({ market_ids: { type: "array", items: { type: "string" } } }),
  },
  {
    name: "find_venues",
    description:
      "Look up venues in a market. tier is the room size to target: club (250–600), theater (800–2,500), " +
      "hall (3,000–6,000). Match tier to demand; don't overreach.",
    parameters: object({
      market_id: { type: "string" },
      tier: { type: "string", enum: TIERS },
    }),
  },
  {
    name: "plan_route",
    description:
      "Order the chosen markets into a drivable route and assign show days (max 16 markets). Distances and days " +
      "are computed, not estimated — use the returned numbers verbatim. Call again if you change the city list.",
    parameters: object({
      market_ids: { type: "array", items: { type: "string" } },
      start_market_id: { type: ["string", "null"], description: "First city, or null to let routing decide" },
    }),
  },
  {
    name: "submit_tour_plan",
    description:
      "Submit the finished plan. Every routed market needs a stop entry. Ground every claim in numbers returned by " +
      "earlier tools. Calling this ends the run.",
    parameters: object({
      title: { type: "string", description: "Poster title, e.g. 'The Gulf Coast Run'" },
      summary: { type: "string", description: "Two sentences: the strategy and the evidence behind it" },
      opener_ids: { type: "array", items: { type: "string" }, description: "1–2 opener ids" },
      stops: {
        type: "array",
        items: object({
          market_id: { type: "string" },
          why: { type: "string", description: "One sentence citing demand or taste data" },
          marketing_angle: { type: "string", description: "One sentence, specific to local taste tags" },
          pitch_email: { type: "string", description: "Booking pitch to the venue, under 90 words" },
          venue_id: { type: ["string", "null"], description: "Venue id from find_venues, or null" },
        }),
      },
    }),
  },
];

export const FINAL_TOOL = "submit_tour_plan";

type Input = Record<string, unknown>;

const str = (v: unknown, field: string): string => {
  if (typeof v !== "string" || !v.trim()) throw new Error(`"${field}" must be a non-empty string`);
  return v;
};
const strArray = (v: unknown, field: string, max = 16): string[] => {
  if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) throw new Error(`"${field}" must be a string array`);
  if (v.length === 0 || v.length > max) throw new Error(`"${field}" must have 1–${max} items`);
  return v as string[];
};

/** Runs one tool call. Throws on bad input; the caller returns the message to the model as an error. */
export async function runTool(session: TourSession, name: string, input: Input): Promise<unknown> {
  switch (name) {
    case "find_artist":
      return session.findArtist(str(input.name, "name"));
    case "get_fan_markets":
      return session.getFanMarkets();
    case "get_audience_profile":
      return session.getAudienceProfile();
    case "find_opener_candidates": {
      const take = typeof input.take === "number" ? Math.min(10, Math.max(2, Math.round(input.take))) : 6;
      return session.findOpenerCandidates(take);
    }
    case "get_local_taste":
      return session.getLocalTaste(strArray(input.market_ids, "market_ids"));
    case "find_venues": {
      const tier = str(input.tier, "tier") as VenueTier;
      if (!TIERS.includes(tier)) throw new Error(`tier must be one of ${TIERS.join(", ")}`);
      return session.findVenues(str(input.market_id, "market_id"), tier);
    }
    case "plan_route":
      return session.planRoute(
        strArray(input.market_ids, "market_ids"),
        typeof input.start_market_id === "string" ? input.start_market_id : undefined,
      );
    case "submit_tour_plan":
      return session.submitPlan(input as unknown as PlanDraft);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
