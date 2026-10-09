import { runAgent } from "@/lib/agent";
import { clientKey, createLimiter } from "@/lib/rateLimit";
import type { AgentEvent, TourRequest } from "@/lib/types";

export const runtime = "nodejs";
// A full planner run makes ~10 tool round trips; give it room. Check your Vercel plan's ceiling.
export const maxDuration = 300;

// Each run spends Qloo quota and OpenAI tokens; a public demo needs a ceiling per visitor.
const RUNS_PER_WINDOW = Number(process.env.RUNS_PER_10_MIN ?? 6);
const limiter = createLimiter(RUNS_PER_WINDOW, 10 * 60_000);

function parseRequest(body: unknown): TourRequest | string {
  if (!body || typeof body !== "object") return "Expected a JSON body.";
  const { artist, maxCities, startCity } = body as Record<string, unknown>;
  if (typeof artist !== "string" || !artist.trim()) return "Enter an artist or comedian.";
  if (artist.length > 120) return "That name is too long.";
  const cities = typeof maxCities === "number" ? Math.round(maxCities) : 10;
  return {
    artist: artist.trim(),
    maxCities: Math.min(16, Math.max(4, cities)),
    startCity: typeof startCity === "string" && startCity.trim() ? startCity.trim() : undefined,
  };
}

/** Streams AgentEvents as newline-delimited JSON. */
export async function POST(req: Request) {
  const parsed = parseRequest(await req.json().catch(() => null));
  if (typeof parsed === "string") return Response.json({ error: parsed }, { status: 400 });

  const allowed = limiter.allow(clientKey(req));
  if (!allowed.ok) {
    const minutes = Math.ceil(allowed.retryAfterSec / 60);
    return Response.json(
      { error: `That's a lot of tours in a few minutes. Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.` },
      { status: 429, headers: { "retry-after": String(allowed.retryAfterSec) } },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AgentEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      await runAgent(parsed, emit);
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" },
  });
}
