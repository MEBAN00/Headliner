// Venue lookup via the Ticketmaster Discovery API, with a mock fallback.
// Ticketmaster doesn't publish capacity, so venues are sized from their names (venueSize.ts) and
// anything that can't be sized is flagged rather than guessed.

import { cached } from "./cache";
import { metroById } from "./markets";
import { pick, rng } from "./seed";
import type { Venue, VenueTier } from "./types";
import { pickVenues } from "./venueSize";

export const venuesAreLive = () => Boolean(process.env.TICKETMASTER_API_KEY);

type TmVenue = {
  id: string;
  name: string;
  url?: string;
  address?: { line1?: string };
  city?: { name?: string };
};

export async function findVenues(marketId: string, tier: VenueTier, take = 3): Promise<Venue[]> {
  const metro = metroById(marketId);
  if (!metro) return [];
  if (!venuesAreLive()) return mockVenues(metro.id, metro.name, tier, take);

  const url = new URL("https://app.ticketmaster.com/discovery/v2/venues.json");
  url.searchParams.set("apikey", process.env.TICKETMASTER_API_KEY!);
  url.searchParams.set("latlong", `${metro.lat},${metro.lng}`);
  url.searchParams.set("radius", "20");
  url.searchParams.set("unit", "miles");
  url.searchParams.set("size", "50"); // wide net: relevance order puts arenas first
  url.searchParams.set("sort", "relevance,desc");

  const data = await cached(`tm:venues:v2:${metro.id}`, async () => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Ticketmaster venues → ${res.status}`);
    return (await res.json()) as { _embedded?: { venues?: TmVenue[] } };
  });

  return pickVenues(data._embedded?.venues ?? [], tier, take).map((v) => ({
    id: v.id,
    name: v.name,
    city: v.city?.name ?? metro.name,
    tier,
    size: v.size,
    sizeMatch: v.sizeMatch,
    address: v.address?.line1,
    url: v.url,
  }));
}

const ROOM_NAMES: Record<VenueTier, string[]> = {
  club: ["The Basement", "Lantern Room", "Echo Lounge", "The Parlor", "Night Owl"],
  theater: ["Majestic Theatre", "The Orpheum", "Union Hall", "Palace Theatre", "The Regent"],
  hall: ["Civic Auditorium", "Riverside Pavilion", "Municipal Hall", "The Armory", "Harbor Arena"],
};

function mockVenues(marketId: string, city: string, tier: VenueTier, take: number): Venue[] {
  const r = rng(`${marketId}:${tier}`);
  const names = new Set<string>();
  while (names.size < Math.min(take, ROOM_NAMES[tier].length)) names.add(pick(r, ROOM_NAMES[tier]));
  return [...names].map((name, i) => ({
    id: `mock:${marketId}:${tier}:${i}`,
    name,
    city,
    tier,
    size: tier,
    sizeMatch: "exact" as const,
  }));
}
