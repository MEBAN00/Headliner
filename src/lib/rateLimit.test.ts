import { describe, expect, it } from "vitest";
import { clientKey, createLimiter } from "./rateLimit";

describe("createLimiter", () => {
  it("allows up to the limit, then asks the visitor to wait", () => {
    const limiter = createLimiter(2, 60_000);
    expect(limiter.allow("a", 0).ok).toBe(true);
    expect(limiter.allow("a", 1_000).ok).toBe(true);
    const third = limiter.allow("a", 2_000);
    expect(third).toEqual({ ok: false, retryAfterSec: 58 });
  });

  it("counts visitors separately and frees slots as the window passes", () => {
    const limiter = createLimiter(1, 60_000);
    expect(limiter.allow("a", 0).ok).toBe(true);
    expect(limiter.allow("b", 0).ok).toBe(true);
    expect(limiter.allow("a", 30_000).ok).toBe(false);
    expect(limiter.allow("a", 60_001).ok).toBe(true);
  });
});

describe("clientKey", () => {
  it("uses the first forwarded address", () => {
    const req = new Request("http://x", { headers: { "x-forwarded-for": "203.0.113.7, 10.0.0.1" } });
    expect(clientKey(req)).toBe("203.0.113.7");
  });
});
