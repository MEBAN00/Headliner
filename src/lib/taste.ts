// Qloo's location-scoped tags are dominated by the act's own taste, so the same tags
// ("Live music bar", "Art gallery") come back for nearly every city. For a marketing angle
// we want what makes *this* city's fans different, so tags shared by most routed cities are dropped.

const key = (tag: string) => tag.toLowerCase().replace(/[^a-z0-9]/g, "");

export function distinctiveTags(byCity: Map<string, string[]>, keep = 4): Map<string, string[]> {
  const cities = byCity.size;
  const counts = new Map<string, number>();
  for (const tags of byCity.values()) {
    for (const k of new Set(tags.map(key))) counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  // With few cities every tag looks common; only filter once there's a pattern to see.
  const commonAt = Math.max(3, Math.ceil(cities * 0.4));
  const isCommon = (tag: string) => cities >= 3 && (counts.get(key(tag)) ?? 0) >= commonAt;

  const out = new Map<string, string[]>();
  for (const [city, tags] of byCity) {
    const distinct = tags.filter((t) => !isCommon(t));
    // Backfill with the rarest common tags so a city never ends up empty.
    const backfill = tags
      .filter(isCommon)
      .sort((a, b) => (counts.get(key(a)) ?? 0) - (counts.get(key(b)) ?? 0));
    out.set(city, [...distinct, ...backfill].slice(0, keep));
  }
  return out;
}
