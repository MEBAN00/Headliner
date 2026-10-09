import { describe, expect, it } from "vitest";
import { runCost } from "./openai";

describe("runCost", () => {
  it("prices a real Luna run (Tems: 12,736 in, 8,472 cached, 1,851 out)", () => {
    expect(runCost("gpt-6-luna", { input: 12_736, cached: 8_472, output: 1_851 })).toBeCloseTo(0.0014366, 7);
  });

  it("prices the same run on 6.1 Sol", () => {
    expect(runCost("gpt-6.1-sol", { input: 12_736, cached: 8_472, output: 1_851 })).toBeCloseTo(0.027885, 6);
  });

  it("returns undefined for a model without a known price", () => {
    expect(runCost("some-new-model", { input: 1, cached: 0, output: 1 })).toBeUndefined();
  });
});
