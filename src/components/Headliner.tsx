"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { formatListeners } from "@/lib/tiers";
import type { ActScale, DataMode, TourRequest } from "@/lib/types";
import { CrewNotes } from "./CrewNotes";
import { RunForm } from "./RunForm";
import { SetList } from "./SetList";
import { Support } from "./Support";
import { useTourRun, type RunState } from "./useTourRun";

const TourMap = dynamic(() => import("./TourMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 bg-paper-deep/40" />,
});

export function Headliner() {
  const { state, start, stop } = useTourRun();
  const [activeMarketId, setActiveMarketId] = useState<string>();
  const [lastRequest, setLastRequest] = useState<TourRequest>();
  const running = state.status === "running";

  const run = (request: TourRequest) => {
    setActiveMarketId(undefined);
    setLastRequest(request);
    start(request);
  };

  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,36rem)_1fr]">
      <main className="px-4 pb-20 pt-6 sm:px-8 lg:pt-8">
        <Masthead mode={state.mode} />

        <div className="mt-8">
          <RunForm running={running} onStart={run} onStop={stop} />
        </div>

        {state.status === "idle" && <HowItWorks />}

        {state.status === "error" && (
          <div role="alert" className="mt-10 border-l-2 border-hot pl-4">
            <p className="label text-hot-deep">The run stalled</p>
            <p className="mt-1">{state.error}</p>
            {lastRequest && (
              <button type="button" onClick={() => run(lastRequest)} className="label mt-3 underline underline-offset-4">
                Try again
              </button>
            )}
          </div>
        )}

        {state.artist && <Poster state={state} />}

        {state.plan && (
          <div className="mt-10 space-y-10">
            <Support openers={state.plan.openers} />
            <section aria-labelledby="dates-heading">
              <h2 id="dates-heading" className="label flex justify-between text-ink-soft">
                <span>The dates</span>
                <span>Market rank</span>
              </h2>
              <p className="mb-2 mt-1 text-sm text-ink-soft">
                Rank is where the city places among {state.plan.artist.name}&rsquo;s {state.plan.marketCount} fan
                markets in Qloo&rsquo;s taste data. #1 is their strongest.
              </p>
              <SetList stops={state.plan.stops} activeMarketId={activeMarketId} onSelect={setActiveMarketId} />
            </section>
          </div>
        )}

        <div className="mt-10">
          <CrewNotes log={state.log} running={running} />
        </div>

        {state.mode && <SourceLine mode={state.mode} />}
      </main>

      <aside className="relative h-[60dvh] border-y-2 border-ink lg:sticky lg:top-0 lg:h-dvh lg:border-y-0 lg:border-l-2">
        <TourMap
          cells={state.cells}
          route={state.route}
          activeMarketId={activeMarketId}
          onSelectStop={setActiveMarketId}
        />
        <MapLegend idle={state.status === "idle"} hasHeat={state.cells.length > 0} />
      </aside>
    </div>
  );
}

/** Names the sources that are mocked, e.g. "Mock venues" — empty when everything is live. */
function mockLabel(mode?: DataMode): string | undefined {
  if (!mode) return undefined;
  const mocked = [mode.qloo === "mock" && "taste data", mode.venues === "mock" && "venues"].filter(Boolean);
  return mocked.length ? `Mock ${mocked.join(" + ")}` : undefined;
}

function Masthead({ mode }: { mode?: DataMode }) {
  return (
    <header>
      <div className="flex items-start justify-between gap-4">
        <h1 className="display text-[clamp(4rem,11vw,7.5rem)]">Headliner</h1>
        {mockLabel(mode) && (
          <span className="stamp mt-3 shrink-0" title="Mocked sources are listed in the source line at the bottom">
            {mockLabel(mode)}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-baseline justify-between border-t-[6px] border-ink pt-2">
        <p className="label">Route the tour your fans already want</p>
        <p className="label hidden text-ink-soft sm:block">Built on Qloo taste data</p>
      </div>
    </header>
  );
}

function HowItWorks() {
  const steps = [
    ["Find the fans", "Qloo heatmaps show where the act over-indexes — not where the follower counts say."],
    ["Route the run", "Cities ordered for short drives, rooms sized to real demand."],
    ["Book it", "Openers picked by shared audience, and a pitch drafted for every venue."],
  ];
  return (
    <ol className="mt-14 border-t-2 border-ink">
      {steps.map(([title, body], i) => (
        <li key={title} className="grid grid-cols-[2.5rem_1fr] gap-x-3 border-b rule py-4">
          <span className="display text-3xl text-hot">{String(i + 1).padStart(2, "0")}</span>
          <span>
            <span className="display block text-[1.7rem]">{title}</span>
            <span className="text-ink-soft">{body}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Poster({ state }: { state: RunState }) {
  const { artist, plan, markets } = state;
  return (
    <section className="enter mt-14" aria-live="polite">
      <p className="label text-ink-soft">{plan ? "Presenting" : "Now routing"}</p>
      <h2 className="display mt-1 text-[clamp(3.25rem,9vw,6rem)] [overflow-wrap:anywhere]">{artist!.name}</h2>
      {plan ? (
        <>
          <p className="display mt-2 text-[clamp(1.75rem,4vw,2.5rem)] text-hot">{plan.title}</p>
          <p className="label mt-4 border-y-2 border-ink py-2 tnum">
            {plan.stops.length} cities · {plan.days} days · {plan.totalMiles.toLocaleString()} road miles
          </p>
          <p className="mt-4 text-lg leading-relaxed">{plan.summary}</p>
          {plan.artist.scale && <ScaleLine scale={plan.artist.scale} />}
          {plan.audience && (
            <p className="label mt-1 text-ink-soft">
              Audience · {plan.audience.ageSkew} · {plan.audience.genderSkew}
            </p>
          )}
        </>
      ) : (
        markets.length > 0 && (
          <p className="label mt-4 border-y-2 border-ink py-2 tnum">
            {markets.length} markets with fan signal · strongest: {markets[0].name}
          </p>
        )
      )}
    </section>
  );
}

/** Why the rooms are the size they are — the first thing a booker will question. */
function ScaleLine({ scale }: { scale: ActScale }) {
  return (
    <p className="label mt-3 text-ink-soft tnum">
      Scale ·{" "}
      {scale.source === "lastfm" ? (
        <>
          {formatListeners(scale.listeners!)} Last.fm listeners → <span className="text-ink">{scale.tier} rooms</span>
        </>
      ) : (
        <>
          {scale.reason === "comedian" ? "comedian, no listener data" : "no listener data"} →{" "}
          <span className="text-ink">capped at {scale.tier} rooms</span>
        </>
      )}
    </p>
  );
}

function MapLegend({ idle, hasHeat }: { idle: boolean; hasHeat: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-4 sm:p-6">
      {idle && !hasHeat ? (
        <p className="display max-w-[14ch] text-[clamp(2rem,4vw,3.5rem)] text-ink/80">Their fans light up here.</p>
      ) : (
        <span />
      )}
      {hasHeat && (
        <div className="bg-paper/85 px-3 py-2" aria-hidden>
          <p className="label mb-1 text-ink-soft">Fan density</p>
          <div className="h-2 w-36 bg-[linear-gradient(90deg,rgba(236,170,120,0.35),#e0502a,#8f2a12)]" />
          <div className="label mt-1 flex justify-between text-[0.62rem] text-ink-soft">
            <span>Low</span>
            <span>High</span>
          </div>
        </div>
      )}
    </div>
  );
}

function SourceLine({ mode }: { mode: DataMode }) {
  return (
    <p className="label mt-12 text-[0.65rem] text-ink-soft">
      Qloo: {mode.qloo} · Venues: {mode.venues} · Planner: {mode.agent === "openai" ? "OpenAI" : "scripted"}
    </p>
  );
}
