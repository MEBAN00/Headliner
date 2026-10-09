// Shared shapes for the agent, API route and UI.

export type LatLng = { lat: number; lng: number };

/** One Qloo heatmap cell: how strongly an area over-indexes for the act. */
export type HeatCell = LatLng & {
  affinity: number; // 0..1, local interest vs. other entities
  popularity: number; // 0..1 percentile within the cell
  rank?: number; // 0..1, how this area ranks vs. other areas for the act
};

/** A metro market, aggregated from heat cells. */
export type Market = LatLng & {
  id: string;
  name: string;
  region: string;
  demand: number; // 0..1, relative to the act's best market — internal; show `rank` to people
  rank: number; // 1 = the act's strongest market
  cells: number; // heat cells that fed this score
};

export type Artist = {
  id: string;
  name: string;
  popularity?: number;
  image?: string;
  comedian?: boolean;
  /** How big the act is: sets the room size everywhere on the tour. */
  scale?: ActScale;
};

export type ActScale = {
  tier: VenueTier;
  listeners?: number;
  source: "lastfm" | "unknown";
  reason?: "comedian" | "no-data"; // why the source is unknown
};

export type OpenerCandidate = {
  id: string;
  name: string;
  affinity: number; // taste similarity to the headliner, 0..1
  overlap: number; // share of the headliner's demand they also draw, 0..1
  addedReach: number; // demand they bring in markets the headliner is weak, 0..1
};

export type VenueTier = "club" | "theater" | "hall";

export type Venue = {
  id: string;
  name: string;
  city: string;
  tier: VenueTier; // the room size we asked for
  size: VenueTier | "arena" | "unknown"; // what the venue's name says it is
  sizeMatch: "exact" | "unverified" | "closest";
  address?: string;
  url?: string;
  lat?: number; // from Ticketmaster; missing for mock venues
  lng?: number;
};

export type RouteStop = LatLng & {
  marketId: string;
  name: string;
  legMiles: number; // from the previous stop
  day: number; // 1-based tour day of the show
};

export type Route = { stops: RouteStop[]; totalMiles: number; days: number };

export type TourStop = RouteStop & {
  demand: number;
  rank: number; // among all of the act's fan markets
  tier: VenueTier;
  venue?: Venue;
  why: string;
  tasteTags: string[];
  marketingAngle: string;
  pitchEmail: string;
};

export type AudienceProfile = {
  ageSkew: string;
  genderSkew: string;
};

export type TourPlan = {
  artist: Artist;
  title: string;
  summary: string;
  stops: TourStop[];
  marketCount: number; // fan markets found, the denominator for each stop's rank
  openers: OpenerCandidate[];
  audience?: AudienceProfile;
  totalMiles: number;
  days: number;
  dataMode: DataMode;
};

/** Which sources were real vs. mocked for this run — always shown in the UI. */
export type DataMode = { qloo: "live" | "mock"; venues: "live" | "mock"; agent: "openai" | "scripted" };

export type TourRequest = {
  artist: string;
  maxCities?: number;
  startCity?: string;
};

/** Streamed from /api/agent as newline-delimited JSON. */
export type AgentEvent =
  | { type: "mode"; mode: DataMode }
  | { type: "note"; text: string }
  | { type: "tool"; name: string; label: string }
  | { type: "artist"; artist: Artist }
  | { type: "heatmap"; cells: HeatCell[] }
  | { type: "markets"; markets: Market[] }
  | { type: "route"; route: Route }
  | { type: "plan"; plan: TourPlan }
  | { type: "error"; message: string }
  | { type: "done" };
