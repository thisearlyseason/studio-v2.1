"use client";
import { FORMAT_DESCRIPTIONS } from "@/lib/competition/format-descriptions";
import type { Resource } from "@/lib/competition/schedule";
import React, { useState, useRef } from "react";
import {
  COMPETITION_FORMATS,
  type CompetitionFormat,
  type Source,
  type CustomMatch,
} from "@/lib/competition/types";
import { buildTopology } from "@/lib/competition/topology";
import {
  createCompetition,
  type CompetitionDocument,
  type CompetitionSetup as Setup,
} from "@/lib/competition/document";
import { competitionVenues } from "@/lib/competition/venues";
import { buildPlayingWindows } from "@/lib/competition/setup-windows";
import "./competition-workspace.css";
export default function CompetitionSetup({
  onCreate,
  demo = false,
  starter = false,
  initial,
  catalog = { teams: [], resources: [] },
}: {
  onCreate: (setup: Setup) => Promise<void>;
  demo?: boolean;
  starter?: boolean;
  initial?: CompetitionDocument;
  catalog?: {
    teams: { id: string; name: string }[];
    resources: Resource[];
  };
}) {
  const [title, setTitle] = useState(
      initial?.title || (demo ? "Autumn Cup" : ""),
    ),
    [format, setFormat] = useState<CompetitionFormat>(
      initial?.topology.rules.format || "single_elimination",
    ),
    [names, setNames] = useState(
      initial?.topology.teams.map((t) => t.name).join("\n") || "",
    ),
    [date, setDate] = useState(
      initial?.options.windows[0]?.date ||
        new Date().toISOString().slice(0, 10),
    ),
    [endDate, setEndDate] = useState(
      initial?.options.windows.at(-1)?.date || date,
    ),
    [start, setStart] = useState(
      initial?.options.windows[0]?.startTime || "08:00",
    ),
    [end, setEnd] = useState(initial?.options.windows[0]?.endTime || "20:00"),
    [fields, setFields] = useState(
      initial?.options.resources.map((r) => r.name).join("\n") || "",
    ),
    [timezone, setTimezone] = useState(
      initial?.topology.rules.timezone ||
        Intl.DateTimeFormat().resolvedOptions().timeZone,
    ),
    [duration, setDuration] = useState(initial?.options.duration || 45),
    [rest, setRest] = useState(initial?.options.rest ?? 15),
    [turnaround, setTurnaround] = useState(initial?.options.turnaround ?? 5),
    [daily, setDaily] = useState(initial?.options.maxGamesPerDay || 4),
    [pools, setPools] = useState(initial?.topology.rules.poolCount || 2),
    [advance, setAdvance] = useState(
      initial?.topology.rules.advancePerPool || 2,
    ),
    [series, setSeries] = useState(initial?.topology.rules.seriesLength || 1),
    [swissRounds, setSwissRounds] = useState(
      initial?.topology.rules.swissRounds || 3,
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [custom, setCustom] = useState<CustomMatch[]>(
      initial?.topology.rules.customMatches || [],
    ),
    [overlap, setOverlap] = useState(
      (initial?.options.resources || [])
        .flatMap((r) =>
          (r.conflictsWith || []).map(
            (id) =>
              `${r.name} | ${initial?.options.resources.find((other) => other.id === id)?.name || id}`,
          ),
        )
        .join("\n"),
    ),
    [ids, setIds] = useState(
      initial?.topology.teams.map((t) => t.id).join("\n") || "",
    );
  const [step, setStep] = useState(1);
  const [formatsOpen, setFormatsOpen] = useState(false);
  const [highlightedFormat, setHighlightedFormat] = useState<CompetitionFormat | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [customVenue, setCustomVenue] = useState("");
  const [customSurface, setCustomSurface] = useState("");
  const [customAddress, setCustomAddress] = useState("");
  const [newTeam, setNewTeam] = useState("");
  const [dayOverrides, setDayOverrides] = useState<
    Record<string, { startTime: string; endTime: string; closed?: boolean }>
  >(() =>
    Object.fromEntries(
      (initial?.options.windows || []).map((w) => [w.date, w]),
    ),
  );
  const [excludedInitialDays] = useState(() =>
    initial
      ? new Set(
          buildPlayingWindows(date, endDate, start, end)
            .filter(
              (w) =>
                !initial.options.windows.some((saved) => saved.date === w.date),
            )
            .map((w) => w.date),
        )
      : new Set<string>(),
  );
  const dayRows = buildPlayingWindows(date, endDate, start, end).map((w) => ({
    ...w,
    ...dayOverrides[w.date],
    closed: dayOverrides[w.date]?.closed ?? excludedInitialDays.has(w.date),
  }));
  const dayLabel = (value: string) =>
    new Intl.DateTimeFormat(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    }).format(new Date(`${value}T12:00:00Z`));
  const venues = competitionVenues(catalog.resources);
  const selectedNames = fields
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);
  function addSurface(resource: Resource) {
    setFields((current) =>
      [
        ...new Set([...current.split("\n").filter(Boolean), resource.name]),
      ].join("\n"),
    );
    setLocations((current) => ({ ...current, [resource.name]: resource }));
    setLinkedFields((current) => ({
      ...current,
      [resource.name]: resource.id,
    }));
  }
  function removeSurface(name: string) {
    setFields((current) =>
      current
        .split("\n")
        .filter((n) => n !== name)
        .join("\n"),
    );
    setOverlap((current) =>
      current
        .split("\n")
        .filter(
          (line) =>
            !line
              .split("|")
              .map((n) => n.trim())
              .includes(name),
        )
        .join("\n"),
    );
  }
  function goToStep(next: number) {
    setError("");
    if (next > step) {
      const controls = formRef.current?.querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("fieldset:not([hidden]) input, fieldset:not([hidden]) select");
      for (const control of controls || [])
        if (!control.reportValidity()) return;
      if (step === 1 && !title.trim()) {
        setError("Enter a tournament name. Teams can register after you save the draft.");
        return;
      }
      if (step === 2 && !selectedNames.length) {
        setError(
          "Select at least one saved field/court or add a custom playing surface.",
        );
        return;
      }
      if (
        step === 3 &&
        (!dayRows.some((w) => !w.closed) ||
          dayRows.some((w) => !w.closed && w.startTime >= w.endTime))
      ) {
        setError(
          "Choose at least one playing day with an end time after its start time.",
        );
        return;
      }
    }
    setStep(next);
  }
  const [points, setPoints] = useState(
    initial?.topology.rules.points || { win: 3, draw: 1, loss: 0 },
  );
  const [customPools, setCustomPools] = useState<
    { name: string; teamIds: string[]; cycles: 1 | 2 }[]
  >(initial?.topology.rules.customPools || []);
  const [tiers, setTiers] = useState(
    initial?.topology.rules.tiers || [
      { name: "Gold", size: 4 },
      { name: "Silver", size: 4 },
    ],
  );
  const [seriesOverrides, setSeriesOverrides] = useState<
    Record<string, 1 | 3 | 5 | 7>
  >(initial?.topology.rules.seriesByRound || {});
  const [localIds] = useState(() =>
    Array.from({ length: 64 }, () => `entrant_${crypto.randomUUID()}`),
  );
  const [fieldIds] = useState(() =>
    Array.from({ length: 64 }, () => `surface_${crypto.randomUUID()}`),
  );
  const [linkedFields, setLinkedFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      (initial?.options.resources || []).map((r) => [r.name, r.id]),
    ),
  );
  const [travel, setTravel] = useState(initial?.options.travel || 0);
  const [locations, setLocations] = useState<Record<string, Partial<Resource>>>(
    () =>
      Object.fromEntries(
        (initial?.options.resources || []).map((r) => [r.name, r]),
      ),
  );
  const teamNames = names
    .split("\n")
    .map((n) => n.trim())
    .filter(Boolean);
  const teams = teamNames.map((name, i) => ({
    name,
    id: ids.split("\n")[i]?.trim() || localIds[i],
  }));
  const allSources: Source[] = [
    ...teams.map((t) => ({ kind: "team" as const, teamId: t.id })),
    ...customPools.flatMap((p) =>
      p.teamIds.map((_, i) => ({
        kind: "rank" as const,
        group: p.name,
        rank: i + 1,
      })),
    ),
    ...custom.flatMap((m) => [
      { kind: "winner" as const, matchId: m.id },
      { kind: "loser" as const, matchId: m.id },
    ]),
  ];
  const label = (s: Source) =>
    s.kind === "team"
      ? teams.find((t) => t.id === s.teamId)?.name
      : s.kind === "rank"
        ? `${s.group} · Seed ${s.rank}`
        : `${s.kind} of ${s.matchId}`;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (step !== 4) {
      goToStep(step + 1);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const windows = dayRows
        .filter((w) => !w.closed)
        .map(({ date, startTime, endTime }) => ({ date, startTime, endTime }));
      if (!windows.length)
        throw new Error("Choose at least one available playing day.");
      const pairs = overlap
        .split("\n")
        .map((line) => line.split("|").map((s) => s.trim()))
        .filter((p) => p.length === 2 && p.every(Boolean));
      const knownNames = fields
        .split("\n")
        .map((n) => n.trim())
        .filter(Boolean);
      if (
        overlap
          .trim()
          .split("\n")
          .filter(Boolean)
          .some((line) => {
            const pair = line.split("|").map((n) => n.trim());
            return (
              pair.length !== 2 ||
              pair[0] === pair[1] ||
              pair.some((name) => !knownNames.includes(name))
            );
          })
      )
        throw new Error(
          "Each overlapping pair must name two different configured surfaces.",
        );
      const resources = fields
        .split("\n")
        .filter((s) => s.trim())
        .map((line) => {
          const name = line.trim(),
            id =
              linkedFields[name] || fieldIds[fields.split("\n").indexOf(line)];
          if (!id) throw new Error("Use at most 64 playing surfaces.");
          return {
            venueId: locations[name]?.venueId,
            venueName: locations[name]?.venueName,
            surfaceName: locations[name]?.surfaceName,
            address: locations[name]?.address,
            id,
            name,
            conflictsWith: pairs
              .filter((p) => p.includes(name))
              .map((p) => {
                const other = p.find((other) => other !== name)!;
                return (
                  linkedFields[other] ||
                  fieldIds[fields.split("\n").indexOf(other)]
                );
              })
              .filter(Boolean),
          };
        });
      const setup = {
        title,
        registrationFirst: initial ? initial.phase === "registration" : true,
        teams,
        rules: {
          points,
          version: 2 as const,
          format: format as Setup["rules"]["format"],
          timezone,
          poolCount: pools,
          advancePerPool: advance,
          seriesLength: starter ? 1 : (series as 1 | 3 | 5 | 7),
          swissRounds,
          customMatches: custom,
          customPools,
          tiers,
          seriesByRound: starter ? {} : seriesOverrides,
        },
        options: {
          resources,
          travel,
          windows,
          duration,
          rest,
          turnaround,
          maxGamesPerDay: daily,
        },
      };
      createCompetition(setup);
      await onCreate(setup);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create tournament.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="cw cw-setup">
      <header className="cw-header">
        <div>
          <p className="cw-eyebrow">The Squad · Tournament organizer</p>
          <h1>
            {initial ? "Edit tournament setup" : "Create your tournament"}
          </h1>
          <p>
            Start with the tournament details, places to play, and available dates. Save a draft to collect team registrations. When the team list is ready, review it and publish the schedule using Deploy.
          </p>
        </div>
      </header>
      {error && (
        <p role="alert" className="cw-error">
          {error}
        </p>
      )}
      <nav className="cw-stepper" aria-label="Tournament setup steps">
        {[
          "Tournament & teams",
          "Venues & fields",
          "Dates & rules",
          "Review",
        ].map((name, i) => (
          <button
            type="button"
            disabled={i + 1 > step + 1}
            key={name}
            aria-current={step === i + 1 ? "step" : undefined}
            onClick={() => goToStep(i + 1)}
          >
            <span>{i + 1}</span>
            {name}
          </button>
        ))}
      </nav>
      <form ref={formRef} onSubmit={submit} noValidate>
        <fieldset hidden={step !== 1} className="cw-setup-grid">
          <h2 className="cw-setup-section">
            <span>1</span>Tournament details
          </h2>
          <label className="cw-wide">
            Tournament name
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Tournament name"
            />
          </label>
          <div className="cw-format-field">
            <label id="tournament-format-label">Format</label>
            <button type="button" role="combobox" aria-labelledby="tournament-format-label" aria-describedby="format-description" aria-controls="tournament-formats" aria-expanded={formatsOpen} onClick={()=>setFormatsOpen(!formatsOpen)} onKeyDown={event=>{if(event.key==="Escape")setFormatsOpen(false);}} className="cw-format-trigger">
              {starter && format==="single_elimination" ? "Single Elimination Pool" : COMPETITION_FORMATS.find(([id])=>id===format)?.[1]} <span aria-hidden>⌄</span>
            </button>
            {formatsOpen && <div id="tournament-formats" role="listbox" aria-label="Tournament formats" className="cw-format-options" onKeyDown={event=>{if(event.key==="Escape")setFormatsOpen(false);if(["ArrowDown","ArrowUp","Home","End"].includes(event.key)){event.preventDefault();const options=Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button[role="option"]'));const index=options.indexOf(document.activeElement as HTMLButtonElement);const next=event.key==="Home"?0:event.key==="End"?options.length-1:(index+(event.key==="ArrowDown"?1:-1)+options.length)%options.length;options[next]?.focus();}}}>
              {COMPETITION_FORMATS.map(([id,name])=><button type="button" role="option" aria-selected={format===id} aria-disabled={starter&&id!=="single_elimination"} key={id} onFocus={()=>setHighlightedFormat(id)} onMouseEnter={()=>setHighlightedFormat(id)} onClick={()=>{if(starter&&id!=="single_elimination")return;setFormat(id);setFormatsOpen(false);}}>
                <strong>{starter&&id==="single_elimination"?"Single Elimination Pool":name}{starter&&id!=="single_elimination"?" · Locked":""}</strong>
                {highlightedFormat===id&&<span role="tooltip">{FORMAT_DESCRIPTIONS[id]}</span>}
              </button>)}
            </div>}
            <p id="format-description" className="cw-format-description">{FORMAT_DESCRIPTIONS[format]}</p>
          </div>
          <label>
            Timezone
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
            >
              {[
                ...new Set([
                  timezone,
                  "UTC",
                  ...Intl.supportedValuesOf("timeZone"),
                ]),
              ]
                .sort()
                .map((zone) => (
                  <option key={zone} value={zone}>
                    {zone.replaceAll("_", " ")}
                  </option>
                ))}
            </select>
          </label>
          <section className="cw-wide">
            <h3>Teams · optional until deployment</h3>
            <p>{starter ? "Add teams now or save a draft and add them later. Confirm the team list when you deploy. Online registration is available on upgraded plans." : "Create the draft with no teams, then open Registration & Access to publish a signup form and select custom or saved waivers. Confirm the eligible team list when you deploy."}</p>
            <div className="cw-inline cw-team-entry">
              <label>
                Team name
                <input
                  value={newTeam}
                  onChange={(e) => setNewTeam(e.target.value)}
                  placeholder="Enter a team name"
                />
              </label>
              <button
                type="button"
                onClick={() => {
                  if (newTeam.trim()) {
                    if (teams.length >= 64) {
                      setError("A tournament supports up to 64 teams.");
                      return;
                    }
                    if (
                      teamNames.some(
                        (name) =>
                          name.toLowerCase() === newTeam.trim().toLowerCase(),
                      )
                    ) {
                      setError("That team name is already entered.");
                      return;
                    }
                    setIds(
                      [
                        ...teams.map((team) => team.id),
                        `entrant_${crypto.randomUUID()}`,
                      ].join("\n"),
                    );
                    setNames([...teamNames, newTeam.trim()].join("\n"));
                    setNewTeam("");
                  }
                }}
              >
                Add team
              </button>
            </div>
            <p>
              Link saved teams to check their bookings across competitions, or
              keep a new tournament entrant.
            </p>
            {teams.map((team, i) => (
              <div className="cw-inline cw-team-entry" key={team.id}>
                <label className="cw-team-link">
                  {team.name}
                  <select
                    aria-label={`Team identity for ${team.name}`}
                    value={
                      catalog.teams.some((saved) => saved.id === team.id)
                        ? team.id
                        : ""
                    }
                    onChange={(e) => {
                      const linked = teams.map((entrant) => entrant.id);
                      linked[i] =
                        e.target.value || `entrant_${crypto.randomUUID()}`;
                      if (new Set(linked).size !== linked.length) {
                        setError("That saved team is already selected.");
                        return;
                      }
                      setIds(linked.join("\n"));
                      setError("");
                    }}
                  >
                    <option value="">New tournament entrant</option>
                    {catalog.teams.map((saved) => (
                      <option key={saved.id} value={saved.id}>
                        {saved.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  aria-label={`Remove ${team.name}`}
                  onClick={() => {
                    setNames(teamNames.filter((_, j) => j !== i).join("\n"));
                    setIds(
                      teams
                        .filter((_, j) => j !== i)
                        .map((t) => t.id)
                        .join("\n"),
                    );
                  }}
                >
                  Remove
                </button>
              </div>
            ))}
          </section>
        </fieldset>
        <fieldset hidden={step !== 2} className="cw-setup-grid">
          <h2 className="cw-setup-section">
            <span>2</span>Venues and playing surfaces
          </h2>
          <section className="cw-wide cw-panel">
            <h3>{demo ? "Example facilities · demo only" : "Choose saved facilities"}</h3>
            <p>
              Select fields or courts from any number of saved venues. Your selections stay selected across venues.
            </p>
            {!catalog.resources.length && (
              <p>
                No saved playing surfaces are available. Add a custom venue
                below, or add fields/courts in Facilities and reload setup.
              </p>
            )}
            {venues.map((venue) => (
              <fieldset key={venue.id} className="cw-saved-venue">
                <legend>{venue.name}</legend>
                {venue.resources.map((resource) => (
                <label className="cw-check" key={resource.id}>
                  <input
                    type="checkbox"
                    checked={
                      Object.values(linkedFields).includes(resource.id) &&
                      selectedNames.some((n) => linkedFields[n] === resource.id)
                    }
                    onChange={(e) =>
                      e.target.checked
                        ? addSurface(resource)
                        : removeSurface(
                            selectedNames.find(
                              (n) => linkedFields[n] === resource.id,
                            ) || resource.name,
                          )
                    }
                  />
                  {resource.surfaceName || resource.name}
                </label>
                ))}
              </fieldset>
            ))}
          </section>
          <section className="cw-wide cw-panel">
            <h3>Add a custom venue / field</h3>
            <div className="cw-setup-grid">
              <label>
                Venue name
                <input
                  value={customVenue}
                  onChange={(e) => setCustomVenue(e.target.value)}
                  placeholder="e.g. North Arena"
                />
              </label>
              <label>
                Field or court name
                <input
                  value={customSurface}
                  onChange={(e) => setCustomSurface(e.target.value)}
                  placeholder="e.g. Court 1"
                />
              </label>
              <label className="cw-wide">
                Address (optional)
                <input
                  value={customAddress}
                  onChange={(e) => setCustomAddress(e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              disabled={!customVenue.trim() || !customSurface.trim()}
              onClick={() => {
                const name = `${customVenue.trim()} — ${customSurface.trim()}`;
                if (selectedNames.includes(name)) {
                  setError("That playing surface is already selected.");
                  return;
                }
                addSurface({
                  id: `surface_${crypto.randomUUID()}`,
                  name,
                  venueName: customVenue.trim(),
                  surfaceName: customSurface.trim(),
                  address: customAddress.trim(),
                });
                setCustomSurface("");
                setError("");
              }}
            >
              Add playing surface
            </button>
          </section>
          <section className="cw-wide">
            <h3>Selected fields and courts ({selectedNames.length})</h3>
            {selectedNames.map((name) => (
              <div className="cw-selected-resource" key={name}>
                <div>
                  <strong>{name}</strong>
                  <p>{locations[name]?.address}</p>
                </div>
                <button
                  type="button"
                  onClick={() => removeSurface(name)}
                  aria-label={`Remove ${name}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </section>
        </fieldset>
        <fieldset hidden={step !== 3} className="cw-setup-grid">
          <h2 className="cw-setup-section">
            <span>3</span>Available dates and times
          </h2>
          <label>
            Start date
            <input
              type="date"
              required
              value={date}
              onChange={(e) => {
                setDate(e.target.value);
                if (endDate < e.target.value) setEndDate(e.target.value);
              }}
            />
          </label>
          <label>
            End date
            <input
              type="date"
              required
              min={date}
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label>
            Daily start
            <input
              type="time"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label>
            Daily end
            <input
              type="time"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <section className="cw-wide">
            <h3>Playing hours for each day</h3>
            <p>
              Set a different start and finish for each day. Switch off days
              when no games can be played. Times use {timezone}.
            </p>
            <button
              type="button"
              onClick={() =>
                setDayOverrides(
                  Object.fromEntries(
                    dayRows.map((w) => [
                      w.date,
                      { startTime: start, endTime: end, closed: false },
                    ]),
                  ),
                )
              }
            >
              Apply daily hours to all days
            </button>
            {dayRows.map((w) => (
              <div className="cw-day-row" key={w.date}>
                <label className="cw-check">
                  <input
                    type="checkbox"
                    aria-label={`Play on ${w.date}`}
                    checked={!w.closed}
                    onChange={(e) =>
                      setDayOverrides({
                        ...dayOverrides,
                        [w.date]: { ...w, closed: !e.target.checked },
                      })
                    }
                  />
                  Play on {dayLabel(w.date)}
                </label>
                <label>
                  Start time · {w.date}
                  <input
                    type="time"
                    value={w.startTime}
                    disabled={w.closed}
                    onChange={(e) =>
                      setDayOverrides({
                        ...dayOverrides,
                        [w.date]: { ...w, startTime: e.target.value },
                      })
                    }
                  />
                </label>
                <label>
                  End time · {w.date}
                  <input
                    type="time"
                    value={w.endTime}
                    disabled={w.closed}
                    onChange={(e) =>
                      setDayOverrides({
                        ...dayOverrides,
                        [w.date]: { ...w, endTime: e.target.value },
                      })
                    }
                  />
                </label>
              </div>
            ))}
          </section>
          <label>
            Game duration (minutes)
            <input
              type="number"
              min="1"
              max="720"
              value={duration}
              onChange={(e) => setDuration(+e.target.value)}
            />
          </label>
          <label>
            Minimum team rest (minutes)
            <input
              type="number"
              min="0"
              value={rest}
              onChange={(e) => setRest(+e.target.value)}
            />
          </label>
          <label>
            Field turnaround (minutes)
            <input
              type="number"
              min="0"
              value={turnaround}
              onChange={(e) => setTurnaround(+e.target.value)}
            />
          </label>
          <label>
            Minimum gap when changing venues (minutes)
            <input
              type="number"
              min="0"
              max="720"
              value={travel}
              onChange={(e) => setTravel(Number(e.target.value))}
            />
            <small>
              Includes rest and travel. Uses the larger of this value and
              minimum team rest.
            </small>
          </label>
          <label>
            Maximum games per team per day
            <input
              type="number"
              min="1"
              max="100"
              value={daily}
              onChange={(e) => setDaily(+e.target.value)}
            />
          </label>
          {format.includes("pool") && (
            <>
              <label>
                Number of pools
                <input
                  type="number"
                  min="2"
                  value={pools}
                  onChange={(e) => setPools(+e.target.value)}
                />
              </label>
              {format !== "pool_play" && (
                <label>
                  Advance from each pool
                  <input
                    type="number"
                    min="1"
                    value={advance}
                    onChange={(e) => setAdvance(+e.target.value)}
                  />
                </label>
              )}
            </>
          )}
          {!starter &&
            ![
              "round_robin",
              "double_round_robin",
              "pool_play",
              "swiss",
            ].includes(format) && (
              <label>
                Elimination series length
                <select
                  value={series}
                  onChange={(e) =>
                    setSeries(Number(e.target.value) as 1 | 3 | 5 | 7)
                  }
                >
                  {[1, 3, 5, 7].map((n) => (
                    <option key={n} value={n}>
                      Best of {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
          {format === "swiss" && (
            <label>
              Swiss rounds
              <input
                type="number"
                min="1"
                value={swissRounds}
                onChange={(e) => setSwissRounds(+e.target.value)}
              />
            </label>
          )}
          {format === "tiered_playoffs" && (
            <section className="cw-wide">
              <h2>Playoff divisions</h2>
              <p>
                After the first games, teams are ranked and placed into these divisions for your review. Each division has its own champion. Division sizes must add up to all {teams.length} teams.
              </p>
              {tiers.map((tier, i) => (
                <div key={i} className="cw-inline">
                  <label>
                    Division name
                    <input
                      value={tier.name}
                      onChange={(e) =>
                        setTiers(
                          tiers.map((t, j) =>
                            j === i ? { ...t, name: e.target.value } : t,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Teams
                    <input
                      type="number"
                      min="2"
                      value={tier.size}
                      onChange={(e) =>
                        setTiers(
                          tiers.map((t, j) =>
                            j === i ? { ...t, size: +e.target.value } : t,
                          ),
                        )
                      }
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => setTiers(tiers.filter((_, j) => j !== i))}
                  >
                    Remove division
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setTiers([
                    ...tiers,
                    {
                      name:
                        tiers.length === 2
                          ? "Bronze"
                          : `Division ${tiers.length + 1}`,
                      size: 2,
                    },
                  ])
                }
              >
                Add division
              </button>
            </section>
          )}
          <details className="cw-wide">
            <summary>Standings points</summary>
            {(["win", "draw", "loss"] as const).map((key) => (
              <label key={key}>
                {key}
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={points[key]}
                  onChange={(e) =>
                    setPoints({ ...points, [key]: Number(e.target.value) })
                  }
                />
              </label>
            ))}
          </details>
          <details className="cw-wide">
            <summary>Series length by elimination round</summary>
            {(() => {
              try {
                const topology = buildTopology(teams, {
                  version: 2,
                  format,
                  timezone,
                  poolCount: pools,
                  advancePerPool: advance,
                  swissRounds,
                  tiers,
                  customMatches: custom,
                  customPools,
                });
                return [
                  ...new Set(
                    topology.matches
                      .filter((m) => !m.pool)
                      .map((m) => `${m.stage}:${m.round}`),
                  ),
                ].map((key) => (
                  <label key={key}>
                    {key.replace(/:(\d+)$/, " · Round $1")}
                    <select
                      disabled={starter}
                      value={seriesOverrides[key] || series}
                      onChange={(e) =>
                        setSeriesOverrides({
                          ...seriesOverrides,
                          [key]: Number(e.target.value) as 1 | 3 | 5 | 7,
                        })
                      }
                    >
                      {[1, 3, 5, 7].map((n) => (
                        <option key={n} value={n}>
                          Best of {n}
                        </option>
                      ))}
                    </select>
                  </label>
                ));
              } catch {
                return (
                  <p>
                    Complete the format and team settings to customize round
                    lengths.
                  </p>
                );
              }
            })()}
          </details>
          <details className="cw-wide">
            <summary>Overlapping playing surfaces</summary>
            <p>
              Select surfaces that share physical space and cannot host games at
              the same time.
            </p>
            {selectedNames.flatMap((left, i) =>
              selectedNames.slice(i + 1).map((right) => {
                const pair = `${left} | ${right}`;
                const pairs = overlap.split("\n").filter(Boolean);
                const checked = pairs.some(
                  (p) =>
                    p
                      .split("|")
                      .map((n) => n.trim())
                      .includes(left) &&
                    p
                      .split("|")
                      .map((n) => n.trim())
                      .includes(right),
                );
                return (
                  <label className="cw-check" key={pair}>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setOverlap(
                          e.target.checked
                            ? [...pairs, pair].join("\n")
                            : pairs
                                .filter(
                                  (p) =>
                                    !(
                                      p
                                        .split("|")
                                        .map((n) => n.trim())
                                        .includes(left) &&
                                      p
                                        .split("|")
                                        .map((n) => n.trim())
                                        .includes(right)
                                    ),
                                )
                                .join("\n"),
                        )
                      }
                    />
                    {left} and {right}
                  </label>
                );
              }),
            )}
            <p>
              Use this when a full field and a subdivision cannot be booked
              simultaneously.
            </p>
          </details>
          {format === "custom" && (
            <section className="cw-wide">
              <h2>Guided advancement builder</h2>
              <h3>Round-robin stages</h3>
              {customPools.map((pool, index) => (
                <div key={index} className="cw-custom-row">
                  <button
                    type="button"
                    onClick={() =>
                      setCustomPools(customPools.filter((_, i) => i !== index))
                    }
                  >
                    Remove stage
                  </button>
                  <label>
                    Stage name
                    <input
                      value={pool.name}
                      onChange={(e) =>
                        setCustomPools(
                          customPools.map((p, i) =>
                            i === index ? { ...p, name: e.target.value } : p,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Meetings per pair
                    <select
                      value={pool.cycles}
                      onChange={(e) =>
                        setCustomPools(
                          customPools.map((p, i) =>
                            i === index
                              ? {
                                  ...p,
                                  cycles: Number(e.target.value) as 1 | 2,
                                }
                              : p,
                          ),
                        )
                      }
                    >
                      <option value="1">Once</option>
                      <option value="2">Twice</option>
                    </select>
                  </label>
                  <label>
                    Teams in this stage
                    <select
                      multiple
                      value={pool.teamIds}
                      onChange={(e) =>
                        setCustomPools(
                          customPools.map((p, i) =>
                            i === index
                              ? {
                                  ...p,
                                  teamIds: Array.from(
                                    e.target.selectedOptions,
                                    (o) => o.value,
                                  ),
                                }
                              : p,
                          ),
                        )
                      }
                    >
                      {teams.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setCustomPools([
                    ...customPools,
                    {
                      name: `Group ${customPools.length + 1}`,
                      teamIds: teams.map((t) => t.id),
                      cycles: 1,
                    },
                  ])
                }
              >
                Add round-robin stage
              </button>
              <p>
                Add matches, then choose a team or the winner/loser of an
                earlier match.
              </p>
              {custom.map((match, i) => (
                <div key={match.id} className="cw-custom-row">
                  <strong>Match {i + 1}</strong>
                  <button
                    type="button"
                    onClick={() =>
                      setCustom(custom.filter((m) => m.id !== match.id))
                    }
                  >
                    Remove match
                  </button>
                  <div>
                    <label>
                      Stage
                      <input
                        value={match.stage}
                        onChange={(e) =>
                          setCustom(
                            custom.map((m) =>
                              m.id === match.id
                                ? { ...m, stage: e.target.value }
                                : m,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Round
                      <input
                        type="number"
                        min="1"
                        value={match.round}
                        onChange={(e) =>
                          setCustom(
                            custom.map((m) =>
                              m.id === match.id
                                ? { ...m, round: +e.target.value }
                                : m,
                            ),
                          )
                        }
                      />
                    </label>
                    {match.sources.map((source, side) => (
                      <label key={side}>
                        Participant {side + 1}
                        <select
                          value={JSON.stringify(source)}
                          onChange={(e) =>
                            setCustom(
                              custom.map((m) =>
                                m.id === match.id
                                  ? {
                                      ...m,
                                      sources: m.sources.map((s, j) =>
                                        j === side
                                          ? JSON.parse(e.target.value)
                                          : s,
                                      ) as [Source, Source],
                                    }
                                  : m,
                              ),
                            )
                          }
                        >
                          {allSources
                            .filter(
                              (s) =>
                                s.kind === "team" ||
                                s.kind === "rank" ||
                                custom.findIndex((m) => m.id === s.matchId) < i,
                            )
                            .map((s) => (
                              <option
                                key={JSON.stringify(s)}
                                value={JSON.stringify(s)}
                              >
                                {label(s)}
                              </option>
                            ))}
                        </select>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <button
                type="button"
                disabled={teams.length < 2}
                onClick={() =>
                  setCustom([
                    ...custom,
                    {
                      id: `custom_${crypto.randomUUID()}`,
                      stage: "Championship",
                      round: 1,
                      sources: [
                        { kind: "team", teamId: teams[0].id },
                        { kind: "team", teamId: teams[1].id },
                      ],
                    },
                  ])
                }
              >
                Add match
              </button>
            </section>
          )}
        </fieldset>
        <fieldset hidden={step !== 4} className="cw-setup-grid">
          <h2 className="cw-setup-section">
            <span>4</span>Review your tournament
          </h2>
          <section className="cw-wide cw-panel">
            <h3>{title || "Tournament name required"}</h3>
            <p>
              {COMPETITION_FORMATS.find(([id]) => id === format)?.[1]} ·{" "}
              {teams.length} teams · {timezone}
            </p>
            <h3>Venues and fields</h3>
            {selectedNames.map((name) => (
              <p key={name}>{name}</p>
            ))}
            <h3>Playing days</h3>
            {dayRows
              .filter((w) => !w.closed)
              .map((w) => (
                <p key={w.date}>
                  {dayLabel(w.date)}: {w.startTime}–{w.endTime}
                </p>
              ))}
            <p>
              {duration} minute games · {rest} minute rest · {travel} minute
              venue-change gap.
            </p>
            <p>
              Create the draft, collect registrations, then confirm the team list and deploy the schedule. Registration, officials and portal controls are in the
              tournament hub.
            </p>
          </section>
        </fieldset>
        <div className="cw-step-actions">
          {step > 1 && (
            <button
              type="button"
              disabled={busy}
              onClick={() => goToStep(step - 1)}
            >
              Back
            </button>
          )}
          {step < 4 ? (
            <button
              type="button"
              className="cw-primary"
              onClick={(event) => {
                event.preventDefault();
                goToStep(step + 1);
              }}
            >
              Continue to step {step + 1}
            </button>
          ) : (
            <button
              key="submit-setup"
              type="submit"
              className="cw-primary"
              disabled={busy}
            >
              {busy
                ? "Validating…"
                : initial
                  ? "Save setup"
                  : "Create draft tournament"}
            </button>
          )}
        </div>
      </form>
    </section>
  );
}
