// One tour-planning run: holds the data gathered so far and implements every tool.
// Both the OpenAI agent and the scripted planner drive the same methods, so the UI events
// and the final plan are identical whichever brain is in charge.

import { aggregateMarkets, metroById, metroByName } from "../markets";
import * as qloo from "../qloo/client";
import { planRoute } from "../route";
import { describeDemand, findRawScore } from "../demand";
import { distinctiveTags } from "../taste";
import type {
  AgentEvent,
  Artist,
  AudienceProfile,
  DataMode,
  HeatCell,
  Market,
  OpenerCandidate,
  Route,
  TourPlan,
  TourRequest,
  TourStop,
  Venue,
  VenueTier,
} from "../types";
import { formatListeners, roomFor, scaleFromListeners, TIER_CAPACITY } from "../tiers";
import { findVenues, venuesAreLive } from "../venues";

export type Emit = (event: AgentEvent) => void;

export type StopDraft = {
  market_id: string;
  why: string;
  marketing_angle: string;
  pitch_email: string;
  venue_id?: string | null;
};

export type PlanDraft = {
  title: string;
  summary: string;
  opener_ids: string[];
  stops: StopDraft[];
};

/** Overlap of two demand vectors over the same markets. */
export function compareAudiences(
  headliner: Market[],
  candidate: Market[],
): { overlap: number; addedReach: number } {
  const h = new Map(headliner.map((m) => [m.id, m.demand]));
  const c = new Map(candidate.map((m) => [m.id, m.demand]));
  const ids = new Set([...h.keys(), ...c.keys()]);
  let shared = 0;
  let hTotal = 0;
  let cTotal = 0;
  let added = 0;
  for (const id of ids) {
    const hv = h.get(id) ?? 0;
    const cv = c.get(id) ?? 0;
    shared += Math.min(hv, cv);
    hTotal += hv;
    cTotal += cv;
    added += Math.max(0, cv - hv);
  }
  return {
    overlap: hTotal ? Number((shared / hTotal).toFixed(3)) : 0,
    addedReach: cTotal ? Number((added / cTotal).toFixed(3)) : 0,
  };
}

export class TourSession {
  artist?: Artist;
  cells: HeatCell[] = [];
  markets: Market[] = [];
  audience?: AudienceProfile;
  openerCandidates: OpenerCandidate[] = [];
  route?: Route;
  rawTaste = new Map<string, string[]>();
  taste = new Map<string, string[]>();
  venues = new Map<string, Venue[]>();
  /** Room size actually requested per market, so the plan reports what was searched for. */
  tiers = new Map<string, VenueTier>();
  plan?: TourPlan;

  constructor(
    readonly request: TourRequest,
    readonly emit: Emit,
    readonly agent: DataMode["agent"],
  ) {}

  get mode(): DataMode {
    return {
      qloo: qloo.qlooIsLive() ? "live" : "mock",
      venues: venuesAreLive() ? "live" : "mock",
      agent: this.agent,
    };
  }

  get scale() {
    return this.artist?.scale ?? scaleFromListeners(undefined);
  }

  /** The room to book in a market, from the act's scale and local demand. */
  roomFor(marketId: string): VenueTier {
    return roomFor(this.scale, this.markets.find((m) => m.id === marketId)?.demand ?? 0);
  }

  private requireArtist(): Artist {
    if (!this.artist) throw new Error("Call find_artist first.");
    return this.artist;
  }

  private tool(name: string, label: string) {
    this.emit({ type: "tool", name, label });
  }

  async findArtist(name: string) {
    this.tool("find_artist", `Looking up ${name} in Qloo`);
    const { artist: found, suggestions } = await qloo.searchArtist(name);
    if (!found) {
      return {
        found: false,
        message: suggestions.length
          ? `Qloo has no act named "${name}". Did you mean ${suggestions.join(", ")}?`
          : `Qloo has no act named "${name}".`,
      };
    }
    const scale = await qloo.artistScale(found);
    const artist = { ...found, scale };
    this.artist = artist;
    this.emit({ type: "artist", artist });
    return {
      found: true,
      artist: { id: artist.id, name: artist.name },
      scale:
        scale.source === "lastfm"
          ? `${formatListeners(scale.listeners!)} Last.fm listeners → a ${scale.tier}-level act (${TIER_CAPACITY[scale.tier]} cap)`
          : scale.reason === "comedian"
            ? `Comedian: listener counts don't apply; treat as up to ${scale.tier} level (${TIER_CAPACITY[scale.tier]} cap)`
            : `No listener data; treat as up to ${scale.tier} level (${TIER_CAPACITY[scale.tier]} cap)`,
    };
  }

  async getFanMarkets() {
    const artist = this.requireArtist();
    this.tool("get_fan_markets", `Reading the fan heatmap for ${artist.name}`);
    this.cells = await qloo.heatmap(artist.id);
    this.emit({ type: "heatmap", cells: this.cells });
    this.markets = aggregateMarkets(this.cells);
    this.emit({ type: "markets", markets: this.markets });
    return {
      heat_cells: this.cells.length,
      market_count: this.markets.length,
      markets: this.markets.slice(0, 24).map((m) => ({
        market_id: m.id,
        name: m.name,
        region: m.region,
        demand: m.demand, // for your decisions only — never quote it
        in_words: describeDemand(m, this.markets), // what to say to people
        room: roomFor(this.scale, m.demand),
      })),
    };
  }

  async getAudienceProfile() {
    const artist = this.requireArtist();
    this.tool("get_audience_profile", "Profiling the audience");
    this.audience = await qloo.audience(artist.id);
    return this.audience;
  }

  async findOpenerCandidates(take = 6) {
    const artist = this.requireArtist();
    if (!this.markets.length) await this.getFanMarkets();
    this.tool("find_opener_candidates", "Comparing audiences of similar acts");
    const similar = await qloo.similarArtists(artist.id, take);
    this.openerCandidates = await Promise.all(
      similar.map(async (s) => {
        const theirMarkets = aggregateMarkets(await qloo.heatmap(s.id));
        return { id: s.id, name: s.name, affinity: s.affinity, ...compareAudiences(this.markets, theirMarkets) };
      }),
    );
    return { candidates: this.openerCandidates };
  }

  async getLocalTaste(marketIds: string[]) {
    const artist = this.requireArtist();
    this.tool("get_local_taste", `Reading local taste in ${marketIds.length} cities`);
    await Promise.all(
      marketIds.map(async (id) => {
        const metro = metroById(id);
        this.rawTaste.set(id, metro ? await qloo.localTaste(artist.id, metro.name) : []);
      }),
    );
    // Recompute across every city fetched so far: "distinctive" is relative to the whole run.
    this.taste = distinctiveTags(this.rawTaste);
    return Object.fromEntries(marketIds.map((id) => [id, this.taste.get(id) ?? []]));
  }

  async findVenues(marketId: string, tier: VenueTier) {
    const metro = metroById(marketId);
    this.tool("find_venues", `Finding ${tier} rooms in ${metro?.name ?? marketId}`);
    const venues = await findVenues(marketId, tier);
    this.venues.set(marketId, venues);
    this.tiers.set(marketId, tier);
    return {
      market_id: marketId,
      tier,
      venues: venues.map((v) => ({ id: v.id, name: v.name, size_check: v.sizeMatch })),
    };
  }

  /** The user's chosen start city always opens the run, even if demand alone wouldn't pick it. */
  private withStartCity(marketIds: string[], startId: string | undefined): string[] {
    if (!startId || marketIds.includes(startId)) return marketIds;
    const ids = [startId, ...marketIds];
    const cap = this.request.maxCities;
    if (!cap || ids.length <= cap) return ids;
    // Make room by dropping the weakest market (never the start city).
    const demand = (id: string) => this.markets.find((m) => m.id === id)?.demand ?? 0;
    const weakest = marketIds.reduce((low, id) => (demand(id) < demand(low) ? id : low));
    return ids.filter((id) => id !== weakest);
  }

  planRoute(marketIds: string[], startMarketId?: string) {
    const requestedStart = this.request.startCity ? metroByName(this.request.startCity)?.id : undefined;
    const startId = requestedStart ?? startMarketId;
    const ids = this.withStartCity(marketIds, startId);
    this.tool("plan_route", `Routing ${ids.length} cities`);
    const points = ids
      .map((id) => metroById(id))
      .filter((m): m is NonNullable<typeof m> => Boolean(m));
    this.route = planRoute(points, startId);
    this.emit({ type: "route", route: this.route });
    return this.route;
  }

  /** Validates the agent's draft against gathered data and assembles the final plan. */
  submitPlan(draft: PlanDraft) {
    const artist = this.requireArtist();
    if (!this.route) throw new Error("Call plan_route before submitting the plan.");
    const drafts = new Map(draft.stops.map((s) => [s.market_id, s]));
    const missing = this.route.stops.filter((s) => !drafts.has(s.marketId)).map((s) => s.marketId);
    if (missing.length) throw new Error(`Plan is missing stops for: ${missing.join(", ")}`);

    // People read this text; a raw score like "0.965" means nothing to a booker.
    const raw = [
      ["title", draft.title],
      ["summary", draft.summary],
      ...draft.stops.flatMap((s) => [
        [`${s.market_id} why`, s.why],
        [`${s.market_id} marketing_angle`, s.marketing_angle],
        [`${s.market_id} pitch_email`, s.pitch_email],
      ]),
    ]
      .map(([field, text]) => [field, findRawScore(text ?? "")] as const)
      .filter(([, hit]) => hit);
    if (raw.length) {
      throw new Error(
        `Raw demand scores in reader-facing text (${raw.map(([f, hit]) => `${f}: "${hit}"`).join("; ")}). ` +
          `Rewrite those fields using the market's in_words phrasing, e.g. "your #3 market of 43".`,
      );
    }

    const stops: TourStop[] = this.route.stops.map((stop) => {
      const d = drafts.get(stop.marketId)!;
      const market = this.markets.find((m) => m.id === stop.marketId);
      const venues = this.venues.get(stop.marketId) ?? [];
      return {
        ...stop,
        demand: market?.demand ?? 0,
        rank: market?.rank ?? this.markets.length + 1,
        tier: this.tiers.get(stop.marketId) ?? this.roomFor(stop.marketId),
        venue: venues.find((v) => v.id === d.venue_id) ?? venues[0],
        why: d.why,
        tasteTags: this.taste.get(stop.marketId) ?? [],
        marketingAngle: d.marketing_angle,
        pitchEmail: d.pitch_email,
      };
    });

    this.plan = {
      artist,
      title: draft.title,
      summary: draft.summary,
      stops,
      marketCount: this.markets.length,
      openers: this.openerCandidates.filter((o) => draft.opener_ids.includes(o.id)),
      audience: this.audience,
      totalMiles: this.route.totalMiles,
      days: this.route.days,
      dataMode: this.mode,
    };
    this.emit({ type: "plan", plan: this.plan });
    return { ok: true, stops: stops.length };
  }
}
