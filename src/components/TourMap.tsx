"use client";

import type { Feature, FeatureCollection } from "geojson";
import * as maplibregl from "maplibre-gl";
import type { GeoJSONSource, Map as MLMap } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useEffect, useRef, useState } from "react";
import type { HeatCell, Route } from "@/lib/types";

// MapLibre paint needs sRGB; these mirror the oklch tokens in globals.css.
const PAPER = "#f2ebdc";
const WATER = "#e2d6bf";
const INK = "#251e18";
const ROAD = "#dccfb6";
const BUILDING = "#e8dcc4";
const HOT = "#e0502a";

/** Where the map flies when a stop is opened: the venue if we know where it is, else the city. */
export type MapFocus = { id: string; lat: number; lng: number; exact: boolean };

const STYLE_URL = "https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json";
// Served from /public by scripts/copy-maplibre-worker.mjs (the bundled default URL breaks).
const WORKER_PATH = "/vendor/maplibre/maplibre-gl-worker.mjs";
const NORTH_AMERICA: [[number, number], [number, number]] = [[-126, 24], [-66, 50]];

type Props = {
  cells: HeatCell[];
  route?: Route;
  activeMarketId?: string;
  focus?: MapFocus;
  onSelectStop?: (marketId: string) => void;
};

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Strip the basemap down to a printed look: paper land, toned water, faint borders, no labels.
 * Roads stay invisible at tour scale and fade in only when a stop is opened up close.
 */
function inkTheBasemap(map: MLMap) {
  for (const layer of map.getStyle().layers ?? []) {
    const { id, type } = layer;
    try {
      if (type === "background") map.setPaintProperty(id, "background-color", PAPER);
      else if (type === "fill" && /water/.test(id)) map.setPaintProperty(id, "fill-color", WATER);
      else if (type === "line" && /boundary|admin/.test(id)) {
        map.setPaintProperty(id, "line-color", INK);
        map.setPaintProperty(id, "line-opacity", /country/.test(id) ? 0.45 : 0.18);
      } else if (type === "line" && /road|highway|tunnel|bridge|street|path|rail/.test(id)) {
        map.setPaintProperty(id, "line-color", ROAD);
        map.setPaintProperty(id, "line-opacity", ["interpolate", ["linear"], ["zoom"], 11, 0, 13.5, 0.85]);
      } else map.setLayoutProperty(id, "visibility", "none");
    } catch {
      // layer without that property — leave it
    }
  }
}

/** Rough centre of a footprint, for picking the building nearest the venue's coordinates. */
function centroid(geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon): [number, number] {
  const ring = geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.coordinates[0][0];
  const [x, y] = ring.reduce(([sx, sy], [px, py]) => [sx + px, sy + py], [0, 0]);
  return [x / ring.length, y / ring.length];
}

/** OpenStreetMap building footprints from the same tiles, extruded by their height up close. */
function addBuildings(map: MLMap, beforeId: string) {
  map.addLayer(
    {
      id: "buildings-3d",
      type: "fill-extrusion",
      source: "carto",
      "source-layer": "building",
      minzoom: 14,
      filter: ["!=", ["get", "hide_3d"], true],
      paint: {
        "fill-extrusion-color": BUILDING,
        "fill-extrusion-height": ["interpolate", ["linear"], ["zoom"], 14, 0, 15.5, ["coalesce", ["get", "render_height"], 8]],
        "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
        "fill-extrusion-opacity": 0.92,
        "fill-extrusion-vertical-gradient": true,
      },
    },
    beforeId,
  );
}

function heatGeoJSON(cells: HeatCell[]): FeatureCollection {
  return {
    type: "FeatureCollection",
    features: cells.map((c) => ({
      type: "Feature",
      // Weighted by popularity so sparse rural cells (often affinity 1 on almost no data) stay faint.
      properties: { w: c.affinity * c.popularity ** 1.5 },
      geometry: { type: "Point", coordinates: [c.lng, c.lat] },
    })),
  };
}

const lineGeoJSON = (coords: [number, number][]): Feature => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: coords },
});

export default function TourMap({ cells, route, activeMarketId, focus, onSelectStop }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MLMap | null>(null);
  const markersRef = useRef<Map<string, { marker: maplibregl.Marker; el: HTMLButtonElement }>>(new Map());
  const onSelectRef = useRef(onSelectStop);
  const venueMarkerRef = useRef<maplibregl.Marker | null>(null);
  const wasFocusedRef = useRef(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    onSelectRef.current = onSelectStop;
  }, [onSelectStop]);

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current) return;
    maplibregl.setWorkerUrl(new URL(WORKER_PATH, window.location.origin).href);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: STYLE_URL,
      bounds: NORTH_AMERICA,
      fitBoundsOptions: { padding: 24 },
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.touchZoomRotate.disableRotation();
    mapRef.current = map;

    map.on("load", () => {
      inkTheBasemap(map);
      map.addSource("heat", { type: "geojson", data: heatGeoJSON([]) });
      map.addLayer({
        id: "heat",
        type: "heatmap",
        source: "heat",
        paint: {
          "heatmap-weight": ["get", "w"],
          "heatmap-intensity": ["interpolate", ["linear"], ["zoom"], 2, 0.9, 7, 2.2],
          // Qloo cells are geohash-4 (~0.35° × 0.18°). Doubling the radius per zoom level keeps it ~2.5
          // cells wide at every zoom, so neighbouring columns blend instead of showing as stripes.
          "heatmap-radius": ["interpolate", ["exponential", 2], ["zoom"], 3, 5, 9, 320],
          // Fans per city, not per block: the heat fades out as you zoom into a venue.
          "heatmap-opacity": ["interpolate", ["linear"], ["zoom"], 9, 0.88, 12, 0],
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0, "rgba(242,235,220,0)",
            0.2, "rgba(236,170,120,0.35)",
            0.45, "rgba(226,110,62,0.65)",
            0.7, "#e0502a",
            1, "#8f2a12",
          ],
        },
      });
      map.addSource("route", { type: "geojson", data: lineGeoJSON([]) });
      map.addLayer({
        id: "route-casing",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": PAPER, "line-width": 7, "line-opacity": 0.85 },
      });
      map.addLayer({
        id: "route",
        type: "line",
        source: "route",
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": INK, "line-width": 2.5 },
      });
      addBuildings(map, "heat");
      map.addSource("venue-building", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer(
        {
          id: "venue-building",
          type: "fill-extrusion",
          source: "venue-building",
          paint: {
            "fill-extrusion-color": HOT,
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], 12],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], 0],
            "fill-extrusion-opacity": 0.95,
          },
        },
        "heat",
      );
      setReady(true);
    });

    const markers = markersRef.current;
    return () => {
      markers.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Heat cells.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource("heat") as GeoJSONSource).setData(heatGeoJSON(cells));
    // Live heatmaps have ~10x the cells of mock ones; scale intensity so dense data doesn't saturate.
    const k = Math.min(1, Math.sqrt(400 / Math.max(cells.length, 1)));
    map.setPaintProperty("heat", "heatmap-intensity", ["interpolate", ["linear"], ["zoom"], 2, 2.2 * k, 7, 5 * k]);
  }, [cells, ready]);

  // Route: fit, then draw the line leg by leg and drop each pin as the line arrives.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const source = map.getSource("route") as GeoJSONSource;

    for (const { marker } of markersRef.current.values()) marker.remove();
    markersRef.current.clear();
    source.setData(lineGeoJSON([]));
    if (!route?.stops.length) return;

    const stops = route.stops;
    const reduced = prefersReducedMotion();

    const bounds = new maplibregl.LngLatBounds();
    stops.forEach((s) => bounds.extend([s.lng, s.lat]));
    map.fitBounds(bounds, { padding: { top: 70, bottom: 70, left: 60, right: 60 }, maxZoom: 6, duration: reduced ? 0 : 900 });

    const pins = stops.map((s, i) => {
      const el = document.createElement("button");
      el.type = "button";
      el.className = "stop-pin";
      el.textContent = String(i + 1).padStart(2, "0");
      el.setAttribute("aria-label", `Stop ${i + 1}: ${s.name}, day ${s.day}`);
      el.addEventListener("click", () => onSelectRef.current?.(s.marketId));
      // MapLibre owns the anchor's inline transform; the pin animates inside it.
      const anchor = document.createElement("div");
      anchor.appendChild(el);
      const marker = new maplibregl.Marker({ element: anchor }).setLngLat([s.lng, s.lat]).addTo(map);
      markersRef.current.set(s.marketId, { marker, el });
      return el;
    });

    const coords = stops.map((s) => [s.lng, s.lat] as [number, number]);
    if (reduced) {
      source.setData(lineGeoJSON(coords));
      pins.forEach((p) => (p.dataset.shown = "true"));
      return;
    }

    // Constant-speed draw: duration scales with the number of legs, not distance, so long runs stay snappy.
    const LEG_MS = 260;
    const DELAY_MS = 700; // let the fit settle first
    pins[0].dataset.shown = "true";
    let frame = 0;
    const t0 = performance.now() + DELAY_MS;
    const tick = (now: number) => {
      const legsDone = Math.max(0, (now - t0) / LEG_MS);
      const whole = Math.min(Math.floor(legsDone), coords.length - 1);
      const partial = legsDone - whole;
      const drawn = coords.slice(0, whole + 1);
      if (whole < coords.length - 1) {
        const [a, b] = [coords[whole], coords[whole + 1]];
        drawn.push([a[0] + (b[0] - a[0]) * partial, a[1] + (b[1] - a[1]) * partial]);
      }
      source.setData(lineGeoJSON(drawn));
      for (let i = 0; i <= whole; i++) pins[i].dataset.shown = "true";
      if (whole < coords.length - 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [route, ready]);

  // Active stop highlight.
  useEffect(() => {
    for (const [id, { el }] of markersRef.current) {
      el.setAttribute("data-active", String(id === activeMarketId));
      el.setAttribute("aria-pressed", String(id === activeMarketId));
    }
  }, [activeMarketId, route]);

  // Opening a stop flies down to the venue in 3D; closing it returns to the whole route.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    const reduced = prefersReducedMotion();
    venueMarkerRef.current?.remove();
    venueMarkerRef.current = null;
    const venueSource = map.getSource("venue-building") as GeoJSONSource;
    venueSource.setData({ type: "FeatureCollection", features: [] });

    if (focus) {
      wasFocusedRef.current = true;
      map.dragRotate.enable();
      map.touchZoomRotate.enableRotation();
      const camera = { center: [focus.lng, focus.lat] as [number, number], zoom: focus.exact ? 16.4 : 13.5, pitch: 62, bearing: -28 };
      if (reduced) map.jumpTo(camera);
      else map.flyTo({ ...camera, duration: 2600, curve: 1.6, essential: true });

      const pin = document.createElement("div");
      pin.setAttribute("aria-hidden", "true");
      pin.style.cssText = `width:18px;height:18px;border-radius:999px;background:${HOT};border:3px solid ${PAPER};box-shadow:0 0 0 6px rgba(224,80,42,.25)`;
      venueMarkerRef.current = new maplibregl.Marker({ element: pin }).setLngLat([focus.lng, focus.lat]).addTo(map);

      // Once the camera settles, light up the building the venue sits in (nearest footprint within ~25px).
      const highlight = () => {
        if (!focus.exact) return;
        const at = map.project([focus.lng, focus.lat]);
        const box: [[number, number], [number, number]] = [[at.x - 25, at.y - 25], [at.x + 25, at.y + 25]];
        const hits = map.queryRenderedFeatures(box, { layers: ["buildings-3d"] });
        if (!hits.length) return;
        const nearest = hits
          .map((f) => {
            const c = map.project(centroid(f.geometry as GeoJSON.Polygon | GeoJSON.MultiPolygon));
            return { f, d: (c.x - at.x) ** 2 + (c.y - at.y) ** 2 };
          })
          .sort((a, b) => a.d - b.d)[0].f;
        // Rendered features are backed by tile internals the worker can't serialise; copy to plain JSON.
        const geometry = JSON.parse(JSON.stringify(nearest.geometry)) as GeoJSON.Geometry;
        const { render_height, render_min_height } = nearest.properties ?? {};
        venueSource.setData({
          type: "FeatureCollection",
          features: [{ type: "Feature", geometry, properties: { render_height, render_min_height } }],
        });
      };
      map.once("idle", highlight);
      return () => {
        map.off("idle", highlight);
      };
    }

    if (!wasFocusedRef.current) return;
    wasFocusedRef.current = false;
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    if (!route?.stops.length) return;
    const bounds = new maplibregl.LngLatBounds();
    route.stops.forEach((s) => bounds.extend([s.lng, s.lat]));
    map.fitBounds(bounds, {
      padding: { top: 70, bottom: 70, left: 60, right: 60 },
      maxZoom: 6,
      pitch: 0,
      bearing: 0,
      duration: reduced ? 0 : 1800,
    });
  }, [focus, ready, route]);

  // MapLibre sets position: relative on its container, so size it from a positioned wrapper.
  return (
    <div className="absolute inset-0" role="region" aria-label="Tour map">
      <div ref={containerRef} className="map-paper h-full w-full" />
    </div>
  );
}
