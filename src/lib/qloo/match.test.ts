import { describe, expect, it } from "vitest";
import { bestMatch, isComedian, sameName } from "./match";

describe("sameName", () => {
  it.each([
    ["Fireboy DML", "Fireboy Dml"],
    ["Wet Leg", "WET LEG"],
    ["Noname", "NoName"],
    ["The Murder Capital", "Murder Capital"],
    ["Selena Gomez & the Scene", "Selena Gomez and the Scene"],
    ["Beyoncé", "Beyonce"],
  ])("%s = %s", (a, b) => expect(sameName(a, b)).toBe(true));

  it("does not match different acts", () => {
    expect(sameName("Taylor Tomlinson", "Taylor Swift")).toBe(false);
  });
});

describe("bestMatch", () => {
  it("skips fuzzy hits that aren't the act typed", () => {
    const artists = [{ name: "Taylor Swift" }, { name: "James Taylor" }];
    expect(bestMatch("Taylor Tomlinson", artists)).toBeUndefined();
    expect(bestMatch("Taylor Tomlinson", [{ name: "Taylor Tomlinson" }, ...artists])?.name).toBe("Taylor Tomlinson");
  });
});

describe("isComedian", () => {
  it("reads Qloo's Comedy genre tag", () => {
    expect(isComedian({ tags: [{ name: "Comedy", type: "urn:tag:genre" }] })).toBe(true);
    expect(isComedian({ tags: [{ name: "Indie Rock", type: "urn:tag:genre" }] })).toBe(false);
    expect(isComedian({ tags: [{ name: "Witty", type: "urn:tag:music:qloo" }] })).toBe(false);
    expect(isComedian({})).toBe(false);
  });
});
