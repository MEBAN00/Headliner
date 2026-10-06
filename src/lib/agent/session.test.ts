import { describe, expect, it } from "vitest";
import { TourSession } from "./session";
import type { Market } from "../types";

const market = (id: string, demand: number): Market =>
  ({ id, name: id, region: "", lat: 0, lng: 0, demand, cells: 1 }) as Market;

const session = (startCity?: string, maxCities = 3) => {
  const s = new TourSession({ artist: "x", maxCities, startCity }, () => {}, "scripted");
  s.markets = [market("dal", 1), market("hou", 0.8), market("aus", 0.6)];
  return s;
};

describe("TourSession.planRoute start city", () => {
  it("starts in the requested city even when demand didn't pick it", () => {
    const route = session("Los Angeles").planRoute(["dal", "hou", "aus"]);
    expect(route.stops[0].marketId).toBe("la");
  });

  it("keeps the requested city count by dropping the weakest market", () => {
    const route = session("Los Angeles").planRoute(["dal", "hou", "aus"]);
    expect(route.stops.map((s) => s.marketId).sort()).toEqual(["dal", "hou", "la"]);
  });

  it("uses the requested city when it is already in the list", () => {
    const route = session("Houston").planRoute(["dal", "hou", "aus"]);
    expect(route.stops[0].marketId).toBe("hou");
    expect(route.stops).toHaveLength(3);
  });

  it("falls back to the westernmost city with no start city", () => {
    const route = session(undefined).planRoute(["dal", "hou", "aus"]);
    expect(route.stops[0].marketId).toBe("aus");
  });
});
