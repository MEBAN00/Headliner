// Ticketmaster doesn't publish capacity, so venue size is read from the name.
// It's a heuristic: matches are trusted, everything else is "unknown" and labelled as unverified.

import type { VenueTier } from "./types";

export type VenueSize = VenueTier | "arena" | "unknown";

// Order matters: the first rule that matches wins ("Boch Center Wang Theatre" is a theater, not a center).
const RULES: [VenueSize, RegExp][] = [
  ["theater", /\b(theat(re|er)|ballroom|opera house|playhouse|fillmore|house of blues|paramount|showbox)\b/i],
  ["club", /\b(club|bar|lounge|room|caf[eé]|tavern|pub|saloon|cellar|basement|hi-?fi|bowl)\b/i],
  ["arena", /\b(stadium|arena|garden|park|field|coliseum|dome|amphithea(tre|ter)|pavilion|speedway|fairgrounds?|centre bell)\b/i],
  ["hall", /\b(music hall|auditorium|civic|salle|hall)\b/i],
];

export function classifyVenue(name: string): VenueSize {
  for (const [size, pattern] of RULES) if (pattern.test(name)) return size;
  return "unknown";
}

const ORDER: VenueTier[] = ["club", "theater", "hall"];

export type SizeMatch = "exact" | "unverified" | "closest";

/**
 * Picks venues for a target room size: exact matches first, then venues of unknown size (flagged),
 * then the nearest size. Arenas and stadiums are never offered.
 */
export function pickVenues<T extends { name: string }>(
  venues: T[],
  tier: VenueTier,
  take: number,
): (T & { size: VenueSize; sizeMatch: SizeMatch })[] {
  const sized = venues.map((v) => ({ ...v, size: classifyVenue(v.name) }));
  const exact = sized.filter((v) => v.size === tier).map((v) => ({ ...v, sizeMatch: "exact" as const }));
  const unknown = sized.filter((v) => v.size === "unknown").map((v) => ({ ...v, sizeMatch: "unverified" as const }));
  const target = ORDER.indexOf(tier);
  const closest = sized
    .filter((v) => v.size !== "arena" && v.size !== "unknown" && v.size !== tier)
    .filter((v) => Math.abs(ORDER.indexOf(v.size as VenueTier) - target) === 1)
    .map((v) => ({ ...v, sizeMatch: "closest" as const }));
  return [...exact, ...unknown, ...closest].slice(0, take);
}
