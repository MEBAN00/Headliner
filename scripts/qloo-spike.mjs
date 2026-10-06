// Day 1–2 data check: hit the real Qloo API for acts of different sizes and report
// (a) whether each endpoint Headliner needs works and (b) the exact response shapes,
// so the VERIFY spots in src/lib/qloo/client.ts can be confirmed or fixed.
//
// Run:  node --env-file=.env.local scripts/qloo-spike.mjs ["Act one" "Act two" ...]
// Raw responses are saved to .cache/spike/ (gitignored). The API key is never printed.

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const KEY = process.env.QLOO_API_KEY;
const BASE = process.env.QLOO_API_URL ?? "https://hackathon.api.qloo.com";
if (!KEY) {
  console.error("QLOO_API_KEY is missing. Add it to .env.local, then run with --env-file=.env.local");
  process.exit(1);
}

// Huge → small, plus a comedian (comedians may live under a different entity type).
const ACTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["Taylor Swift", "Khruangbin", "Fontaines D.C.", "MJ Lenderman", "Hasan Minhaj"];

const OUT = path.join(process.cwd(), ".cache", "spike");
await mkdir(OUT, { recursive: true });

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-");

async function get(label, pathname, params) {
  const url = new URL(pathname, BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const t0 = Date.now();
  // This network resolves Qloo's hosts slowly; retry connection failures (not HTTP errors).
  let res;
  for (let attempt = 1; ; attempt++) {
    try {
      res = await fetch(url, { headers: { "X-Api-Key": KEY, accept: "application/json" }, signal: AbortSignal.timeout(45_000) });
      break;
    } catch (err) {
      if (attempt >= 4) return { ok: false, label, error: `network: ${err.cause?.code ?? err.message} after ${attempt} tries` };
      await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  const ms = Date.now() - t0;
  const text = await res.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  await writeFile(path.join(OUT, `${slug(label)}.json`), JSON.stringify({ url: url.pathname + url.search, status: res.status, body }, null, 2));
  return { ok: res.ok, status: res.status, ms, body, label };
}

/** Prints the key structure of the first item so we can see real field paths. */
const describe = (r) =>
  r.error ?? `HTTP ${r.status} ${(typeof r.body === "string" ? r.body : JSON.stringify(r.body) ?? "").slice(0, 240)}`;

function shape(value, depth = 0) {
  if (depth > 3) return "…";
  if (Array.isArray(value)) return value.length ? [shape(value[0], depth + 1)] : [];
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).slice(0, 14).map(([k, v]) => [k, shape(v, depth + 1)]));
  }
  return typeof value;
}

const inNorthAmerica = (lat, lng) => lat > 24 && lat < 56 && lng > -130 && lng < -60;
const shapesShown = new Set();
const showShape = (name, sample) => {
  if (shapesShown.has(name) || sample === undefined) return;
  shapesShown.add(name);
  console.log(`\n  ┌ shape of ${name}:\n` + JSON.stringify(shape(sample), null, 2).replace(/^/gm, "  │ "));
};

const summary = [];

for (const act of ACTS) {
  console.log(`\n━━━ ${act} ━━━`);
  const row = { act };

  // 1. Search — try artist first, then person (comedians).
  let hit;
  for (const type of ["urn:entity:artist", "urn:entity:person"]) {
    const r = await get(`${act} search ${type.split(":").pop()}`, "/search", { query: act, types: type, take: 3 });
    if (!r.ok) {
      console.log(`  search (${type}): ${describe(r)}`);
      continue;
    }
    const results = r.body.results ?? r.body.entities ?? [];
    showShape("search result", results[0]);
    if (results[0]) {
      hit = { ...results[0], _type: type };
      break;
    }
  }
  if (!hit) {
    console.log("  ✗ not found");
    summary.push({ ...row, found: "no" });
    continue;
  }
  const id = hit.entity_id ?? hit.id;
  row.found = `${hit.name} (${hit._type.split(":").pop()})`;
  console.log(`  ✓ found: ${hit.name} · id ${id} · popularity ${hit.popularity ?? "?"}`);

  // 2. Heatmap — the core of Headliner.
  const heat = await get(`${act} heatmap`, "/v2/insights", {
    "filter.type": "urn:heatmap",
    "signal.interests.entities": id,
    "filter.location.query": "United States",
    take: 500,
  });
  if (heat.ok) {
    const cells = heat.body.results?.heatmap ?? [];
    showShape("heatmap cell", cells[0]);
    const na = cells.filter((c) => inNorthAmerica(c.location?.latitude, c.location?.longitude));
    const top = [...na].sort((a, b) => (b.query?.affinity ?? 0) - (a.query?.affinity ?? 0)).slice(0, 5);
    row.heatCells = cells.length;
    row.naCells = na.length;
    console.log(`  heatmap: ${cells.length} cells (${na.length} in North America) · ${heat.ms}ms`);
    for (const c of top) {
      console.log(`    hot: ${c.location?.latitude?.toFixed(2)}, ${c.location?.longitude?.toFixed(2)} · affinity ${c.query?.affinity} · popularity ${c.query?.popularity}`);
    }
  } else {
    row.heatCells = heat.error ? "network" : `HTTP ${heat.status}`;
    console.log(`  heatmap: ${describe(heat)}`);
  }

  // 3. Similar artists — opener candidates.
  const sim = await get(`${act} similar`, "/v2/insights", {
    "filter.type": "urn:entity:artist",
    "signal.interests.entities": id,
    take: 8,
  });
  if (sim.ok) {
    const ents = sim.body.results?.entities ?? [];
    showShape("similar entity", ents[0]);
    row.similar = ents.length;
    console.log(`  similar: ${ents.map((e) => `${e.name} (${e.query?.affinity?.toFixed?.(2) ?? "?"})`).join(", ") || "none"}`);
  } else {
    row.similar = sim.error ? "network" : `HTTP ${sim.status}`;
    console.log(`  similar: ${describe(sim)}`);
  }

  // 4. Demographics.
  const demo = await get(`${act} demographics`, "/v2/insights", {
    "filter.type": "urn:demographics",
    "signal.interests.entities": id,
  });
  if (demo.ok) {
    const d = demo.body.results?.demographics?.[0];
    showShape("demographics item", d);
    row.demographics = d ? "yes" : "empty";
    console.log(`  demographics: ${JSON.stringify(d?.query ?? d ?? null).slice(0, 300)}`);
  } else {
    row.demographics = demo.error ? "network" : `HTTP ${demo.status}`;
    console.log(`  demographics: ${describe(demo)}`);
  }

  // 5. Local taste tags in one city.
  const tags = await get(`${act} tags chicago`, "/v2/insights", {
    "filter.type": "urn:tag",
    "signal.interests.entities": id,
    "signal.location.query": "Chicago",
    take: 6,
  });
  if (tags.ok) {
    const list = tags.body.results?.tags ?? tags.body.results?.entities ?? [];
    showShape("tag", list[0]);
    row.tags = list.length;
    console.log(`  tags (Chicago): ${list.map((t) => t.name).join(", ") || "none"}`);
  } else {
    row.tags = tags.error ? "network" : `HTTP ${tags.status}`;
    console.log(`  tags: ${describe(tags)}`);
  }

  summary.push(row);
}

console.log("\n━━━ Summary ━━━");
console.table(summary);
console.log(`Raw responses: ${path.relative(process.cwd(), OUT)}/`);
