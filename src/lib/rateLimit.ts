// Per-visitor limit on tour runs, so a public demo URL can't burn through the Qloo and OpenAI quotas.
// In-memory and per server instance: a guardrail, not a security boundary.

export type Limiter = { allow: (key: string, now?: number) => { ok: true } | { ok: false; retryAfterSec: number } };

export function createLimiter(maxRuns: number, windowMs: number): Limiter {
  const hits = new Map<string, number[]>();
  return {
    allow(key, now = Date.now()) {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= maxRuns) {
        hits.set(key, recent);
        return { ok: false, retryAfterSec: Math.ceil((windowMs - (now - recent[0])) / 1000) };
      }
      recent.push(now);
      hits.set(key, recent);
      // Keep the map from growing without bound on a long-lived instance.
      if (hits.size > 5_000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
      return { ok: true };
    },
  };
}

/** The visitor's IP as Vercel (or any proxy) reports it. */
export function clientKey(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || req.headers.get("x-real-ip") || "local";
}
