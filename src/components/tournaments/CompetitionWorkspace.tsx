"use client";
import {gameResultSummary} from '@/lib/game-result-summary';
import { playoffSeeds } from "@/lib/competition/playoffs";
import BrandLogo from "@/components/BrandLogo";
import {
  competitionVenues,
  surfaceLabel,
  venueKey,
} from "@/lib/competition/venues";
import NextImage from "next/image";
import React, { useMemo, useState, useEffect, useRef } from "react";
import {
  Trophy,
  CalendarDays,
  MapPin,
  Share2,
  GitBranch,
  List,
  Grid2X2,
  Search,
  X,
  Printer,
} from "lucide-react";
import {
  type CompetitionDocument,
  sourceLabel,
  tournamentGames,
} from "@/lib/competition/document";
import { resolveCompetition } from "@/lib/competition/results";
import { qrImage, snapshotHtml, downloadFile } from "@/lib/competition/export";
import { COMPETITION_FORMATS } from "@/lib/competition/types";
import "./competition-workspace.css";
import BracketConnectors from "./BracketConnectors";

type Action = (
  action: string,
  payload?: Record<string, unknown>,
) => Promise<void>;
type Props = {
  document: CompetitionDocument;
  onAction?: Action;
  publicUrl?: string;
  embedUrl?: string;
  registrationUrl?: string;
  demo?: boolean;
  initialTab?: string;
  onCredential?: (revoke: boolean) => Promise<string | void>;
  canScore?: boolean;
};
export default function CompetitionWorkspace({
  document: doc,
  onAction,
  publicUrl,
  embedUrl,
  registrationUrl,
  demo,
  initialTab = "bracket",
  onCredential,
  canScore = false,
}: Props) {
  const [tab, setTab] = useState(initialTab),
    [search, setSearch] = useState(""),
    [stage, setStage] = useState(""),
    [round, setRound] = useState<number | null>(null),
    [list, setList] = useState(false),
    [share, setShare] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null),
    [editMode, setEditMode] = useState<"score" | "move">("score"),
    [score1, setScore1] = useState("0"),
    [score2, setScore2] = useState("0"),
    [winner, setWinner] = useState("");
  const [deploymentReview, setDeploymentReview] = useState(false);
  const [rosterConfirmed, setRosterConfirmed] = useState(false);
  const [playoffReview, setPlayoffReview] = useState(false);
  const [qualifiers, setQualifiers] = useState(2);
  const [advanceAll, setAdvanceAll] = useState(true);
  const [brackets, setBrackets] = useState(1);
  const [finalDate, setFinalDate] = useState(doc.options.windows.at(-1)?.date ? new Date(Date.parse(`${doc.options.windows.at(-1)!.date}T12:00:00Z`) + 86400000).toISOString().slice(0, 10) : "");
  const [finalStart, setFinalStart] = useState("09:00");
  const [finalEnd, setFinalEnd] = useState("21:00");
  const [seedsConfirmed, setSeedsConfirmed] = useState(false);
  const playoffPreview = useMemo(() => {
    try { return { rows: playoffSeeds(doc, advanceAll ? "all" : qualifiers), error: "" }; }
    catch (error) { return { rows: [], error: error instanceof Error ? error.message : "Complete preliminary play first." }; }
  }, [doc, qualifiers, advanceAll]);
  const [venue, setVenue] = useState("");
  const venues = competitionVenues(doc.options.resources);
  const selectedVenue = tab === "map" ? venue || venues[0]?.id : venue;
  const venueResources = doc.options.resources.filter(
    (r) => !selectedVenue || venueKey(r) === selectedVenue,
  );
  const activeVenue = venues.find((v) => v.id === selectedVenue);
  const [day, setDay] = useState(doc.options.windows[0]?.date || ""),
    [field, setField] = useState(""),
    [mapTime, setMapTime] = useState(12),
    [moveDate, setMoveDate] = useState(day),
    [moveTime, setMoveTime] = useState("09:00"),
    [moveField, setMoveField] = useState(doc.options.resources[0]?.id || "");
  const [rankings, setRankings] = useState<Record<string, string[]> | null>(
      null,
    ),
    [scoreCode, setScoreCode] = useState("");
  const { states, standings, placements } = useMemo(
    () => resolveCompetition(doc.topology, doc.results, doc.approvals),
    [doc],
  );
  const bracketRef = useRef<HTMLDivElement>(null);
  const edges = useMemo(
    () =>
      doc.topology.matches.flatMap((m) =>
        m.sources.flatMap((s, i) =>
          s.kind === "winner" || s.kind === "loser"
            ? [
                {
                  from: s.matchId,
                  to: m.id,
                  side: i as 0 | 1,
                  loser: s.kind === "loser",
                },
              ]
            : [],
        ),
      ),
    [doc.topology],
  );
  const games = useMemo(() => tournamentGames(doc).map(g => ({...g, ...doc.officialAssignments?.[g.id]})), [doc]);
  const stages = [...new Set(doc.topology.matches.map((m) => m.stage))];
  const activeStage = stages.includes(stage) ? stage : stages[0];
  const rounds = [
    ...new Set(
      doc.topology.matches
        .filter((m) => m.stage === activeStage)
        .map((m) => m.round),
    ),
  ];
  const playoffDivision = (index: number) => {
    if (brackets === 1) return "Championship";
    let end = 0;
    for (let i = 0; i < brackets; i++) {
      end += Math.floor(playoffPreview.rows.length / brackets) + (i < playoffPreview.rows.length % brackets ? 1 : 0);
      if (index < end) return ["Gold", "Silver", "Bronze"][i];
    }
    return "";
  };
  const roundLabel = (r: number) => {
    const matches = doc.topology.matches.filter(m => m.stage === activeStage);
    return !matches.some(m => m.pool) && r === Math.max(...matches.map(m => m.round)) && matches.filter(m => m.round === r).length === 1 ? "Final" : `Round ${r}`;
  };
  const activeRound = round && rounds.includes(round) ? round : rounds[0];
  const teamName = (id: string | null) =>
    doc.topology.teams.find((t) => t.id === id)?.name || "Awaiting result";
  const visibleGames = games.filter(
    (g) =>
      (!search ||
        `${g.team1} ${g.team2} ${g.round} ${g.location}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (!field || g.resourceId === field),
  );
  async function run(action: string, payload: Record<string, unknown> = {}) {
    if (!onAction) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await onAction(action, payload);
      setSelected(null);
      setNotice("Saved.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }
  function openGame(id: string, mode: "score" | "move") {
    const game = games.find((g) => g.id === id);
    setError("");
    setSelected(id);
    setEditMode(mode);
    setScore1(String(game?.score1 || 0));
    setScore2(String(game?.score2 || 0));
    setWinner("");
    setMoveDate(game?.date || day);
    setMoveTime(game?.time || "09:00");
    setMoveField(game?.resourceId || doc.options.resources[0].id);
  }
  const selectedSlot = doc.schedule.find((g) => g.id === selected);
  const selectedMatch = doc.topology.matches.find(
    (m) => m.id === (selectedSlot?.matchId || selected?.replace(/_g\d+$/, "")),
  );
  const selectedNumber =
    selectedSlot?.game || Number(selected?.match(/_g(\d+)$/)?.[1] || 1);
  const organizer = !!onAction && !canScore;
  const seedingOpen = rankings !== null;
  const dayWindow = doc.options.windows.find((w) => w.date === day);
  const hourStart = Number(dayWindow?.startTime.slice(0, 2) || 0);
  const hourEnd = Math.min(
    24,
    Number(dayWindow?.endTime.slice(0, 2) || 23) + 1,
  );
  useEffect(() => {
    if (!selected && !share && !seedingOpen && !deploymentReview && !playoffReview) return;
    const previous = window.document.activeElement as HTMLElement | null;
    const overlay = window.document.querySelector(".cw-overlay");
    const elements = () =>
      Array.from(
        overlay?.querySelectorAll<HTMLElement>(
          "button:not([disabled]),input,select,textarea,a[href]",
        ) || [],
      );
    elements()[0]?.focus();
    const listener = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelected(null);
        setShare(false);
        setRankings(null);
        setDeploymentReview(false);
        setPlayoffReview(false);
      }
      if (event.key === "Tab") {
        const items = elements(),
          first = items[0],
          last = items.at(-1);
        if (event.shiftKey && window.document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && window.document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.document.addEventListener("keydown", listener);
    return () => {
      window.document.removeEventListener("keydown", listener);
      previous?.focus();
    };
  }, [selected, share, seedingOpen, deploymentReview, playoffReview]);
  const matchCard = (match: (typeof doc.topology.matches)[number]) => {
    const state = states.get(match.id)!;
    const slots = doc.schedule.filter((g) => g.matchId === match.id);
    const first = state.complete ? slots[0] :
      slots.find(
        (g) =>
          !doc.results.some(
            (r) => r.matchId === g.matchId && r.game === g.game,
          ),
      ) || slots[0];
    const game = games.find((g) => g.id === first?.id);
    const names = state.teamIds.map((id, i) =>
      id ? teamName(id) : sourceLabel(match.sources[i], doc.topology),
    );
    if (search && !names.join(" ").toLowerCase().includes(search.toLowerCase()))
      return null;
    return (
      <article
        className="cw-match"
        key={match.id}
        data-testid="competition-match"
        data-match-id={match.id}
      >
        <header>
          <span>Match {doc.topology.matches.indexOf(match) + 1}</span>
          <span>
            {state.complete
              ? "Final"
              : match.resetOf
                ? "If needed"
                : doc.status === "draft"
                  ? "Draft"
                  : "Upcoming"}
          </span>
        </header>
        <div className="cw-match-meta">
          <MapPin size={13} />
          {game?.location || "Unplaced"}
          {game?.refereeName && <span>Referee: {game.refereeName}</span>}
          <span>
            {first ? `${first.date} · ${first.time}` : "Time not assigned"}
          </span>
        </div>
        {names.map((name, i) => (
          <div
            key={i}
            className={`cw-team ${state.winner && state.winner === state.teamIds[i] ? "cw-winner" : ""}`}
          >
            <span className="cw-team-name">{name}</span>
            <strong>
              {match.bestOf > 1
                ? state.wins[i]
                : game?.isCompleted
                  ? i === 0
                    ? game.score1
                    : game.score2
                  : "–"}
            </strong>
          </div>
        ))}
        <footer>
          {match.bestOf > 1 && (
            <span>
              Best of {match.bestOf} ·{" "}
              {state.complete ? "Series final" : `Game ${first?.game || 1}`}
            </span>
          )}
          {onAction && (
            <div className="cw-inline">
              {(organizer || canScore) && slots.length > 0 && (
                <button
                  disabled={
                    busy ||
                    state.inactive ||
                    doc.status !== "published" ||
                    !state.teamIds.every(Boolean)
                  }
                  onClick={() => openGame(first.id, "score")}
                >
                  Enter score
                </button>
              )}
              {organizer && (
                <button
                  disabled={busy}
                  onClick={() =>
                    openGame(first?.id || `${match.id}_g1`, "move")
                  }
                >
                  Schedule game
                </button>
              )}
            </div>
          )}
        </footer>
      </article>
    );
  };
  const nav = [
    ["pools", "Pools", Grid2X2],
    ["bracket", "Bracket", GitBranch],
    ["schedule", "Schedule", CalendarDays],
    ["map", "Map", MapPin],
  ] as const;
  return (
    <section
      className={organizer && !demo ? "cw cw-managed" : "cw"}
      aria-label="Tournament workspace"
    >
      <div className="cw-brand">
        <BrandLogo variant="light-background" className="h-9 w-28" />
        <span>Tournament center</span>
      </div>
      <header className="cw-header">
        <div className="cw-title">
          <span className="cw-trophy">
            <Trophy />
          </span>
          <div>
            <p className="cw-eyebrow">
              The Squad ·{" "}
              {
                COMPETITION_FORMATS.find(
                  ([id]) => id === doc.topology.rules.format,
                )?.[1]
              }
            </p>
            <h1>{doc.title}</h1>
            <p>
              {doc.topology.teams.length} teams · {doc.topology.rules.timezone}
            </p>
          </div>
        </div>
        <div className="cw-inline">
          <span
            className={`cw-status ${doc.status === "published" ? "cw-live" : ""}`}
          >
            {demo ? "Local demo" : doc.status}
          </span>
          <button aria-label="Share tournament" onClick={() => setShare(true)}>
            <Share2 size={18} /> Share
          </button>
        </div>
      </header>
      {organizer && (
        <div className="cw-toolbar">
          <button
            disabled={busy || doc.status === "published" || doc.phase === "registration"}
            hidden={doc.phase === "registration"}
            onClick={() => run("generate")}
          >
            Generate schedule
          </button>
          {doc.phase === "registration" ? (
            <button className="cw-primary" disabled={busy || doc.topology.teams.length < 2} onClick={() => { setRosterConfirmed(false); setDeploymentReview(true); }}>Review teams & deploy</button>
          ) : doc.status === "draft" ? (
            <button
              className="cw-primary"
              disabled={busy || !doc.schedule.length}
              onClick={() => run("publish")}
            >
              Validate & publish
            </button>
          ) : (
            <button
              disabled={busy || doc.results.length > 0}
              onClick={() => run("unpublish")}
            >
              Return to draft
            </button>
          )}
          {doc.status === "published" && !doc.finalsCreated && Object.keys(standings).length > 0 && <button disabled={busy} onClick={() => { setSeedsConfirmed(false); setPlayoffReview(true); }}>Create Finals/Playoffs</button>}
          {doc.finalsCreated && <button disabled={busy || doc.results.some(result => !doc.topology.matches.find(match => match.id === result.matchId)?.pool)} onClick={() => run("remove-unplayed-playoffs")}>Remove unplayed playoffs</button>}
          {registrationUrl && <a className="cw-button" href={registrationUrl}>Registration &amp; Access</a>}
          {doc.phase !== "registration" && doc.results.length === 0 && <button disabled={busy} onClick={() => run("reopen-registration")}>Return to registration draft</button>}
          <span>
            {doc.schedule.length} scheduled games · {doc.results.length} results
          </span>
        </div>
      )}
      {organizer && (
        <p className="cw-workflow-hint">
          {doc.phase === "registration" ? "Collect registrations and confirm payments in Registration & Access. Review the eligible team list, then deploy to generate and publish the schedule." : doc.status === "draft"
            ? "Generate a schedule, review the games and venues, then publish when ready."
            : "Choose a game to enter its score or change its scheduled time and field."}
        </p>
      )}
      {error && (
        <div role="alert" className="cw-error">
          {error}
        </div>
      )}
      {notice && (
        <p role="status" className="cw-notice">
          {notice}
        </p>
      )}
      {doc.status === "draft" && (
        <p className="cw-banner">
          Draft — changes are not visible on the public tournament link.
        </p>
      )}
      <div className="cw-filters">
        <label className="cw-search">
          <Search size={17} />
          <input
            aria-label="Search teams or matches"
            placeholder="Search teams, matches or fields"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        {tab === "bracket" && (
          <button
            aria-label={list ? "Show bracket view" : "Show list view"}
            aria-pressed={list}
            onClick={() => setList(!list)}
          >
            {list ? <GitBranch size={18} /> : <List size={18} />}
            {list ? "Bracket view" : "List view"}
          </button>
        )}
      </div>
      <nav className="cw-nav" aria-label="Tournament views">
        {nav
          .filter(
            ([key]) =>
              key !== "pools" || Object.keys(doc.topology.groups).length > 0,
          )
          .map(([key, label, Icon]) => (
            <button
              key={key}
              aria-current={tab === key ? "page" : undefined}
              onClick={() => {
                if (key === "map" && field)
                  setVenue(
                    venueKey(doc.options.resources.find((r) => r.id === field)),
                  );
                setTab(key);
              }}
            >
              <Icon size={19} />
              {label}
            </button>
          ))}
      </nav>
      {tab === "bracket" && (
        <div>
          <div className="cw-tabs" aria-label="Bracket stages">
            {stages.map((s) => (
              <button
                key={s}
                className={s === activeStage ? "cw-selected" : ""}
                onClick={() => {
                  setStage(s);
                  setRound(null);
                }}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="cw-tabs" aria-label="Rounds">
            {rounds.map((r) => (
              <button
                key={r}
                className={r === activeRound ? "cw-selected" : ""}
                onClick={() => setRound(r)}
              >
                {roundLabel(r)}
              </button>
            ))}
          </div>
          <div
            ref={bracketRef}
            className={`cw-bracket ${list ? "cw-list" : ""}`}
          >
            {!list && (
              <BracketConnectors
                container={bracketRef}
                edges={edges}
                layoutKey={`${activeStage}:${activeRound}:${search}`}
              />
            )}{" "}
            {(list ? rounds : rounds.filter((r) => r >= activeRound)).map(
              (r) => (
                <section className="cw-round" key={r}>
                  <h2>{roundLabel(r)}</h2>
                  <div>
                    {doc.topology.matches
                      .filter((m) => m.stage === activeStage && m.round === r)
                      .map(matchCard)}
                  </div>
                </section>
              ),
            )}
          </div>
          {Object.keys(placements).length > 0 && (
            <section className="cw-panel">
              <h2>Final placements</h2>
              <ol>
                {Object.entries(placements).map(([rank, id]) => (
                  <li key={rank}>
                    {rank}. {teamName(id)}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>
      )}
      {tab === "pools" && (
        <div className="cw-pools">
          {organizer && !doc.finalsCreated && doc.topology.rules.format !== "swiss" &&
            doc.topology.matches.some(match => match.sources.some(source => source.kind === "rank")) && (
              <div className="cw-inline">
                <button
                  disabled={busy}
                  onClick={() =>
                    setRankings(
                      Object.fromEntries(
                        Object.entries(standings).map(([group, rows]) => [
                          group,
                          rows.map((r) => r.teamId),
                        ]),
                      ),
                    )
                  }
                >
                  Review / re-seed bracket
                </button>
                {Object.keys(doc.approvals).length > 0 && (
                  <button disabled={busy} onClick={() => run("reopen-seeding")}>
                    Reopen seeding
                  </button>
                )}
              </div>
            )}
          {doc.topology.rules.format === "swiss" && (
            <section className="cw-panel">
              <h2>
                Swiss · Round {doc.swissRound || 1} of{" "}
                {doc.topology.rules.swissRounds}
              </h2>
              {organizer && (
                <button disabled={busy} onClick={() => run("swiss-preview")}>
                  Preview next-round pairings
                </button>
              )}
              {doc.swissPreview && (
                <div>
                  <ul>
                    {doc.swissPreview.map((p) => (
                      <li key={p.team1}>
                        {teamName(p.team1)} —{" "}
                        {p.team2 ? teamName(p.team2) : "Bye"}
                      </li>
                    ))}
                  </ul>
                  {organizer && (
                    <button
                      className="cw-primary"
                      disabled={busy}
                      onClick={() => run("swiss-publish")}
                    >
                      Approve & publish round
                    </button>
                  )}
                </div>
              )}
            </section>
          )}
          {Object.entries(standings)
            .filter(([group]) => !group.startsWith("Swiss Round"))
            .map(([group, rows]) => {
              const groupGames = doc.topology.matches.filter(
                  (m) => m.pool === group,
                ),
                remaining = groupGames.filter(
                  (m) => !states.get(m.id)!.complete,
                ).length;
              return (
                <section key={group} className="cw-panel">
                  <h2>{group}</h2>
                  <div className="cw-outlook">
                    <strong>Pool outlook</strong>
                    <p>
                      {remaining} games remaining.
                      {doc.finalsCreated ? " Playoff seeds are confirmed." : " Complete preliminary play, then choose qualifiers in Create Finals/Playoffs."}
                    </p>
                    <small>
                      Ranked by competition points, wins, losses and draws. Ties only: point differential (points for minus points against), then points scored. Review exact ties before creating playoffs.
                    </small>
                  </div>
                  <div className="cw-table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Team</th>
                          {["P", "W", "D", "L", "PF", "PA", "+/−", "Pts"].map(
                            (h) => (
                              <th key={h}>{h}</th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r, i) => (
                          <tr key={r.teamId}>
                            <td>
                              <span className="cw-seed">{i + 1}</span>
                              {teamName(r.teamId)}
                            </td>
                            {[
                              r.played,
                              r.won,
                              r.drawn,
                              r.lost,
                              r.for,
                              r.against,
                              r.for - r.against,
                              r.points,
                            ].map((v, j) => (
                              <td key={j}>{v}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="cw-pool-games">
                    {groupGames
                      .filter((m) => states.get(m.id)!.teamIds.every(Boolean))
                      .map(matchCard)}
                  </div>
                </section>
              );
            })}
        </div>
      )}
      {(tab === "schedule" || tab === "map") && (
        <>
          <div className="cw-filters">
            <label>
              Venue
              <select
                value={selectedVenue}
                onChange={(e) => {
                  setVenue(e.target.value);
                  setField("");
                }}
              >
                {tab === "schedule" && <option value="">All venues</option>}
                {venues.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Date
              <select value={day} onChange={(e) => setDay(e.target.value)}>
                {doc.options.windows.map((w) => (
                  <option key={w.date}>{w.date}</option>
                ))}
              </select>
            </label>
            <label>
              Field
              <select value={field} onChange={(e) => setField(e.target.value)}>
                <option value="">All fields</option>
                {venueResources.map((r) => (
                  <option key={r.id} value={r.id}>
                    {surfaceLabel(r)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {activeVenue && (
            <div className="cw-location-summary">
              <strong>{activeVenue.name}</strong>
              {activeVenue.address && (
                <>
                  <span>{activeVenue.address}</span>
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeVenue.address)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Directions
                  </a>
                </>
              )}
            </div>
          )}
          {tab === "schedule" && (
            <div className="cw-schedule-scroll">
              <div
                className="cw-timeline"
                style={{
                  gridTemplateColumns: `65px repeat(${venueResources.filter((r) => !field || r.id === field).length}, minmax(220px,1fr))`,
                }}
              >
                <div className="cw-time-column">
                  {Array.from({ length: hourEnd - hourStart }, (_, i) => {
                    const h = hourStart + i;
                    return (
                      <span key={h} style={{ top: 48 + (h - hourStart) * 120 }}>
                        {String(h).padStart(2, "0")}:00
                      </span>
                    );
                  })}
                </div>
                {venueResources
                  .filter((r) => !field || r.id === field)
                  .map((resource) => (
                    <div className="cw-timeline-column" key={resource.id}>
                      <h3>{surfaceLabel(resource)}</h3>
                      <div
                        className="cw-timeline-body"
                        style={{ height: (hourEnd - hourStart) * 120 }}
                      >
                        {visibleGames
                          .filter(
                            (g) =>
                              g.date === day && g.resourceId === resource.id,
                          )
                          .map((g) => (
                            <button
                              className={`cw-grid-game${g.isCompleted ? " cw-grid-game-completed" : ""}`}
                              key={g.id}
                              style={{
                                position: "absolute",
                                top:
                                  (Number(g.time.slice(0, 2)) * 60 +
                                    Number(g.time.slice(3)) -
                                    hourStart * 60) *
                                  2,
                                height: doc.options.duration * 2,
                                width: "calc(100% - 8px)",
                                left: 4,
                                overflow: "auto",
                              }}
                              disabled={!onAction || g.isNotRequired}
                              onClick={() =>
                                openGame(g.id, organizer ? "move" : "score")
                              }
                            >
                              <strong>
                                {g.time} · {g.team1} vs {g.team2}
                              </strong>
                              <span>{g.round}</span>
                              {g.isCompleted && <span className="cw-result"><b>FINAL · {g.score1} – {g.score2}</b><strong>{gameResultSummary(g)?.label}</strong></span>}
                              <span>{g.refereeName ? `Referee: ${g.refereeName}` : "Referee: awaiting assignment"}</span>
                              <small>
                                {g.isCompleted
                                  ? "Completed"
                                  : g.isNotRequired
                                    ? "Not required — decided"
                                    : g.isConditional
                                    ? "If needed"
                                    : "Scheduled"}{" "}
                                · {doc.options.duration} min
                              </small>
                            </button>
                          ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}
          {tab === "map" && (
            <>
              <label className="cw-time-filter">
                Time window: {String(mapTime).padStart(2, "0")}:00–
                {String(mapTime + 1).padStart(2, "0")}:00
                <input
                  aria-label="Map time window"
                  type="range"
                  min="0"
                  max="23"
                  value={mapTime}
                  onChange={(e) => setMapTime(+e.target.value)}
                />
              </label>
              <div
                className="cw-venue"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!organizer) return;
                  const id = e.dataTransfer.getData("text/plain");
                  const box = e.currentTarget.getBoundingClientRect();
                  if (doc.options.resources.some((r) => r.id === id))
                    void run("layout", {
                      positions: {
                        ...doc.layout,
                        [id]: {
                          x: Math.max(
                            0,
                            Math.min(
                              70,
                              ((e.clientX - box.left) / box.width) * 100,
                            ),
                          ),
                          y: Math.max(
                            0,
                            Math.min(
                              70,
                              ((e.clientY - box.top) / box.height) * 100,
                            ),
                          ),
                        },
                      },
                    });
                }}
              >
                <span className="cw-north">North</span>
                {venueResources
                  .filter((r) => !field || r.id === field)
                  .map((resource, i) => (
                    <div
                      className="cw-field"
                      key={resource.id}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        const gameId = e.dataTransfer.getData(
                          "application/x-squad-game",
                        );
                        if (gameId && organizer) {
                          e.preventDefault();
                          e.stopPropagation();
                          void run("move", {
                            gameId,
                            date: day,
                            time: `${String(mapTime).padStart(2, "0")}:00`,
                            resourceId: resource.id,
                          });
                        }
                      }}
                      draggable={organizer}
                      onDragStart={(e) =>
                        e.dataTransfer.setData("text/plain", resource.id)
                      }
                      style={{
                        left: `${doc.layout?.[resource.id]?.x ?? (i % 3) * 31 + 2}%`,
                        top: `${doc.layout?.[resource.id]?.y ?? Math.floor(i / 3) * 27 + 8}%`,
                      }}
                    >
                      <strong>{resource.surfaceName || resource.name}</strong>
                      <div className="cw-field-lines" />
                      <small>
                        {visibleGames
                          .filter(
                            (g) =>
                              g.date === day &&
                              g.resourceId === resource.id &&
                              Number(g.time.slice(0, 2)) * 60 +
                                Number(g.time.slice(3)) <
                                (mapTime + 1) * 60 &&
                              Number(g.time.slice(0, 2)) * 60 +
                                Number(g.time.slice(3)) +
                                doc.options.duration >
                                mapTime * 60,
                          )
                          .map((g) => `${g.team1} vs ${g.team2}`)
                          .join(" · ") || "No game in this hour"}
                      </small>
                    </div>
                  ))}
              </div>
              {organizer && (
                <details className="cw-panel">
                  <summary>Arrange the venue map</summary>
                  {venueResources.map((r, i) => (
                    <form
                      key={r.id}
                      className="cw-inline"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        void run("layout", {
                          positions: {
                            ...doc.layout,
                            [r.id]: {
                              x: Number(form.get("x")),
                              y: Number(form.get("y")),
                            },
                          },
                        });
                      }}
                    >
                      <strong>{surfaceLabel(r)}</strong>
                      <label>
                        Across %
                        <input
                          name="x"
                          type="number"
                          min="0"
                          max="70"
                          defaultValue={
                            doc.layout?.[r.id]?.x ?? (i % 3) * 31 + 2
                          }
                        />
                      </label>
                      <label>
                        Down %
                        <input
                          name="y"
                          type="number"
                          min="0"
                          max="70"
                          defaultValue={
                            doc.layout?.[r.id]?.y ?? Math.floor(i / 3) * 27 + 8
                          }
                        />
                      </label>
                      <button disabled={busy}>Save position</button>
                    </form>
                  ))}
                </details>
              )}
            </>
          )}
          {organizer && (
            <details className="cw-panel">
              <summary>Delay or reschedule remaining games</summary>
              <p>
                Moves all unplayed games on the selected date from the chosen
                time. The complete schedule is validated before anything
                changes.
              </p>
              <form
                className="cw-inline"
                onSubmit={(e) => {
                  e.preventDefault();
                  const values = new FormData(e.currentTarget);
                  void run("shift", {
                    date: day,
                    from: values.get("from"),
                    minutes: Number(values.get("minutes")),
                  });
                }}
              >
                <label>
                  From time
                  <input
                    name="from"
                    type="time"
                    required
                    defaultValue="09:00"
                  />
                </label>
                <label>
                  Shift minutes
                  <input
                    name="minutes"
                    type="number"
                    min="-720"
                    max="720"
                    required
                    defaultValue="30"
                  />
                </label>
                <button disabled={busy}>Validate & shift</button>
              </form>
            </details>
          )}
          <section className="cw-panel">
            <h2>Unplaced games</h2>
            {doc.topology.matches
              .flatMap((m) =>
                Array.from({ length: m.bestOf }, (_, i) => ({
                  m,
                  game: i + 1,
                })),
              )
              .filter(
                ({ m, game }) =>
                  !doc.schedule.some(
                    (g) => g.matchId === m.id && g.game === game,
                  ),
              )
              .map(({ m, game }) => (
                <div
                  className="cw-unplaced"
                  key={`${m.id}_${game}`}
                  draggable={organizer}
                  onDragStart={(e) =>
                    e.dataTransfer.setData(
                      "application/x-squad-game",
                      `${m.id}_g${game}`,
                    )
                  }
                >
                  <span>
                    {sourceLabel(m.sources[0], doc.topology)} vs{" "}
                    {sourceLabel(m.sources[1], doc.topology)} · Game {game}
                  </span>
                  {organizer && (
                    <button
                      onClick={() => openGame(`${m.id}_g${game}`, "move")}
                    >
                      Place
                    </button>
                  )}
                </div>
              ))}
            {doc.schedule.length ===
              doc.topology.matches.reduce((sum, m) => sum + m.bestOf, 0) && (
              <p>All games have an assigned field and time.</p>
            )}
          </section>
        </>
      )}
      <p className="cw-updated">
        Updated {new Date(doc.updatedAt).toLocaleString()} ·{" "}
        {doc.status === "published"
          ? "Live results refresh automatically."
          : "Draft schedule."}
      </p>
      {selected && selectedMatch && (
        <div className="cw-overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-label={editMode === "score" ? "Record score" : "Place match"}
            className="cw-dialog"
          >
            <button
              className="cw-close"
              aria-label="Close match"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
            <h2>{editMode === "score" ? "Record score" : "Schedule game"}</h2>
            <p>
              {selectedMatch.label} · Game {selectedNumber}
            </p>
            {error && (
              <p role="alert" className="cw-error">
                {error}
              </p>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void run(
                  editMode === "score" ? "score" : "move",
                  editMode === "score"
                    ? {
                        result: {
                          matchId: selectedMatch.id,
                          game: selectedNumber,
                          score1: Number(score1),
                          score2: Number(score2),
                          ...(winner ? { winner: Number(winner) } : {}),
                        },
                      }
                    : {
                        gameId: selected,
                        date: moveDate,
                        time: moveTime,
                        resourceId: moveField,
                      },
                );
              }}
            >
              {editMode === "score" ? (
                <>
                  <label>
                    {teamName(states.get(selectedMatch.id)!.teamIds[0])}
                    <input
                      type="number"
                      min="0"
                      required
                      value={score1}
                      onChange={(e) => setScore1(e.target.value)}
                    />
                  </label>
                  <label>
                    {teamName(states.get(selectedMatch.id)!.teamIds[1])}
                    <input
                      type="number"
                      min="0"
                      required
                      value={score2}
                      onChange={(e) => setScore2(e.target.value)}
                    />
                  </label>
                  {score1 === score2 && !selectedMatch.pool && (
                    <label>
                      Tiebreak winner
                      <select
                        value={winner}
                        onChange={(e) => setWinner(e.target.value)}
                        required
                      >
                        <option value="">Choose winner</option>
                        <option value="1">
                          {teamName(states.get(selectedMatch.id)!.teamIds[0])}
                        </option>
                        <option value="2">
                          {teamName(states.get(selectedMatch.id)!.teamIds[1])}
                        </option>
                      </select>
                    </label>
                  )}
                </>
              ) : (
                <>
                  <label>
                    Date
                    <input
                      type="date"
                      required
                      value={moveDate}
                      onChange={(e) => setMoveDate(e.target.value)}
                    />
                  </label>
                  <label>
                    Time
                    <input
                      type="time"
                      required
                      value={moveTime}
                      onChange={(e) => setMoveTime(e.target.value)}
                    />
                  </label>
                  <label>
                    Field
                    <select
                      value={moveField}
                      onChange={(e) => setMoveField(e.target.value)}
                    >
                      {doc.options.resources.map((r) => (
                        <option key={r.id} value={r.id}>
                          {surfaceLabel(r)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p>
                    Team rest, field availability, and advancement timing will
                    be checked before saving.
                  </p>
                </>
              )}
              {editMode === "move" &&
                doc.status === "draft" &&
                selectedSlot && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => run("unplace", { gameId: selected })}
                  >
                    Remove assignment
                  </button>
                )}
              <button disabled={busy} className="cw-primary">
                {busy ? "Checking…" : "Validate & save"}
              </button>
            </form>
          </section>
        </div>
      )}
      {deploymentReview && <div className="cw-overlay"><section className="cw-dialog" role="dialog" aria-modal="true" aria-label="Confirm tournament deployment">
        <h2>Review teams & deploy</h2><p>These teams will be scheduled. Paid registrations are included only after payment is confirmed. Deploy means publish the schedule and close registration. Check the team list before continuing.</p>
        <ol>{doc.topology.teams.map(team => <li key={team.id}>{team.name}</li>)}</ol>
        <label className="cw-check"><input type="checkbox" checked={rosterConfirmed} onChange={event => setRosterConfirmed(event.target.checked)} /> I confirm this team list is complete and ready.</label>
        <div className="cw-inline"><button onClick={() => setDeploymentReview(false)}>Cancel</button><button className="cw-primary" disabled={busy || !rosterConfirmed} onClick={async () => { if (await run("deploy", { confirmedTeamIds: doc.topology.teams.map(team => team.id) })) setDeploymentReview(false); }}>Deploy tournament</button></div>
        {error && <p role="alert" className="cw-error">{error}</p>}
      </section></div>}
      {playoffReview && <div className="cw-overlay"><section className="cw-dialog" role="dialog" aria-modal="true" aria-label="Create Finals/Playoffs">
        <h2>Create Finals/Playoffs</h2><p>First, finish entering the pool-game scores. Then choose who moves on and how many separate championships to run. Teams are ranked by standings points and their win/loss/draw record. Scoring totals only break tied records: points scored minus points allowed, then points scored. If still tied, the current team order is kept for your review.</p>
        <label>Who moves on to playoffs?<select value={advanceAll ? "all" : "top"} onChange={event => { setAdvanceAll(event.target.value === "all"); setSeedsConfirmed(false); }}><option value="all">All teams advance</option><option value="top">Only the top teams from each pool</option></select></label>
        {!advanceAll && <label>Teams advancing from each pool<input type="number" min="1" value={qualifiers} onChange={event => { setQualifiers(Number(event.target.value)); setSeedsConfirmed(false); }} /></label>}
        <label>Playoff brackets<select value={brackets} onChange={event => { setBrackets(Number(event.target.value)); setSeedsConfirmed(false); }}><option value="1">One championship bracket</option><option value="2">Two division championships · Gold and Silver</option><option value="3">Three division championships · Gold, Silver and Bronze</option></select></label>
        <p>Each division plays its own bracket and crowns its own champion. There is no final between division winners. Teams are ranked together, then split into balanced-size divisions: strongest seeds in Gold, next in Silver, then Bronze. Each division needs at least two teams.</p>
        <ol>{playoffPreview.rows.map((row, index) => <li key={row.teamId}>{index + 1}. {doc.topology.teams.find(team => team.id === row.teamId)?.name} · {playoffDivision(index)} · {row.won} W / {row.lost} L / {row.drawn} D · {row.for} for / {row.against} against</li>)}</ol>
        {playoffPreview.error && <p role="alert">{playoffPreview.error}</p>}
        <label>Playoff date<input type="date" value={finalDate} onChange={event => setFinalDate(event.target.value)} /></label>
        <div className="cw-inline"><label>Available from<input type="time" value={finalStart} onChange={event => setFinalStart(event.target.value)} /></label><label>Available until<input type="time" value={finalEnd} onChange={event => setFinalEnd(event.target.value)} /></label></div>
        <label className="cw-check"><input type="checkbox" checked={seedsConfirmed} onChange={event => setSeedsConfirmed(event.target.checked)} /> I have checked which teams advance and where they will play.</label>
        <div className="cw-inline"><button onClick={() => setPlayoffReview(false)}>Cancel</button><button className="cw-primary" disabled={busy || !seedsConfirmed || !!playoffPreview.error || playoffPreview.rows.length < brackets * 2} onClick={async () => { if (await run("create-playoffs", { qualifiers: advanceAll ? "all" : qualifiers, brackets, confirmedTeamIds: playoffPreview.rows.map(row => row.teamId), window: { date: finalDate, startTime: finalStart, endTime: finalEnd } })) { setPlayoffReview(false); setTab("bracket"); setRound(null); setStage(`${brackets === 1 ? "Championship" : "Gold"}${doc.topology.rules.format === "pool_double_elimination" ? " · Winners" : ""}`); } }}>Create playoff schedule</button></div>
        {error && <p role="alert" className="cw-error">{error}</p>}
      </section></div>}
      {rankings && (
        <div className="cw-overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Review seeding"
            className="cw-dialog"
          >
            <button
              className="cw-close"
              aria-label="Close seeding"
              onClick={() => setRankings(null)}
            >
              <X />
            </button>
            <h2>Review pool seeding</h2>
            {error && (
              <p role="alert" className="cw-error">
                {error}
              </p>
            )}
            <p>
              Resolve tied positions before approving. Existing playoff results
              lock seeding.
            </p>
            {Object.entries(rankings).map(([group, ids]) => (
              <div key={group}>
                <h3>{group}</h3>
                {ids.map((id, i) => (
                  <label key={id}>
                    Seed {i + 1}
                    <select
                      value={id}
                      onChange={(e) => {
                        const next = [...ids],
                          other = next.indexOf(e.target.value);
                        [next[i], next[other]] = [next[other], next[i]];
                        setRankings({ ...rankings, [group]: next });
                      }}
                    >
                      {ids.map((t) => (
                        <option key={t} value={t}>
                          {teamName(t)}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            ))}
            <button
              className="cw-primary"
              disabled={busy}
              onClick={async () => {
                if (await run("seed-pools", { rankings })) setRankings(null);
              }}
            >
              Approve seeding
            </button>
          </section>
        </div>
      )}
      {share && (
        <div className="cw-overlay">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Share tournament"
            className="cw-dialog"
          >
            <button
              className="cw-close"
              aria-label="Close share"
              onClick={() => setShare(false)}
            >
              <X />
            </button>
            <h2>Share tournament</h2>
            {error && (
              <p role="alert" className="cw-error">
                {error}
              </p>
            )}
            {doc.status !== "published" && (
              <p className="cw-banner">
                Publish first to activate the live link.
              </p>
            )}
            <h3>Live link</h3>
            {publicUrl ? (
              <>
                <input
                  aria-label="Live tournament link"
                  readOnly
                  value={publicUrl}
                />
                <div className="cw-inline">
                  <button
                    onClick={() => navigator.clipboard.writeText(publicUrl)}
                  >
                    Copy link
                  </button>
                  <a href={publicUrl} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </div>
                <h3>QR code</h3>
                <NextImage
                  unoptimized
                  width={300}
                  height={300}
                  src={qrImage(publicUrl)}
                  alt="QR code opening the live tournament"
                  className="cw-qr"
                />
                <button
                  onClick={() => {
                    const popup = window.open("", "_blank");
                    if (popup) {
                      popup.document.write(
                        `<html><title>Tournament QR</title><body style="text-align:center;font:20px system-ui"><h1>Live tournament</h1><img alt="Tournament QR code" src="${qrImage(publicUrl)}"/><p>Scan for the live bracket and schedule.</p></body></html>`,
                      );
                      popup.document.close();
                      popup.onload = () => popup.print();
                    }
                  }}
                >
                  Print QR
                </button>
                <button
                  onClick={() => {
                    const img = new Image();
                    img.onload = () => {
                      const canvas = window.document.createElement("canvas");
                      canvas.width = img.width;
                      canvas.height = img.height;
                      canvas.getContext("2d")!.drawImage(img, 0, 0);
                      const a = window.document.createElement("a");
                      a.href = canvas.toDataURL("image/png");
                      a.download = "tournament-qr.png";
                      a.click();
                    };
                    img.src = qrImage(publicUrl);
                  }}
                >
                  Download QR PNG
                </button>
              </>
            ) : (
              <p>Save the tournament to get its live link.</p>
            )}
            <h3>Print / save as PDF</h3>
            <button
              onClick={() => {
                const popup = window.open("", "_blank");
                if (popup) {
                  popup.document.write(snapshotHtml(doc));
                  popup.document.close();
                  popup.onload = () => popup.print();
                }
              }}
            >
              <Printer size={16} /> Print bracket & schedule
            </button>
            <h3>Offline snapshot</h3>
            <p>A frozen copy with no live updates or score editing.</p>
            <button
              onClick={() =>
                downloadFile("tournament-snapshot.html", snapshotHtml(doc))
              }
            >
              Download snapshot
            </button>
            {embedUrl && (
              <>
                <h3>Embed</h3>
                <textarea
                  readOnly
                  aria-label="Embed HTML"
                  value={`<iframe src="${embedUrl}" title="Tournament" width="100%" height="800" loading="lazy"></iframe>`}
                />
                <button
                  onClick={() =>
                    navigator.clipboard.writeText(
                      `<iframe src="${embedUrl}" title="Tournament" width="100%" height="800" loading="lazy"></iframe>`,
                    )
                  }
                >
                  Copy embed
                </button>
              </>
            )}
            {onCredential && (
              <>
                <h3>Scorekeeper access</h3>
                <p>
                  Only share the code with authorized scorers. Rotating it
                  revokes the previous code.
                </p>
                <div className="cw-inline">
                  <button
                    onClick={async () => {
                      try {
                        const code = await onCredential(false);
                        setScoreCode(code || "");
                      } catch (e) {
                        setError(String(e));
                      }
                    }}
                  >
                    Generate / rotate code
                  </button>
                  <button
                    onClick={async () => {
                      await onCredential(true);
                      setScoreCode("");
                    }}
                  >
                    Revoke code
                  </button>
                </div>
                {scoreCode && <output className="cw-code">{scoreCode}</output>}
              </>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
