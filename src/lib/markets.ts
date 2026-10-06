// Touring markets in North America. Heat cells are snapped to the nearest one.

import { haversineMiles } from "./geo";
import type { HeatCell, Market } from "./types";

type Metro = { id: string; name: string; region: string; lat: number; lng: number };

export const METROS: Metro[] = [
  { id: "sea", name: "Seattle", region: "Northwest", lat: 47.61, lng: -122.33 },
  { id: "pdx", name: "Portland", region: "Northwest", lat: 45.52, lng: -122.68 },
  { id: "van", name: "Vancouver", region: "Northwest", lat: 49.28, lng: -123.12 },
  { id: "sf", name: "San Francisco", region: "West Coast", lat: 37.77, lng: -122.42 },
  { id: "sac", name: "Sacramento", region: "West Coast", lat: 38.58, lng: -121.49 },
  { id: "la", name: "Los Angeles", region: "West Coast", lat: 34.05, lng: -118.24 },
  { id: "sd", name: "San Diego", region: "West Coast", lat: 32.72, lng: -117.16 },
  { id: "lv", name: "Las Vegas", region: "Southwest", lat: 36.17, lng: -115.14 },
  { id: "phx", name: "Phoenix", region: "Southwest", lat: 33.45, lng: -112.07 },
  { id: "slc", name: "Salt Lake City", region: "Mountain", lat: 40.76, lng: -111.89 },
  { id: "den", name: "Denver", region: "Mountain", lat: 39.74, lng: -104.99 },
  { id: "abq", name: "Albuquerque", region: "Southwest", lat: 35.08, lng: -106.65 },
  { id: "aus", name: "Austin", region: "Texas", lat: 30.27, lng: -97.74 },
  { id: "dal", name: "Dallas", region: "Texas", lat: 32.78, lng: -96.8 },
  { id: "hou", name: "Houston", region: "Texas", lat: 29.76, lng: -95.37 },
  { id: "sat", name: "San Antonio", region: "Texas", lat: 29.42, lng: -98.49 },
  { id: "okc", name: "Oklahoma City", region: "Plains", lat: 35.47, lng: -97.52 },
  { id: "kc", name: "Kansas City", region: "Plains", lat: 39.1, lng: -94.58 },
  { id: "msp", name: "Minneapolis", region: "Midwest", lat: 44.98, lng: -93.27 },
  { id: "stl", name: "St. Louis", region: "Midwest", lat: 38.63, lng: -90.2 },
  { id: "chi", name: "Chicago", region: "Midwest", lat: 41.88, lng: -87.63 },
  { id: "mil", name: "Milwaukee", region: "Midwest", lat: 43.04, lng: -87.91 },
  { id: "det", name: "Detroit", region: "Midwest", lat: 42.33, lng: -83.05 },
  { id: "cle", name: "Cleveland", region: "Midwest", lat: 41.5, lng: -81.69 },
  { id: "cbus", name: "Columbus", region: "Midwest", lat: 39.96, lng: -83.0 },
  { id: "ind", name: "Indianapolis", region: "Midwest", lat: 39.77, lng: -86.16 },
  { id: "nash", name: "Nashville", region: "South", lat: 36.16, lng: -86.78 },
  { id: "mem", name: "Memphis", region: "South", lat: 35.15, lng: -90.05 },
  { id: "nola", name: "New Orleans", region: "South", lat: 29.95, lng: -90.07 },
  { id: "atl", name: "Atlanta", region: "Southeast", lat: 33.75, lng: -84.39 },
  { id: "clt", name: "Charlotte", region: "Southeast", lat: 35.23, lng: -80.84 },
  { id: "rdu", name: "Raleigh", region: "Southeast", lat: 35.78, lng: -78.64 },
  { id: "orl", name: "Orlando", region: "Florida", lat: 28.54, lng: -81.38 },
  { id: "tpa", name: "Tampa", region: "Florida", lat: 27.95, lng: -82.46 },
  { id: "mia", name: "Miami", region: "Florida", lat: 25.76, lng: -80.19 },
  { id: "dc", name: "Washington", region: "Mid-Atlantic", lat: 38.9, lng: -77.04 },
  { id: "bal", name: "Baltimore", region: "Mid-Atlantic", lat: 39.29, lng: -76.61 },
  { id: "phl", name: "Philadelphia", region: "Northeast", lat: 39.95, lng: -75.17 },
  { id: "pit", name: "Pittsburgh", region: "Northeast", lat: 40.44, lng: -80.0 },
  { id: "nyc", name: "New York", region: "Northeast", lat: 40.71, lng: -74.01 },
  { id: "bos", name: "Boston", region: "Northeast", lat: 42.36, lng: -71.06 },
  { id: "tor", name: "Toronto", region: "Canada East", lat: 43.65, lng: -79.38 },
  { id: "mtl", name: "Montreal", region: "Canada East", lat: 45.5, lng: -73.57 },
];

export const metroById = (id: string) => METROS.find((m) => m.id === id);

export function metroByName(name: string): Metro | undefined {
  const q = name.trim().toLowerCase();
  return METROS.find((m) => m.name.toLowerCase() === q || m.id === q);
}

/** Cells further than this from any metro don't count toward a market. */
const SNAP_RADIUS_MILES = 75;

/**
 * Snaps heat cells to metros and scores each metro.
 * Score = mean affinity of its cells, weighted by popularity so dense fan areas count more.
 */
export function aggregateMarkets(cells: HeatCell[]): Market[] {
  const buckets = new Map<string, { weighted: number; weight: number; cells: number }>();

  for (const cell of cells) {
    let nearest: Metro | undefined;
    let nearestMiles = Infinity;
    for (const metro of METROS) {
      const d = haversineMiles(cell, metro);
      if (d < nearestMiles) {
        nearestMiles = d;
        nearest = metro;
      }
    }
    if (!nearest || nearestMiles > SNAP_RADIUS_MILES) continue;
    const weight = 0.25 + cell.popularity; // never let a cell count for nothing
    const b = buckets.get(nearest.id) ?? { weighted: 0, weight: 0, cells: 0 };
    b.weighted += cell.affinity * weight;
    b.weight += weight;
    b.cells += 1;
    buckets.set(nearest.id, b);
  }

  const raw = [...buckets.entries()].map(([id, b]) => ({ id, score: b.weighted / b.weight, cells: b.cells }));
  const max = Math.max(...raw.map((r) => r.score), 1e-9);

  return raw
    .map(({ id, score, cells }) => {
      const metro = metroById(id)!;
      return { ...metro, demand: Number((score / max).toFixed(3)), cells };
    })
    .sort((a, b) => b.demand - a.demand)
    .map((m, i) => ({ ...m, rank: i + 1 }));
}
