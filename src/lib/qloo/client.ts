// Qloo Insights API client. Every call is cached; every call has a mock fallback.
//
// Field paths verified against the hackathon API on 2026-10-06 (scripts/qloo-spike.mjs).
// Parsing stays tolerant anyway: a missing field degrades a score, it doesn't crash a run.

import { cached } from "../cache";
import { COMEDIAN_SCALE, scaleFromListeners } from "../tiers";
import { bestMatch, isComedian } from "./match";
import type { ActScale, Artist, AudienceProfile, HeatCell } from "../types";
import * as mock from "./mock";

const BASE_URL = process.env.QLOO_API_URL ?? "https://hackathon.api.qloo.com";

export const qlooIsLive = () => Boolean(process.env.QLOO_API_KEY);

type Params = Record<string, string | number | undefined>;
// Untyped API payloads; narrowed field by field below.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = Record<string, any>;

async function qget<T = unknown>(path: string, params: Params): Promise<T> {
  const url = new URL(path, BASE_URL);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v));

  return cached(`qloo:${url.pathname}${url.search}`, async () => {
    // Bounded retries: connection failures (slow DNS is common on some networks), 429 and 5xx.
    for (let attempt = 1; ; attempt++) {
      let res: Response | undefined;
      try {
        res = await fetch(url, {
          headers: { "X-Api-Key": process.env.QLOO_API_KEY!, accept: "application/json" },
          signal: AbortSignal.timeout(45_000),
        });
      } catch (err) {
        if (attempt >= MAX_ATTEMPTS) throw new Error(`Qloo ${url.pathname} unreachable: ${(err as Error).message}`);
      }
      if (res?.ok) return (await res.json()) as T;
      if (res && res.status !== 429 && res.status < 500) {
        throw new Error(`Qloo ${url.pathname} → ${res.status} ${await res.text().catch(() => "")}`);
      }
      if (attempt >= MAX_ATTEMPTS) throw new Error(`Qloo ${url.pathname} → ${res?.status ?? "no response"}`);
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  });
}

const MAX_ATTEMPTS = 4;

const num = (v: unknown, fallback = 0) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

// ---------- search ----------

export type SearchResult = { artist?: Artist; suggestions: string[] };

/**
 * Finds the act the user typed — by exact name, never the top fuzzy hit ("Taylor Tomlinson" as an
 * artist returns Taylor Swift first). Most comedians are artist entities; some only exist as people.
 */
export async function searchArtist(name: string): Promise<SearchResult> {
  if (!qlooIsLive()) return { artist: mock.mockArtist(name), suggestions: [] };

  const suggestions: string[] = [];
  for (const type of ["urn:entity:artist", "urn:entity:person"]) {
    const data = await qget<{ results?: Array<Json> }>("/search", { query: name, types: type, take: 5 });
    const results = (data.results ?? []).filter((r) => typeof r.name === "string");
    const hit = bestMatch(name, results as Array<Json & { name: string }>);
    if (hit) {
      return {
        artist: {
          id: hit.entity_id ?? hit.id,
          name: hit.name,
          popularity: typeof hit.popularity === "number" ? hit.popularity : undefined,
          image: hit.properties?.image?.url,
          comedian: isComedian({ tags: hit.tags }) || type === "urn:entity:person",
        },
        suggestions: [],
      };
    }
    for (const r of results) if (!suggestions.includes(r.name)) suggestions.push(r.name);
  }
  return { suggestions: suggestions.slice(0, 4) };
}

// ---------- act scale ----------

export async function artistScale(artist: Artist): Promise<ActScale> {
  if (artist.comedian) return COMEDIAN_SCALE;
  const artistId = artist.id;
  if (!qlooIsLive()) return scaleFromListeners(mock.mockListeners(artistId));

  // Search and /entities omit external stats; insights with filter.results.entities includes them.
  // Last.fm listeners, not Spotify: Qloo's Spotify snapshot is years old (MJ Lenderman shows 531).
  const data = await qget<{ results?: { entities?: Array<Json> } }>("/v2/insights", {
    "filter.type": "urn:entity:artist",
    "filter.results.entities": artistId,
    take: 1,
  });
  const entity = data.results?.entities?.find((e) => (e.entity_id ?? e.id) === artistId);
  const listeners = Number(entity?.external?.lastfm?.[0]?.listeners);
  return scaleFromListeners(Number.isFinite(listeners) ? listeners : undefined);
}

// ---------- heatmap ----------

export async function heatmap(artistId: string): Promise<HeatCell[]> {
  if (!qlooIsLive()) return mock.mockHeatmap(artistId);

  // A region is required. "United States" returns ~4–5k geohash-4 cells (also covering
  // Canadian border metros); `take` doesn't apply to heatmaps.
  const data = await qget<{ results?: { heatmap?: Array<Json> } }>("/v2/insights", {
    "filter.type": "urn:heatmap",
    "signal.interests.entities": artistId,
    "filter.location.query": "United States",
  });
  return (data.results?.heatmap ?? []).map((cell) => ({
    lat: num(cell.location?.latitude),
    lng: num(cell.location?.longitude),
    affinity: num(cell.query?.affinity),
    popularity: num(cell.query?.popularity),
    rank: num(cell.query?.affinity_rank),
  }));
}

// ---------- similar artists (opener candidates) ----------

export async function similarArtists(artistId: string, take = 12): Promise<(Artist & { affinity: number })[]> {
  if (!qlooIsLive()) return mock.mockSimilarArtists(artistId, take);

  const data = await qget<{ results?: { entities?: Array<Json> } }>("/v2/insights", {
    "filter.type": "urn:entity:artist",
    "signal.interests.entities": artistId,
    take,
  });
  return (data.results?.entities ?? [])
    .filter((e) => (e.entity_id ?? e.id) !== artistId)
    .map((e) => ({
      id: e.entity_id ?? e.id,
      name: e.name,
      popularity: num(e.popularity),
      affinity: num(e.query?.affinity),
    }));
}

// ---------- audience demographics ----------

const AGE_LABELS: Record<string, string> = {
  "24_and_younger": "under 25",
  "25_to_29": "25–29",
  "30_to_34": "30–34",
  "35_to_44": "35–44",
  "45_to_54": "45–54",
  "55_and_older": "55+",
};

export async function audience(artistId: string): Promise<AudienceProfile> {
  if (!qlooIsLive()) return mock.mockAudience(artistId);

  // results.demographics[0].query.{age,gender}: over/under-index scores in -1..1.
  const data = await qget<{ results?: { demographics?: Array<Json> } }>("/v2/insights", {
    "filter.type": "urn:demographics",
    "signal.interests.entities": artistId,
  });
  const q = data.results?.demographics?.[0]?.query ?? {};
  const topAge = Object.entries((q.age ?? {}) as Record<string, number>).sort((a, b) => b[1] - a[1])[0];
  const g = (q.gender ?? {}) as Record<string, number>;
  const genderGap = num(g.female) - num(g.male);
  return {
    ageSkew: topAge ? `${AGE_LABELS[topAge[0]] ?? topAge[0]} over-indexes` : "no clear age skew",
    genderSkew: Math.abs(genderGap) < 0.1 ? "even split" : genderGap > 0 ? "leans female" : "leans male",
  };
}

// ---------- local taste (what this act's fans in a city are into) ----------

export async function localTaste(artistId: string, city: string): Promise<string[]> {
  if (!qlooIsLive()) return mock.mockLocalTaste(artistId, city);

  // Music genres only. Unfiltered, city tags are mostly places and book genres ("Hotel", "Brunch",
  // "Audiobook"); genres ("Neo Soul", "Dirty South") are something a promoter can act on.
  const data = await qget<{ results?: { tags?: Array<Json> } }>("/v2/insights", {
    "filter.type": "urn:tag",
    "filter.tag.types": "urn:tag:genre:music",
    "signal.interests.entities": artistId,
    "signal.location.query": city,
    take: 12,
  });
  const seen = new Set<string>();
  const cityKey = city.toLowerCase().replace(/[^a-z0-9]/g, "");
  return (data.results?.tags ?? [])
    .map((t) => normalizeTag(t.name))
    .filter((name) => {
      const key = name.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (!key || key === cityKey || seen.has(key)) return false;
      seen.add(key);
      return true;
    }); // the session keeps the ones distinctive to this city
}

/** Qloo tag names carry stray spacing ("Alt- country", " post-punk", "instrumental  hip hop"). */
const normalizeTag = (name: unknown) =>
  String(name ?? "").replace(/\s*-\s*/g, "-").replace(/\s+/g, " ").trim();
