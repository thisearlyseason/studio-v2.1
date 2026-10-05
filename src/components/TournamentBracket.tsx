"use client";
import { format } from "date-fns";
import React, { useMemo, useRef, useState } from "react";
import { Download, MapPin, List, GitBranch } from "lucide-react";
import type { TournamentGame } from "@/components/providers/team-provider";
import { exportImageToPDF } from "@/lib/pdf-utils";
import "./tournaments/competition-workspace.css";
import BracketConnectors from "./tournaments/BracketConnectors";
interface BracketProps {
  games: TournamentGame[];
  standalone?: boolean;
  onGameClick?: (game: TournamentGame) => void;
  tournamentName?: string;
}
function tournamentDisplayDate(value: string) {
  const [year, month, day] = String(value || "")
    .split("T")[0]
    .split("-")
    .map(Number);
  return new Date(year, month - 1, day, 12);
}
export default function TournamentBracket({
  games,
  onGameClick,
  tournamentName = "Tournament",
}: BracketProps) {
  const [stage, setStage] = useState(""),
    [round, setRound] = useState(""),
    [list, setList] = useState(false),
    [search, setSearch] = useState(""),
    [exporting, setExporting] = useState(false),
    [error, setError] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const edges = useMemo(
    () =>
      games.flatMap((g) => [
        ...(g.winnerTo
          ? [
              {
                from: g.id,
                to: g.winnerTo,
                side: (g.winnerToSlot === "team2" ? 1 : 0) as 0 | 1,
              },
            ]
          : []),
        ...(g.loserTo
          ? [
              {
                from: g.id,
                to: g.loserTo,
                side: (g.loserToSlot === "team2" ? 1 : 0) as 0 | 1,
                loser: true,
              },
            ]
          : []),
      ]),
    [games],
  );
  const stages = useMemo(
    () => [
      ...new Set(
        games.map((g) => g.playoffDivisionName || g.stage || "Bracket"),
      ),
    ],
    [games],
  );
  const active = stages.includes(stage) ? stage : stages[0];
  const stageGames = games.filter(
    (g) => (g.playoffDivisionName || g.stage || "Bracket") === active,
  );
  const rounds = (() => {
    const groups = new Map<string, TournamentGame[]>();
    const depth = (id: string, seen = new Set<string>()): number => {
      if (seen.has(id)) return 0;
      seen.add(id);
      const feeders = games.filter(
        (g) => g.winnerTo === id || g.loserTo === id,
      );
      return feeders.length
        ? 1 + Math.max(...feeders.map((g) => depth(g.id, new Set(seen))))
        : 0;
    };
    for (const game of stageGames) {
      const key = game.round || "Matches";
      groups.set(key, [...(groups.get(key) || []), game]);
    }
    return [...groups].sort(
      (a, b) =>
        Math.min(...a[1].map((g) => depth(g.id))) -
        Math.min(...b[1].map((g) => depth(g.id))),
    );
  })();
  const activeRound = rounds.some(([r]) => r === round)
    ? round
    : rounds[0]?.[0];
  function source(game: TournamentGame, side: "team1" | "team2") {
    const name = game[side];
    if (name && !/^TBD|^Winner of|^Loser of/i.test(name)) return name;
    const win = games.find(
        (g) => g.winnerTo === game.id && g.winnerToSlot === side,
      ),
      loss = games.find((g) => g.loserTo === game.id && g.loserToSlot === side);
    const feeder = win || loss;
    if (feeder)
      return `${win ? "Winner" : "Loser"} of Match ${games.indexOf(feeder) + 1}`;
    return name || "Awaiting participant";
  }
  return (
    <div className="cw" data-testid="tournament-bracket">
      <div className="cw-filters">
        <label className="cw-search">
          <input
            aria-label="Find a team in the bracket"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a team"
          />
        </label>
        <button aria-label="Toggle bracket list" onClick={() => setList(!list)}>
          {list ? <GitBranch size={18} /> : <List size={18} />}
        </button>
        <button
          disabled={exporting}
          onClick={async () => {
            if (!ref.current) return;
            setExporting(true);
            setError("");
            try {
              await exportImageToPDF(ref.current, {
                title: tournamentName,
                orientation: "landscape",
                lightMode: true,
                filename: "tournament-bracket.pdf",
              });
            } catch {
              setError("Unable to export this bracket. Please retry.");
            } finally {
              setExporting(false);
            }
          }}
        >
          <Download size={16} />
          {exporting ? "Exporting…" : "PDF"}
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="cw-tabs" aria-label="Bracket stages">
        {stages.map((s) => (
          <button
            key={s}
            className={s === active ? "cw-selected" : ""}
            onClick={() => {
              setStage(s);
              setRound("");
            }}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="cw-tabs" aria-label="Bracket rounds">
        {rounds.map(([r]) => (
          <button
            key={r}
            className={r === activeRound ? "cw-selected" : ""}
            onClick={() => setRound(r)}
          >
            {r}
          </button>
        ))}
      </div>
      <div
        ref={ref}
        id="tournament-bracket-export"
        className={`cw-bracket ${list ? "cw-list" : ""}`}
      >
        {!list && (
          <BracketConnectors
            container={ref}
            edges={edges}
            layoutKey={`${active}:${activeRound}:${search}`}
          />
        )}{" "}
        {rounds
          .filter(
            (_, i) =>
              list || i >= rounds.findIndex(([name]) => name === activeRound),
          )
          .map(([r, matches]) => (
            <section key={r} className="cw-round">
              <h2>{r}</h2>
              <div>
                {matches
                  .filter(
                    (g) =>
                      !search ||
                      `${g.team1} ${g.team2}`
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                  )
                  .map((game) => (
                    <article
                      className="cw-match"
                      key={game.id}
                      data-match-id={game.id}
                    >
                      <header>
                        <span>Match {games.indexOf(game) + 1}</span>
                        <span>
                          {game.isDisputed
                            ? "Under review"
                            : game.isCompleted
                              ? "Final"
                              : game.isConditional
                                ? "If needed"
                                : "Upcoming"}
                        </span>
                      </header>
                      <div className="cw-match-meta">
                        <MapPin size={13} />
                        {game.location || "Unassigned"}
                        <span>
                          {game.date
                            ? format(
                                tournamentDisplayDate(game.date),
                                "MMM d, yyyy",
                              )
                            : "Unscheduled"}{" "}
                          · {game.time}
                        </span>
                      </div>
                      {(["team1", "team2"] as const).map((side, i) => {
                        const name = source(game, side),
                          score = i === 0 ? game.score1 : game.score2;
                        const wins =
                          game.isCompleted &&
                          (game.winnerId === game[`${side}Id`] ||
                            (!game.winnerId &&
                              score > (i === 0 ? game.score2 : game.score1)));
                        return (
                          <div
                            key={side}
                            className={`cw-team ${wins ? "cw-winner" : ""}`}
                          >
                            <span className="cw-avatar">
                              {name.slice(0, 1)}
                            </span>
                            <span className="cw-team-name">{name}</span>
                            <strong>{game.isCompleted ? score : "–"}</strong>
                          </div>
                        );
                      })}
                      {onGameClick && (
                        <footer>
                          <button
                            onClick={() => onGameClick(game)}
                            aria-label={`Edit match: ${game.team1} versus ${game.team2}`}
                          >
                            Match details & score
                          </button>
                        </footer>
                      )}
                    </article>
                  ))}
              </div>
            </section>
          ))}
      </div>
      {!games.length && <p>No bracket games have been scheduled.</p>}
    </div>
  );
}
