// OpenAI-driven planner: a function-calling loop on the Responses API over the TourSession tools.
// Turns are chained with previous_response_id, so reasoning items carry over without resending history.

import OpenAI from "openai";
import type { TourSession } from "./session";
import { FINAL_TOOL, runTool, TOOLS } from "./tools";

// Luna keeps development runs cheap; set OPENAI_MODEL=gpt-6.1-sol for the demo.
const MODEL = process.env.OPENAI_MODEL ?? "gpt-6-luna";
const EFFORT = (process.env.OPENAI_REASONING_EFFORT ?? "medium") as "low" | "medium" | "high";
const MAX_TURNS = 24;

const INSTRUCTIONS = `You are Headliner, a tour-routing agent for touring musicians and comedians.
You plan a run of shows using Qloo taste data, then hand the booker a plan they can act on.

How to work:
1. find_artist, then get_fan_markets and get_audience_profile.
2. Choose markets. Start from demand, but think like a booker: a mid-demand city that sits between two
   strong ones is worth a stop; a strong city 1,000 miles off the path may not be. Respect the requested city count.
   If the user named a start city, include it — plan_route always opens the run there.
3. plan_route with your chosen markets. If a leg looks wasteful, adjust the list and route again.
4. get_local_taste for all routed markets in one call, and find_venues per stop using that market's "room"
   from get_fan_markets. Room size comes from the act's real scale (find_artist reports it), so a mid-size act
   stays in theaters even in its best city. Don't upsize.
5. find_opener_candidates, then pick 1–2 openers. Prefer high overlap (they fit the bill) balanced with
   addedReach (they sell tickets the headliner can't). Say which trade-off you made.
6. submit_tour_plan.

Rules:
- Every number you state must come from a tool result. Never estimate distances, days, or demand yourself.
- Never put a raw demand score (like 0.965) in title, summary, why, marketing_angle or pitch_email. People don't
  know what it means. Use the market's in_words instead, e.g. "Philadelphia is your #3 market of 43".
- Only mention taste tags a promoter could act on: music genres, scenes, media, culture. Skip food and generic
  places. If a city's tags have nothing usable, leave taste out of that pitch.
- Keep "why" and "marketing_angle" to one sentence each, specific to that city's data.
- Pitch emails: under 90 words, addressed to the venue, cite the demand score and local taste, ask about the date.
- Prefer venues whose size_check is "exact". If only "unverified" or "closest" venues exist, still pick one,
  but don't claim its capacity in the pitch.
- Between tool calls, write at most one short sentence about what you're doing next. It is shown to the user live.`;

/** OpenAI list prices in USD per 1M tokens (standard, short context), from openai.com/api/pricing, Oct 2026. */
const PRICES: Record<string, { input: number; cached: number; output: number }> = {
  "gpt-6-luna": { input: 0.1, cached: 0.01, output: 0.5 },
  "gpt-6.1-sol": { input: 2, cached: 0.1, output: 10 },
  "gpt-6-sol": { input: 2, cached: 0.2, output: 10 },
  "gpt-6-astra": { input: 10, cached: 1, output: 50 },
};

/** Cached input is billed at the cached rate; reasoning tokens are already counted in output. */
export function runCost(model: string, u: { input: number; cached: number; output: number }): number | undefined {
  const p = PRICES[model];
  if (!p) return undefined;
  return ((u.input - u.cached) * p.input + u.cached * p.cached + u.output * p.output) / 1_000_000;
}

const tools: OpenAI.Responses.FunctionTool[] = TOOLS.map((t) => ({
  type: "function",
  name: t.name,
  description: t.description,
  parameters: t.parameters,
  strict: true,
}));

export async function runOpenAI(session: TourSession) {
  const client = new OpenAI();
  const { request, emit } = session;

  // Token usage across the run, logged server-side so cost per tour is measured, not guessed.
  const usage = { calls: 0, input: 0, cached: 0, output: 0, reasoning: 0 };
  const ask = async (input: OpenAI.Responses.ResponseInput | string, previous?: string) => {
    const res = await client.responses.create({
      model: MODEL,
      instructions: INSTRUCTIONS,
      tools,
      reasoning: { effort: EFFORT },
      input,
      previous_response_id: previous,
    });
    usage.calls += 1;
    usage.input += res.usage?.input_tokens ?? 0;
    usage.cached += res.usage?.input_tokens_details?.cached_tokens ?? 0;
    usage.output += res.usage?.output_tokens ?? 0;
    usage.reasoning += res.usage?.output_tokens_details?.reasoning_tokens ?? 0;
    return res;
  };

  try {
    await plan();
  } finally {
    const cost = runCost(MODEL, usage);
    console.info(
      `[headliner] ${MODEL} · ${request.artist} · ${usage.calls} calls · input ${usage.input} (cached ${usage.cached}) · ` +
        `output ${usage.output} (reasoning ${usage.reasoning}) · ${cost === undefined ? "cost unknown for this model" : `≈ $${cost.toFixed(4)}`}`,
    );
  }

  async function plan() {
    let response = await ask(
      `Plan a tour for: ${request.artist}\n` +
        `Cities: about ${request.maxCities ?? 10}\n` +
        (request.startCity ? `Start city: ${request.startCity}\n` : ""),
    );
    let nudged = false;

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (response.status === "incomplete") {
        throw new Error(`The planner stopped early (${response.incomplete_details?.reason ?? "incomplete"}); try fewer cities.`);
      }
      for (const item of response.output) {
        if (item.type !== "message") continue;
        for (const part of item.content) {
          if (part.type === "refusal") throw new Error("The model declined this request.");
          if (part.type === "output_text" && part.text.trim()) emit({ type: "note", text: part.text.trim() });
        }
      }

      const calls = response.output.filter(
        (item): item is OpenAI.Responses.ResponseFunctionToolCall => item.type === "function_call",
      );
      if (calls.length === 0) {
        if (session.plan) return;
        if (nudged) throw new Error("The agent stopped without submitting a plan.");
        nudged = true;
        response = await ask("Finish by calling submit_tour_plan.", response.id);
        continue;
      }

      // Parallel calls run concurrently; every call gets an output, errors included, so the model can recover.
      const outputs = await Promise.all(
        calls.map(async (call): Promise<OpenAI.Responses.ResponseInputItem.FunctionCallOutput> => {
          let output: string;
          try {
            const args = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
            output = JSON.stringify(await runTool(session, call.name, args));
          } catch (err) {
            output = JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
          }
          return { type: "function_call_output", call_id: call.call_id, output };
        }),
      );

      if (calls.some((c) => c.name === FINAL_TOOL) && session.plan) return;
      response = await ask(outputs, response.id);
    }

    throw new Error(`No plan after ${MAX_TURNS} turns.`);
  }
}
