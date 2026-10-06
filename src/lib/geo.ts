import type { LatLng } from "./types";

const EARTH_RADIUS_MILES = 3958.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

export function haversineMiles(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Roads are longer than straight lines; 1.25 is a common rule of thumb for US interstates. */
export const ROAD_FACTOR = 1.25;

export const roadMiles = (a: LatLng, b: LatLng) => haversineMiles(a, b) * ROAD_FACTOR;
