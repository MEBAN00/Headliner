"use client";

import { useEffect, useRef, useState } from "react";
import { TIER_CAPACITY } from "@/lib/tiers";
import type { TourStop, Venue } from "@/lib/types";

type Props = {
  stops: TourStop[];
  activeMarketId?: string;
  onSelect: (marketId: string | undefined) => void;
};

/** The run as a numbered set list. One row open at a time; selection is shared with the map. */
export function SetList({ stops, activeMarketId, onSelect }: Props) {
  return (
    <ol className="border-t-2 border-ink">
      {stops.map((stop, i) => (
        <StopRow
          key={stop.marketId}
          stop={stop}
          index={i}
          open={stop.marketId === activeMarketId}
          onToggle={() => onSelect(stop.marketId === activeMarketId ? undefined : stop.marketId)}
        />
      ))}
    </ol>
  );
}

function StopRow({ stop, index, open, onToggle }: { stop: TourStop; index: number; open: boolean; onToggle: () => void }) {
  const ref = useRef<HTMLLIElement>(null);

  // A pin click on the map opens the row; bring it into view.
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  return (
    <li ref={ref} className="enter border-b rule" style={{ animationDelay: `${index * 40}ms` }}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="group grid w-full grid-cols-[2.5rem_1fr_auto] items-baseline gap-x-3 py-3 text-left"
      >
        <span className={`display text-3xl ${open ? "text-hot" : "text-ink"}`}>{String(index + 1).padStart(2, "0")}</span>
        <span className="min-w-0">
          <span className="display block truncate text-[1.9rem] group-hover:text-hot-deep">{stop.name}</span>
          <span className="label mt-1 block text-ink-soft">
            Day {stop.day}
            {stop.legMiles > 0 && <> · {stop.legMiles.toLocaleString()} mi</>}
            {stop.venue && <> · {stop.venue.name}</>}
            {stop.venue && stop.venue.sizeMatch !== "exact" && <SizeFlag venue={stop.venue} />}
          </span>
        </span>
        <span className="text-right">
          <span className="display block text-3xl tnum" aria-label={`Market rank ${stop.rank}`}>
            #{stop.rank}
          </span>
          <span className="label block text-ink-soft">{stop.tier}</span>
        </span>
      </button>

      <div className="reveal" data-open={open}>
        <div>
          <div className="space-y-4 pb-5 pl-[3.25rem]">
            <p>{stop.why}</p>
            {stop.tasteTags.length > 0 && (
              <p className="label leading-relaxed text-ink-soft">
                Local fans are into <span className="text-ink">{stop.tasteTags.join(" / ")}</span>
              </p>
            )}
            <p>
              <span className="label mr-2 text-hot-deep">Angle</span>
              {stop.marketingAngle}
            </p>
            <PitchStub stop={stop} />
          </div>
        </div>
      </div>
    </li>
  );
}

/** Venue sizes come from names; say so when the name didn't settle it. */
function SizeFlag({ venue }: { venue: Venue }) {
  const text = venue.sizeMatch === "closest" ? `closest size: ${venue.size}` : "size unverified";
  return <span className="text-hot-deep"> · {text}</span>;
}

function PitchStub({ stop }: { stop: TourStop }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(stop.pitchEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <figure className="relative border border-dashed border-ink/40 bg-paper-deep/50 p-4">
      <figcaption className="label mb-2 flex items-start justify-between gap-4 text-ink-soft">
        <span>
          Pitch · {stop.venue?.name ?? "venue"} · {stop.tier} {TIER_CAPACITY[stop.tier]}
        </span>
        <button type="button" onClick={copy} className="shrink-0 text-ink hover:text-hot-deep" aria-live="polite">
          {copied ? "Copied" : "Copy"}
        </button>
      </figcaption>
      <p className="whitespace-pre-line text-[0.98rem] leading-relaxed">{stop.pitchEmail}</p>
    </figure>
  );
}
