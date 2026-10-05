import { registeredRosterPatch } from "./registration-roster";
import type { CompetitionDocument } from "./document";
import { CompetitionError } from "./types";
type RegistrationEntryData = {
  [key: string]: unknown;
  answers?: { teamName?: unknown; name?: unknown };
  entrant?: Record<string, unknown>;
};
type Team = { id: string; name: string; [key: string]: unknown };
type RegistrationEvent = {
  competition?: CompetitionDocument;
  lifecycleVersion?: number;
  tournamentTeamsData?: Team[];
  tournamentGames?: unknown[];
};
export function registrationTeam(
  entryId: string,
  entry: RegistrationEntryData,
): Team {
  return {
    ...(entry.entrant || {}),
    id: `p_${entryId}`,
    name: String(entry.entrant?.name || entry.answers?.teamName || "").trim(),
    coach: String(entry.answers?.name || ""),
    source: "pipeline",
    registrationEntryId: entryId,
  };
}
export function enrollmentPatch(
  event: RegistrationEvent,
  entryId: string,
  entry: RegistrationEntryData,
  eligible: boolean,
) {
  const id = `p_${entryId}`,
    current = event.tournamentTeamsData || [];
  const present = current.some((team) => team.id === id);
  if (present === eligible) return {};
  if (
    event.competition?.status === "published" ||
    event.tournamentGames?.length
  )
    throw new CompetitionError(
      "REGISTRATION_LOCKED",
      "The roster is locked after deployment. Return an unplayed tournament to registration before changing entrants.",
    );
  const teams = current.filter((team) => team.id !== id);
  if (eligible) teams.push(registrationTeam(entryId, entry));
  return {
    ...registeredRosterPatch(event, teams),
    tournamentTeamsData: teams,
    tournamentTeams: teams.map((team) => team.name),
  };
}
