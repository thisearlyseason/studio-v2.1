import { mutateCompetition } from "./mutations";
import type { CompetitionDocument } from "./document";
/** Keep the authoritative draft topology and registration roster in the same transaction. */
export function registeredRosterPatch(
  event: { competition?: CompetitionDocument; lifecycleVersion?: number },
  teams: { id: string; name: string }[],
) {
  if (event.competition?.version !== 2) return {};
  const doc = event.competition;
  const next = mutateCompetition(doc, "configure", {
    setup: {
      title: doc.title,
      registrationFirst: doc.phase === "registration",
      teams: teams.map((t) => ({ id: t.id, name: t.name })),
      rules: doc.topology.rules,
      options: doc.options,
    },
  });
  return {
    competition: JSON.parse(JSON.stringify(next)),
    lifecycleVersion: Number(event.lifecycleVersion || 0) + 1,
  };
}
