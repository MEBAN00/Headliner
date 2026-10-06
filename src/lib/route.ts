// Deterministic tour routing. The agent picks *which* markets; this decides the *order*.
// Keeping it out of the LLM means distances and days are never invented.

import { roadMiles } from "./geo";
import type { LatLng, Route, RouteStop } from "./types";

export type RoutablePoint = LatLng & { id: string; name: string };

/** Longest comfortable drive between consecutive shows, in road miles. */
const SAME_NEXT_DAY_MILES = 350;
const ONE_TRAVEL_DAY_MILES = 700;
/** A day off after this many shows in a row. */
const SHOWS_BEFORE_DAY_OFF = 5;

function pathMiles(order: RoutablePoint[]): number {
  let total = 0;
  for (let i = 1; i < order.length; i++) total += roadMiles(order[i - 1], order[i]);
  return total;
}

function nearestNeighbor(points: RoutablePoint[], start: RoutablePoint): RoutablePoint[] {
  const remaining = points.filter((p) => p.id !== start.id);
  const order = [start];
  while (remaining.length) {
    const last = order[order.length - 1];
    let best = 0;
    for (let i = 1; i < remaining.length; i++) {
      if (roadMiles(last, remaining[i]) < roadMiles(last, remaining[best])) best = i;
    }
    order.push(remaining.splice(best, 1)[0]);
  }
  return order;
}

/** 2-opt on an open path with a fixed first stop. */
function twoOpt(order: RoutablePoint[]): RoutablePoint[] {
  let route = order.slice();
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 1; i++) {
      for (let k = i + 1; k < route.length; k++) {
        const candidate = [...route.slice(0, i), ...route.slice(i, k + 1).reverse(), ...route.slice(k + 1)];
        if (pathMiles(candidate) + 1e-6 < pathMiles(route)) {
          route = candidate;
          improved = true;
        }
      }
    }
  }
  return route;
}

function travelDays(miles: number): number {
  if (miles <= SAME_NEXT_DAY_MILES) return 1;
  if (miles <= ONE_TRAVEL_DAY_MILES) return 2;
  return 3;
}

/**
 * Orders markets into a drivable run and assigns show days.
 * Starts at `startId` if given, otherwise at the westernmost market.
 */
export function planRoute(points: RoutablePoint[], startId?: string): Route {
  if (points.length === 0) return { stops: [], totalMiles: 0, days: 0 };

  const start =
    points.find((p) => p.id === startId) ?? points.reduce((west, p) => (p.lng < west.lng ? p : west));
  const order = twoOpt(nearestNeighbor(points, start));

  const stops: RouteStop[] = [];
  let day = 1;
  let streak = 0;
  order.forEach((p, i) => {
    const legMiles = i === 0 ? 0 : roadMiles(order[i - 1], p);
    if (i > 0) {
      day += travelDays(legMiles);
      if (streak >= SHOWS_BEFORE_DAY_OFF) {
        day += 1;
        streak = 0;
      }
    }
    streak += 1;
    stops.push({ marketId: p.id, name: p.name, lat: p.lat, lng: p.lng, legMiles: Math.round(legMiles), day });
  });

  return {
    stops,
    totalMiles: Math.round(stops.reduce((sum, s) => sum + s.legMiles, 0)),
    days: day,
  };
}
