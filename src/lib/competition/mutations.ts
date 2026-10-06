import { createPlayoffs } from "./playoffs";
import { buildTopology } from "./topology";
import { CompetitionError, type Result } from "./types";
import { type CompetitionDocument, createCompetition } from "./document";
import { recordCompetitionResult, resolveCompetition } from "./results";
import { pairSwissRound } from "./swiss";
import {
  scheduleCompetition,
  validateCompetitionSchedule,
  zonedInstant,
  minutes,
  type Booking,
} from "./schedule";

export function mutateCompetition(
  current: CompetitionDocument,
  action: string,
  payload: Record<string, unknown>,
  bookings: Booking[] = [],
): CompetitionDocument {
  let doc = structuredClone(current);
  const options = { ...doc.options, bookings };
  if (action === "configure") {
    if (doc.status === "published" || doc.results.length)
      throw new CompetitionError(
        "CONFIGURATION_LOCKED",
        "Return an unplayed tournament to draft before changing setup.",
      );
    doc = { ...createCompetition(payload.setup), revision: doc.revision };
  } else if (action === "deploy") {
    if(doc.phase !== "registration" || doc.status !== "draft") throw new CompetitionError("DEPLOY_LOCKED", "Only an open registration draft can be deployed.");
    const confirmed = payload.confirmedTeamIds;
    if (!Array.isArray(confirmed) || confirmed.length !== doc.topology.teams.length || new Set(confirmed).size !== confirmed.length || doc.topology.teams.some(team=>!confirmed.includes(team.id))) throw new CompetitionError("CONFIRM_ROSTER", "Review and confirm the current team list before deployment.");
    const requestedRules = doc.topology.rules;
    const preliminaryFormat = requestedRules.format === "tiered_playoffs" ? "round_robin" : ["pool_play_knockout", "pool_double_elimination"].includes(requestedRules.format) ? "pool_play" : requestedRules.format;
    doc.topology = buildTopology(doc.topology.teams, {...requestedRules,format:preliminaryFormat});
    doc.topology.rules = requestedRules;
    if (["pool_play_knockout", "pool_double_elimination", "tiered_playoffs"].includes(doc.topology.rules.format)) {
      doc.topology.matches = doc.topology.matches.filter(match=>!!match.pool);
      delete doc.topology.placements;
    }
    doc.phase = "competition";
    doc.schedule = scheduleCompetition(doc.topology, options);
    const conflicts = validateCompetitionSchedule(doc.topology, doc.schedule, options);
    if(conflicts.length) throw new CompetitionError("INVALID_SCHEDULE", "Resolve these conflicts before deploying.", conflicts);
    doc.status = "published";
  } else if (action === "remove-unplayed-playoffs") {
    if (!doc.finalsCreated || doc.results.some(result => !doc.topology.matches.find(match => match.id === result.matchId)?.pool)) throw new CompetitionError("PLAYOFFS_STARTED", "Playoffs can only be removed before any playoff result is recorded.");
    doc.topology.matches = doc.topology.matches.filter(match => !!match.pool);
    const retained = new Set(doc.topology.matches.map(match => match.id));
    doc.schedule = doc.schedule.filter(slot => retained.has(slot.matchId));
    delete doc.topology.placements;
    doc.finalsCreated = false;
    doc.approvals = {};
  } else if (action === "create-playoffs") {
    doc = createPlayoffs(doc,payload,bookings);
  } else if (action === "generate") {
    if(doc.phase === "registration") throw new CompetitionError("CONFIRM_ROSTER", "Use Deploy to confirm registered teams first.");
    if (doc.status === "published" || doc.results.length)
      throw new CompetitionError(
        "SCHEDULE_LOCKED",
        "Only an unplayed draft can be regenerated.",
      );
    doc.schedule = scheduleCompetition(doc.topology, options);
  } else if (action === "publish") {
    if(doc.phase === "registration") throw new CompetitionError("CONFIRM_ROSTER", "Use Deploy to confirm registered teams first.");
    const conflicts = validateCompetitionSchedule(
      doc.topology,
      doc.schedule,
      options,
    );
    if (conflicts.length)
      throw new CompetitionError(
        "INVALID_SCHEDULE",
        "Resolve schedule conflicts before publishing.",
        conflicts,
      );
    doc.status = "published";
  } else if (action === "reopen-registration") {
    if (doc.results.length) throw new CompetitionError("RESULTS_EXIST", "A tournament with results cannot reopen registration.");
    doc.status = "draft";
    doc.phase = "registration";
    doc.topology.matches = [];
    doc.topology.groups = {};
    delete doc.topology.placements;
    doc.schedule = [];
    doc.approvals = {};
    doc.finalsCreated = false;
    if (doc.swissRound) { doc.swissRound = 1; doc.swissRecords = []; delete doc.swissPreview; }
  } else if (action === "unpublish") {
    if (doc.results.length)
      throw new CompetitionError(
        "RESULTS_EXIST",
        "A tournament with results cannot be returned to draft.",
      );
    doc.status = "draft";
  } else if (action === "move") {
    let game = doc.schedule.find((g) => g.id === payload.gameId);
    if (!game && doc.status === "draft") {
      const id = String(payload.gameId),
        match = doc.topology.matches.find((m) => id.startsWith(`${m.id}_g`));
      const number = Number(id.match(/_g(\d+)$/)?.[1]);
      if (
        match &&
        Number.isInteger(number) &&
        number >= 1 &&
        number <= match.bestOf
      ) {
        game = {
          id,
          matchId: match.id,
          game: number,
          date: "",
          time: "",
          resourceId: "",
          start: 0,
          end: 0,
        };
        doc.schedule.push(game);
      }
    }
    if (!game)
      throw new CompetitionError("UNKNOWN_GAME", "Choose a scheduled match.");
    if (
      doc.results.some(
        (r) => r.matchId === game.matchId && r.game === game.game,
      )
    )
      throw new CompetitionError(
        "GAME_COMPLETE",
        "Completed games cannot be rescheduled.",
      );
    const date = String(payload.date),
      time = String(payload.time),
      resourceId = String(payload.resourceId);
    Object.assign(game, {
      date,
      time,
      resourceId,
      start: zonedInstant(date, minutes(time), doc.topology.rules.timezone),
    });
    game.end = game.start + doc.options.duration * 60000;
    const conflicts = validateCompetitionSchedule(
      doc.topology,
      doc.schedule,
      options,
    ).filter((c) => doc.status === "published" || c.code !== "MISSING_GAME");
    if (conflicts.length)
      throw new CompetitionError(
        "INVALID_MOVE",
        "That move would violate the schedule.",
        conflicts,
      );
  } else if (action === "unplace") {
    if (doc.status !== "draft")
      throw new CompetitionError(
        "PUBLISHED_GAME",
        "Return an unplayed tournament to draft before removing an assignment.",
      );
    doc.schedule = doc.schedule.filter((g) => g.id !== payload.gameId);
  } else if (action === "shift") {
    const offset = Number(payload.minutes);
    if (!Number.isInteger(offset) || offset === 0 || Math.abs(offset) > 720)
      throw new CompetitionError(
        "INVALID_DELAY",
        "Choose a nonzero shift of at most 720 minutes.",
      );
    const date = String(payload.date),
      from = minutes(String(payload.from));
    const targets = doc.schedule.filter(
      (g) =>
        g.date === date &&
        minutes(g.time) >= from &&
        !doc.results.some((r) => r.matchId === g.matchId && r.game === g.game),
    );
    if (!targets.length)
      throw new CompetitionError(
        "NO_GAMES",
        "No unplayed games match that date and time.",
      );
    for (const game of targets) {
      const time = minutes(game.time) + offset;
      if (time < 0 || time >= 1440)
        throw new CompetitionError(
          "DAY_BOUNDARY",
          "This shift crosses midnight. Move those games individually.",
        );
      game.time = `${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;
      game.start = zonedInstant(game.date, time, doc.topology.rules.timezone);
      game.end = game.start + doc.options.duration * 60000;
    }
    const conflicts = validateCompetitionSchedule(
      doc.topology,
      doc.schedule,
      options,
    ).filter((c) => doc.status === "published" || c.code !== "MISSING_GAME");
    if (conflicts.length)
      throw new CompetitionError(
        "INVALID_DELAY",
        "The shift cannot fit safely. No games were changed.",
        conflicts,
      );
  } else if (action === "score") {
    if (doc.finalsCreated && doc.topology.matches.some(match => match.id === (payload.result as Result)?.matchId && !!match.pool)) throw new CompetitionError("PRELIMINARY_LOCKED", "Preliminary results are locked after playoff seeds are confirmed.");
    if (doc.status !== "published")
      throw new CompetitionError(
        "DRAFT_SCORE",
        "Publish the schedule before recording scores.",
      );
    const scoredMatch = doc.topology.matches.find(
      (m) => m.id === (payload.result as Result)?.matchId,
    );
    if (!payload.result || !scoredMatch)
      throw new CompetitionError("UNKNOWN_GAME", "Choose a valid match.");
    if (
      doc.topology.rules.format === "swiss" &&
      scoredMatch.round !== (doc.swissRound || 1)
    )
      throw new CompetitionError(
        "SWISS_ROUND_LOCKED",
        "Only the current reviewed Swiss round accepts score changes.",
      );
    delete doc.swissPreview;
    doc.results = recordCompetitionResult(
      doc.topology,
      doc.results,
      payload.result as Result,
      doc.approvals,
    );
    if (doc.topology.rules.format === "swiss") {
      const { states } = resolveCompetition(
        doc.topology,
        doc.results,
        doc.approvals,
      );
      const round = doc.swissRound || 1;
      const matches = doc.topology.matches.filter((m) => m.round === round);
      if (matches.every((m) => states.get(m.id)!.complete)) {
        const points = doc.topology.rules.points || {
          win: 3,
          draw: 1,
          loss: 0,
        };
        const played = new Set<string>();
        doc.swissRecords = (doc.swissRecords || []).filter(
          (r) => r.round !== round,
        );
        for (const match of matches) {
          const state = states.get(match.id)!;
          state.teamIds.forEach((id) => played.add(id!));
          doc.swissRecords.push({
            round,
            team1: state.teamIds[0]!,
            team2: state.teamIds[1]!,
            points1:
              state.winner === state.teamIds[0]
                ? points.win
                : state.winner
                  ? points.loss
                  : points.draw,
            points2:
              state.winner === state.teamIds[1]
                ? points.win
                : state.winner
                  ? points.loss
                  : points.draw,
            final: true,
          });
        }
        const bye = doc.topology.teams.find((t) => !played.has(t.id));
        if (bye)
          doc.swissRecords.push({
            round,
            team1: bye.id,
            team2: null,
            points1: points.win,
            points2: 0,
            final: true,
          });
      }
    }
  } else if (action === "seed-pools") {
    const { states, standings } = resolveCompetition(
      doc.topology,
      doc.results,
      doc.approvals,
    );
    if (
      doc.topology.matches
        .filter((m) => m.pool)
        .some((m) => !states.get(m.id)!.complete)
    )
      throw new CompetitionError(
        "POOL_INCOMPLETE",
        "Finalize all pool games before approving seeding.",
      );
    if (
      doc.results.some(
        (r) => !doc.topology.matches.find((m) => m.id === r.matchId)?.pool,
      )
    )
      throw new CompetitionError(
        "PLAYOFFS_STARTED",
        "Playoffs have started; seeding is locked.",
      );
    const proposed = payload.rankings as Record<string, string[]>;
    if (!proposed || typeof proposed !== "object")
      throw new CompetitionError(
        "INVALID_RANKING",
        "Review the pool rankings first.",
      );
    for (const [group, rows] of Object.entries(standings)) {
      const ids = proposed[group];
      if (
        !Array.isArray(ids) ||
        ids.length !== rows.length ||
        new Set(ids).size !== rows.length ||
        ids.some((id) => !rows.some((r) => r.teamId === id))
      )
        throw new CompetitionError(
          "INVALID_RANKING",
          "Every pool team must appear exactly once.",
        );
    }
    doc.approvals = proposed;
  } else if (action === "reopen-seeding") {
    if (
      doc.results.some(
        (r) => !doc.topology.matches.find((m) => m.id === r.matchId)?.pool,
      )
    )
      throw new CompetitionError(
        "PLAYOFFS_STARTED",
        "Playoffs have started; seeding is locked.",
      );
    doc.approvals = {};
  } else if (action === "swiss-preview") {
    if (
      doc.topology.rules.format !== "swiss" ||
      (doc.swissRound || 1) >= (doc.topology.rules.swissRounds || 1)
    )
      throw new CompetitionError(
        "SWISS_FINISHED",
        "There is no next Swiss round.",
      );
    const currentStates = resolveCompetition(doc.topology, doc.results, doc.approvals).states;
    if (doc.topology.matches.some(match => match.round <= (doc.swissRound || 1) && !currentStates.get(match.id)?.complete)) throw new CompetitionError("SWISS_INCOMPLETE", "Finish scoring every game in the current round before pairing the next round.");
    doc.swissPreview = pairSwissRound(
      doc.topology.teams,
      doc.swissRecords || [],
      (doc.swissRound || 1) + 1,
    );
  } else if (action === "swiss-publish") {
    if (!doc.swissPreview)
      throw new CompetitionError(
        "SWISS_REVIEW",
        "Preview the next round first.",
      );
    const round = (doc.swissRound || 1) + 1;
    const paired = pairSwissRound(
      doc.topology.teams,
      doc.swissRecords || [],
      round,
    );
    if (JSON.stringify(paired) !== JSON.stringify(doc.swissPreview))
      throw new CompetitionError(
        "SWISS_STALE",
        "Results changed. Review fresh pairings.",
      );
    doc.approvals[`Swiss Round ${round}`] = [
      ...paired.filter((p) => p.team2).flatMap((p) => [p.team1, p.team2!]),
      ...paired.filter((p) => !p.team2).map((p) => p.team1),
    ];
    doc.swissRound = round;
    delete doc.swissPreview;
  } else if (action === "layout") {
    const positions = payload.positions as CompetitionDocument["layout"];
    if (
      !positions ||
      Object.entries(positions).some(
        ([id, p]) =>
          !doc.options.resources.some((r) => r.id === id) ||
          !p ||
          ![p.x, p.y].every((n) => Number.isFinite(n) && n >= 0 && n <= 100),
      )
    )
      throw new CompetitionError(
        "INVALID_LAYOUT",
        "Field positions must be within the venue layout.",
      );
    doc.layout = positions;
  } else
    throw new CompetitionError("UNKNOWN_ACTION", "Unknown competition action.");
  doc.revision = current.revision + 1;
  doc.updatedAt = new Date().toISOString();
  return doc;
}
