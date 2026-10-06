// Deterministic stand-ins for Qloo responses, shaped like the parsed live data.
// Used whenever QLOO_API_KEY is missing so the whole app runs end to end.

import { METROS } from "../markets";
import { pick, rng } from "../seed";
import type { Artist, AudienceProfile, HeatCell } from "../types";

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

export function mockArtist(name: string): Artist {
  const r = rng(name);
  return { id: `mock:${slug(name)}`, name: name.trim(), popularity: 0.55 + r() * 0.4 };
}

/** Last.fm-style all-time listeners, spread across club, theater and hall-sized acts. */
export function mockListeners(artistId: string): number {
  const r = rng(`${artistId}:listeners`);
  return Math.round(40_000 + r() * r() * 1_400_000);
}

/** Clusters of fan density around a seeded handful of metros, plus a faint national floor. */
export function mockHeatmap(artistId: string): HeatCell[] {
  const r = rng(artistId);
  const strongholds = new Set<string>();
  while (strongholds.size < 7) strongholds.add(pick(r, METROS).id);

  const cells: HeatCell[] = [];
  for (const metro of METROS) {
    const strong = strongholds.has(metro.id);
    const base = strong ? 0.6 + r() * 0.4 : 0.08 + r() * 0.35;
    const count = strong ? 14 : 5;
    for (let i = 0; i < count; i++) {
      const spread = strong ? 0.55 : 0.4;
      const affinity = Math.max(0, Math.min(1, base * (0.7 + r() * 0.3)));
      cells.push({
        lat: metro.lat + (r() - 0.5) * spread,
        lng: metro.lng + (r() - 0.5) * spread * 1.3,
        affinity,
        popularity: Math.min(1, affinity * (0.6 + r() * 0.5)),
        rank: affinity,
      });
    }
  }
  return cells;
}

const MOCK_ACT_WORDS = [
  ["Velvet", "Paper", "Static", "Golden", "Midnight", "Copper", "Neon", "Quiet", "Wild", "Sunday"],
  ["Lungs", "Harbor", "Saints", "Motel", "Ghosts", "Parade", "Tapes", "Signals", "Club", "Weather"],
];

export function mockSimilarArtists(artistId: string, take: number): (Artist & { affinity: number })[] {
  const r = rng(`${artistId}:similar`);
  const seen = new Set<string>();
  const out: (Artist & { affinity: number })[] = [];
  while (out.length < take) {
    const name = `${pick(r, MOCK_ACT_WORDS[0])} ${pick(r, MOCK_ACT_WORDS[1])}`;
    if (seen.has(name)) continue;
    seen.add(name);
    out.push({ ...mockArtist(name), affinity: Number((0.95 - out.length * 0.05 - r() * 0.04).toFixed(3)) });
  }
  return out;
}

export function mockAudience(artistId: string): AudienceProfile {
  const r = rng(`${artistId}:aud`);
  return {
    ageSkew: pick(r, ["18–24 heavy", "25–29 core", "30–34 leaning", "broad 18–34"]),
    genderSkew: pick(r, ["even split", "leans female", "leans male"]),
  };
}

const TAG_POOL = [
  "indie rock", "neo soul", "post-punk", "shoegaze", "alt-country", "house", "drill", "afrobeats",
  "dream pop", "jazz fusion", "emo", "hyperpop", "Americana", "psychedelic", "trip-hop", "techno",
  "bluegrass", "R&B", "garage rock", "ambient",
];

export function mockLocalTaste(artistId: string, city: string): string[] {
  const r = rng(`${artistId}:${city}`);
  const tags = new Set<string>();
  while (tags.size < 4) tags.add(pick(r, TAG_POOL));
  return [...tags];
}
