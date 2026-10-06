// Fallback planner used when OPENAI_API_KEY is missing. It calls the same tools in a fixed order
// and writes templated copy, so the full UI flow works with zero keys.

import { describeDemand } from "../demand";
import { metroById } from "../markets";
import { TIER_CAPACITY } from "../tiers";
import type { TourSession } from "./session";

export async function runScripted(session: TourSession) {
  const { request, emit } = session;
  const maxCities = request.maxCities ?? 10;

  emit({ type: "note", text: "No OpenAI key set — running the scripted planner over the same tools." });

  const found = await session.findArtist(request.artist);
  if (!found.found) throw new Error(found.message);
  const artist = session.artist!;

  await session.getFanMarkets();
  await session.getAudienceProfile();

  const chosen = session.markets.slice(0, maxCities);
  emit({ type: "note", text: `Keeping the ${chosen.length} strongest of ${session.markets.length} fan markets.` });

  const route = session.planRoute(chosen.map((m) => m.id));
  await session.getLocalTaste(route.stops.map((s) => s.marketId));
  for (const stop of route.stops) await session.findVenues(stop.marketId, session.roomFor(stop.marketId));

  const { candidates } = await session.findOpenerCandidates(6);
  const openers = [...candidates]
    .sort((a, b) => b.affinity * 0.4 + b.overlap * 0.3 + b.addedReach * 0.3 - (a.affinity * 0.4 + a.overlap * 0.3 + a.addedReach * 0.3))
    .slice(0, 2);

  const strongest = chosen[0];
  session.submitPlan({
    title: `The ${strongest?.region ?? "North American"} Run`,
    summary:
      `${route.stops.length} cities picked straight from ${artist.name}'s heatmap, led by ${strongest?.name} at full demand. ` +
      `${route.totalMiles.toLocaleString()} road miles over ${route.days} days.`,
    opener_ids: openers.map((o) => o.id),
    stops: route.stops.map((stop) => {
      const market = session.markets.find((m) => m.id === stop.marketId);
      const rank = market?.rank ?? session.markets.length;
      const inWords = market ? describeDemand(market, session.markets) : "outside the act's fan markets";
      const tier = session.roomFor(stop.marketId);
      const tags = session.taste.get(stop.marketId) ?? [];
      const venue = session.venues.get(stop.marketId)?.[0];
      const city = metroById(stop.marketId)?.name ?? stop.name;
      return {
        market_id: stop.marketId,
        venue_id: venue?.id,
        why: chosen.some((m) => m.id === stop.marketId)
          ? `${inWords[0].toUpperCase()}${inWords.slice(1)}.`
          : `Your chosen start city (${inWords}), added ahead of the weakest market.`,
        marketing_angle: tags.length
          ? `Fans here over-index on ${tags.slice(0, 2).join(" and ")}; place promo there.`
          : "Lead with the act's strongest single.",
        pitch_email:
          `Hi ${venue?.name ?? "team"} — we're routing ${artist.name} through ${city} on day ${stop.day}. ` +
          `Qloo's taste data ranks ${city} #${rank} of ${session.markets.length} US markets for the act, ` +
          `so we're looking at a ${tier} room (${TIER_CAPACITY[tier]}). ` +
          `Local fans skew toward ${tags[0] ?? "the act's core scene"}. Is the date open?`,
      };
    }),
  });
}
