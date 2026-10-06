import { describe, expect, it } from "vitest";
import { roomFor, scaleFromListeners } from "./tiers";
import { classifyVenue, pickVenues } from "./venueSize";

describe("act scale", () => {
  it("maps Last.fm listeners to the room an act headlines", () => {
    expect(scaleFromListeners(127_000).tier).toBe("club"); // Ratboys
    expect(scaleFromListeners(265_000).tier).toBe("theater"); // MJ Lenderman
    expect(scaleFromListeners(692_000).tier).toBe("hall"); // Fontaines D.C.
  });

  it("treats missing listener data as unknown", () => {
    expect(scaleFromListeners(undefined)).toEqual({ tier: "theater", source: "unknown", reason: "no-data" });
    expect(scaleFromListeners(0).source).toBe("unknown");
  });
});

describe("roomFor", () => {
  const theaterAct = scaleFromListeners(265_000);

  it("never upsizes a theater act, even in its best market", () => {
    expect(roomFor(theaterAct, 1)).toBe("theater");
  });

  it("steps down one size in weak markets", () => {
    expect(roomFor(theaterAct, 0.4)).toBe("club");
    expect(roomFor(scaleFromListeners(100_000), 0.2)).toBe("club"); // already the smallest
  });

  it("caps unknown-scale acts at theater", () => {
    const unknown = scaleFromListeners(undefined);
    expect(roomFor(unknown, 1)).toBe("theater");
    expect(roomFor(unknown, 0.3)).toBe("club");
  });
});

describe("classifyVenue", () => {
  it.each([
    ["TD Garden", "arena"],
    ["Fenway Park", "arena"],
    ["Agganis Arena", "arena"],
    ["MGM Music Hall at Fenway", "hall"],
    ["Salle Wilfrid-Pelletier", "hall"],
    ["Boch Center Wang Theatre", "theater"],
    ["Citizens House of Blues Boston", "theater"],
    ["Piranha Bar", "club"],
    ["Club Soda", "club"],
    ["The Wilbur", "unknown"],
    ["Big Night Live", "unknown"],
  ])("%s → %s", (name, size) => {
    expect(classifyVenue(name)).toBe(size);
  });
});

describe("pickVenues", () => {
  // Boston, as Ticketmaster actually returns it (relevance order).
  const boston = [
    "TD Garden",
    "MGM Music Hall at Fenway",
    "Fenway Park",
    "Boch Center Wang Theatre",
    "The Wilbur",
    "Citizens House of Blues Boston",
    "Agganis Arena",
    "Big Night Live",
  ].map((name) => ({ name }));

  it("offers theaters for a theater show and never a stadium", () => {
    const picks = pickVenues(boston, "theater", 3);
    expect(picks.map((p) => p.name)).toEqual([
      "Boch Center Wang Theatre",
      "Citizens House of Blues Boston",
      "The Wilbur",
    ]);
    expect(picks[2].sizeMatch).toBe("unverified");
  });

  it("falls back to the nearest size, flagged, when nothing matches", () => {
    const picks = pickVenues([{ name: "Fenway Park" }, { name: "Paradise Rock Club" }], "theater", 3);
    expect(picks).toEqual([{ name: "Paradise Rock Club", size: "club", sizeMatch: "closest" }]);
  });
});
