import type { OpenerCandidate } from "@/lib/types";

const pct = (x: number) => `${Math.round(x * 100)}%`;

/** Chosen openers, with the audience maths that justified them. */
export function Support({ openers }: { openers: OpenerCandidate[] }) {
  if (!openers.length) return null;
  return (
    <section aria-labelledby="support-heading">
      <h2 id="support-heading" className="label mb-2 text-ink-soft">
        With support from
      </h2>
      <ul className="space-y-3">
        {openers.map((o) => (
          <li key={o.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <span className="display text-[2.1rem]">{o.name}</span>
            <span className="label text-ink-soft tnum">
              <span className="text-overlap">{pct(o.overlap)} shared fans</span> · adds {pct(o.addedReach)} new reach
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
