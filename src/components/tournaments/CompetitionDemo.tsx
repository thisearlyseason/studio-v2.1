"use client";
import { useEffect, useMemo, useState } from "react";
import {
  COMPETITION_FORMATS,
  type CompetitionFormat,
} from "@/lib/competition/types";
import { createDemoCompetition } from "@/lib/competition/demo";
import CompetitionController from "./CompetitionController";
export default function CompetitionDemo() {
  const [format, setFormat] = useState<CompetitionFormat>("pool_play_knockout"),
    [reset, setReset] = useState(0),
    [custom, setCustom] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const document = useMemo(
    () => (ready ? createDemoCompetition(format) : null),
    [format, ready],
  );
  if (!document)
    return (
      <main className="p-6" role="status">
        Loading tournament examples…
      </main>
    );
  return (
    <main className="min-h-screen bg-background py-6">
      <section className="cw cw-access mb-4">
        <h1>Explore tournament formats</h1>
        <p>
          Try all 13 formats with fictional teams. Score matches, review
          advancement, move games, or explore the bracket, pools, schedule and
          field map.
        </p>
        <div className="cw-inline">
          <label>
            Demo format
            <select
              value={format}
              onChange={(e) => {
                setCustom(false);
                setFormat(e.target.value as CompetitionFormat);
              }}
            >
              {COMPETITION_FORMATS.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <button
            onClick={() => {
              setCustom(false);
              setReset((value) => value + 1);
            }}
          >
            Reset this example
          </button>
          <button
            onClick={() => {
              setCustom(true);
              setReset((value) => value + 1);
            }}
          >
            Build your own example
          </button>
          <a href="/dashboard">Back to demo workspace</a>
        </div>
      </section>
      <CompetitionController
        key={`${format}:${reset}:${custom}`}
        demo
        initialDocument={custom ? undefined : document}
      />
    </main>
  );
}
