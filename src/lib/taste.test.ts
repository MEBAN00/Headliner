import { describe, expect, it } from "vitest";
import { distinctiveTags } from "./taste";

describe("distinctiveTags", () => {
  const byCity = new Map([
    ["sf", ["Live music bar", "Art gallery", "chillwave", "Essays"]],
    ["la", ["Live music bar", "Art gallery", "instrumental hip hop", "psychedelic"]],
    ["sd", ["Live music bar", "Art gallery", "Cheese Pizza", "Mac N Cheese"]],
    ["den", ["Live music bar", "Art gallery", "Essays", "Humor"]],
    ["mia", ["Live music bar", "Wine & Spirits", "minimal", "Art gallery"]],
  ]);

  it("drops tags shared by most cities and keeps the local ones first", () => {
    const out = distinctiveTags(byCity, 3);
    expect(out.get("la")).toEqual(["instrumental hip hop", "psychedelic", "Live music bar"]);
    expect(out.get("sd")!.slice(0, 2)).toEqual(["Cheese Pizza", "Mac N Cheese"]);
  });

  it("backfills a city whose tags are all common, rarest first", () => {
    const out = distinctiveTags(byCity, 2);
    expect(out.get("sf")).toEqual(["chillwave", "Essays"]);
  });

  it("leaves tags alone when there are too few cities to compare", () => {
    const two = new Map([
      ["a", ["Bar", "Jazz"]],
      ["b", ["Bar", "Soul"]],
    ]);
    expect(distinctiveTags(two)).toEqual(two);
  });
});
