"use client";

import { useCallback, useRef, useState } from "react";
import type { AgentEvent, Artist, DataMode, HeatCell, Market, Route, TourPlan, TourRequest } from "@/lib/types";

export type LogEntry = { id: number; kind: "tool" | "note"; text: string };

export type RunState = {
  status: "idle" | "running" | "done" | "error";
  mode?: DataMode;
  artist?: Artist;
  cells: HeatCell[];
  markets: Market[];
  route?: Route;
  plan?: TourPlan;
  log: LogEntry[];
  error?: string;
};

const INITIAL: RunState = { status: "idle", cells: [], markets: [], log: [] };

function reduce(state: RunState, event: AgentEvent, id: number): RunState {
  switch (event.type) {
    case "mode":
      return { ...state, mode: event.mode };
    case "note":
      return { ...state, log: [...state.log, { id, kind: "note", text: event.text }] };
    case "tool":
      return { ...state, log: [...state.log, { id, kind: "tool", text: event.label }] };
    case "artist":
      return { ...state, artist: event.artist };
    case "heatmap":
      return { ...state, cells: event.cells };
    case "markets":
      return { ...state, markets: event.markets };
    case "route":
      return { ...state, route: event.route };
    case "plan": {
      // Keep the existing route object when the order is unchanged so the map doesn't redraw it.
      const same =
        state.route?.stops.map((s) => s.marketId).join() === event.plan.stops.map((s) => s.marketId).join();
      const route = same ? state.route : { stops: event.plan.stops, totalMiles: event.plan.totalMiles, days: event.plan.days };
      return { ...state, plan: event.plan, route };
    }
    case "error":
      return { ...state, status: "error", error: event.message };
    case "done":
      return { ...state, status: state.status === "error" ? "error" : "done" };
  }
}

/** Posts a tour request and folds the NDJSON event stream into UI state. */
export function useTourRun() {
  const [state, setState] = useState<RunState>(INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const seq = useRef(0);

  const start = useCallback(async (request: TourRequest) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ ...INITIAL, status: "running" });

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(request),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `Request failed (${res.status})`);
      }

      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const event = JSON.parse(line) as AgentEvent;
          setState((s) => reduce(s, event, seq.current++));
        }
      }
      setState((s) => (s.status === "running" ? { ...s, status: "done" } : s));
    } catch (err) {
      if (controller.signal.aborted) {
        setState((s) => ({ ...s, status: s.plan ? "done" : "idle" }));
        return;
      }
      setState((s) => ({ ...s, status: "error", error: err instanceof Error ? err.message : String(err) }));
    }
  }, []);

  const stop = useCallback(() => abortRef.current?.abort(), []);

  return { state, start, stop };
}
