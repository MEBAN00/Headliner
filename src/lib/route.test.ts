import { describe, expect, it } from "vitest";
import { planRoute, type RoutablePoint } from "./route";

const city = (id: string, lat: number, lng: number): RoutablePoint => ({ id, name: id, lat, lng });

const LA = city("la", 34.05, -118.24);
const PHX = city("phx", 33.45, -112.07);
const DAL = city("dal", 32.78, -96.8);
const ATL = city("atl", 33.75, -84.39);
const NYC = city("nyc", 40.71, -74.01);

describe("planRoute", () => {
  it("returns an empty route for no points", () => {
    expect(planRoute([])).toEqual({ stops: [], totalMiles: 0, days: 0 });
  });

  it("starts in the west by default and sweeps east without backtracking", () => {
    const route = planRoute([NYC, DAL, LA, ATL, PHX]);
    expect(route.stops.map((s) => s.marketId)).toEqual(["la", "phx", "dal", "atl", "nyc"]);
  });

  it("honours an explicit start city", () => {
    const route = planRoute([NYC, DAL, LA, ATL, PHX], "nyc");
    expect(route.stops[0].marketId).toBe("nyc");
    expect(route.stops.at(-1)!.marketId).toBe("la");
  });

  it("adds travel days for long legs", () => {
    const route = planRoute([LA, NYC]);
    expect(route.stops[1].legMiles).toBeGreaterThan(2400);
    expect(route.stops[1].day).toBe(4); // show day 1, then 3 days to cross the country
  });

  it("gives the first stop zero leg miles and totals the rest", () => {
    const route = planRoute([LA, PHX, DAL]);
    expect(route.stops[0].legMiles).toBe(0);
    expect(route.totalMiles).toBe(route.stops.reduce((s, x) => s + x.legMiles, 0));
  });
});
