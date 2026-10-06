import { describe, expect, it } from "vitest";
import { describeDemand, findRawScore } from "./demand";
import { aggregateMarkets } from "./markets";

const markets = [
  { name: "Boston", rank: 1, demand: 1 },
  { name: "New York", rank: 2, demand: 0.98 },
  { name: "Philadelphia", rank: 3, demand: 0.965 },
];

describe("describeDemand", () => {
  it("names the strongest market", () => {
    expect(describeDemand(markets[0], markets)).toBe("#1 of 3 fan markets — the act's strongest");
  });

  it("puts other markets as a rank and a share of the best", () => {
    expect(describeDemand(markets[2], markets)).toBe(
      "#3 of 3 fan markets — 97% as strong as Boston, the act's best",
    );
  });
});

describe("findRawScore", () => {
  it("catches raw decimals in reader-facing text", () => {
    expect(findRawScore("Philadelphia market demand is 0.965, with local interests")).toBe("0.965");
    expect(findRawScore("demand (0.97) is high")).toBe("0.97");
  });

  it("ignores money, versions and ordinary numbers", () => {
    expect(findRawScore("Tickets at $0.99 fees, capacity 2,500, rank #3")).toBeUndefined();
    expect(findRawScore("Version 10.05 of the plan, 97% as strong")).toBeUndefined();
  });
});

describe("aggregateMarkets", () => {
  it("ranks markets from 1 in demand order", () => {
    const ranked = aggregateMarkets([
      { lat: 42.36, lng: -71.06, affinity: 0.9, popularity: 1 },
      { lat: 39.95, lng: -75.17, affinity: 0.5, popularity: 1 },
    ]);
    expect(ranked.map((m) => [m.name, m.rank])).toEqual([
      ["Boston", 1],
      ["Philadelphia", 2],
    ]);
  });
});
