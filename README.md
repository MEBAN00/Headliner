# Headliner

**Route the tour your fans already want.**

Headliner is a tour-routing agent for independent musicians and comedians. Give it an act; it reads
Qloo's taste graph to find where the fans actually are, routes a run of shows that doesn't bleed money
on drives, sizes each room to real demand, picks openers by shared audience, and drafts a booking pitch
for every venue.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/).

## How it works

```
Next.js (one app)
 ├─ UI: MapLibre map (fan heatmap + self-drawing route), set list, crew notes
 └─ POST /api/agent → streams newline-delimited JSON events
        OpenAI Responses API function-calling loop (or a scripted planner when no key is set)
        ├─ find_artist            Qloo search
        ├─ get_fan_markets        Qloo heatmap → aggregated touring markets
        ├─ get_audience_profile   Qloo demographics
        ├─ find_opener_candidates Qloo similar artists + audience-geography comparison
        ├─ get_local_taste        Qloo taste tags per city
        ├─ find_venues            Ticketmaster Discovery API
        ├─ plan_route             deterministic nearest-neighbour + 2-opt (no LLM)
        └─ submit_tour_plan       validated against everything gathered
```

Design rules:

- **The model chooses, code computes.** Distances, show days and demand scores come from code and
  Qloo; the agent can only quote them.
- **Everything is cached** (`./.cache`) so demos are repeatable and rate limits are respected.
- **Every source has a mock.** With no keys at all, the app runs end to end on deterministic mock
  data and says so on screen.

## Run it

```bash
npm install
cp .env.example .env.local   # add whichever keys you have
npm run dev
```

Open http://localhost:3000.

| Key | Without it |
| --- | --- |
| `QLOO_API_KEY` | Mock heatmaps, similar acts, taste tags |
| `OPENAI_API_KEY` | Scripted planner runs the same tools |
| `TICKETMASTER_API_KEY` | Mock venue names |

## Scripts

- `npm run dev` — dev server
- `npm test` — unit tests (route optimizer)
- `npm run typecheck` / `npm run lint`

## Status

Scaffold. Qloo response parsing in `src/lib/qloo/client.ts` is marked `VERIFY` where field paths
need confirming against the hackathon API.

## License

MIT
