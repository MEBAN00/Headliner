"use client";

import { useId, useState } from "react";
import { METROS } from "@/lib/markets";
import type { TourRequest } from "@/lib/types";

const EXAMPLES = ["Khruangbin", "Hasan Minhaj", "Fontaines D.C.", "Tems"];

type Props = {
  running: boolean;
  onStart: (request: TourRequest) => void;
  onStop: () => void;
};

export function RunForm({ running, onStart, onStop }: Props) {
  const id = useId();
  const [artist, setArtist] = useState("");
  const [cities, setCities] = useState(10);
  const [startCity, setStartCity] = useState("");
  const [optionsOpen, setOptionsOpen] = useState(false);

  const submit = (name = artist) => {
    if (!name.trim() || running) return;
    setArtist(name);
    onStart({ artist: name.trim(), maxCities: cities, startCity: startCity || undefined });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-5"
    >
      <label htmlFor={`${id}-artist`} className="display block text-[clamp(2rem,4.2vw,2.75rem)]">
        Who&rsquo;s going on the road?
      </label>

      <div className="flex items-end gap-3 border-b-2 border-ink pb-2">
        <input
          id={`${id}-artist`}
          value={artist}
          onChange={(e) => setArtist(e.target.value)}
          placeholder="An artist or a comedian"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent font-serif text-2xl italic placeholder:text-ink-soft/60 focus:outline-none"
          disabled={running}
        />
        {running ? (
          <button type="button" onClick={onStop} className="label shrink-0 px-2 py-3 text-ink-soft hover:text-ink">
            Stop
          </button>
        ) : (
          <button
            type="submit"
            disabled={!artist.trim()}
            className="label shrink-0 bg-ink px-4 py-3 text-paper transition-transform duration-100 ease-out active:scale-[0.97] disabled:opacity-40"
          >
            Route the tour →
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <span className="label text-ink-soft">Try</span>
        {EXAMPLES.map((name) => (
          <button
            key={name}
            type="button"
            disabled={running}
            onClick={() => submit(name)}
            className="font-serif text-lg italic underline decoration-rule decoration-1 underline-offset-4 hover:decoration-hot disabled:opacity-40"
          >
            {name}
          </button>
        ))}
      </div>

      <div>
        <button
          type="button"
          aria-expanded={optionsOpen}
          aria-controls={`${id}-options`}
          onClick={() => setOptionsOpen((o) => !o)}
          className="label text-ink-soft hover:text-ink"
        >
          {optionsOpen ? "− " : "+ "}Route options
        </button>
        <div id={`${id}-options`} className="reveal" data-open={optionsOpen}>
          <div>
            <div className="grid gap-5 pt-4 sm:grid-cols-2">
              <label className="block space-y-2">
                <span className="label flex justify-between text-ink-soft">
                  Cities <output className="text-ink">{cities}</output>
                </span>
                <input
                  type="range"
                  min={4}
                  max={16}
                  value={cities}
                  onChange={(e) => setCities(Number(e.target.value))}
                  className="w-full accent-[var(--color-hot)]"
                  disabled={running}
                />
              </label>
              <label className="block space-y-2">
                <span className="label block text-ink-soft">Start city</span>
                <select
                  value={startCity}
                  onChange={(e) => setStartCity(e.target.value)}
                  disabled={running}
                  className="w-full border-b border-ink/40 bg-transparent py-1 font-serif text-lg focus:border-ink focus:outline-none"
                >
                  <option value="">Wherever routes best</option>
                  {[...METROS].sort((a, b) => a.name.localeCompare(b.name)).map((m) => (
                    <option key={m.id} value={m.name}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}
