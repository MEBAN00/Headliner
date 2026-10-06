// Choosing the right Qloo entity for what the user typed. Qloo search is fuzzy: "Taylor Tomlinson"
// as an artist returns Taylor Swift first. We only accept a name that actually matches.

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/^the\s+/, "")
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]/g, "");

export function sameName(a: string, b: string): boolean {
  return norm(a) === norm(b);
}

export function bestMatch<T extends { name: string }>(query: string, results: T[]): T | undefined {
  return results.find((r) => sameName(r.name, query));
}

type Tagged = { tags?: Array<{ name?: string; type?: string }> };

/** Qloo tags stand-ups with a "Comedy" genre; listener counts say nothing about their draw. */
export function isComedian(entity: Tagged): boolean {
  return (entity.tags ?? []).some(
    (t) => /genre/.test(t.type ?? "") && /\b(comedy|stand-?up)\b/i.test(t.name ?? ""),
  );
}
