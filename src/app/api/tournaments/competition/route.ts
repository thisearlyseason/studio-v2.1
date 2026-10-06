import {planTournamentOfficials} from '@/lib/tournament-official-allocation';
import { starterTournamentAllowed } from "@/lib/competition/plan-access";
import type { Resource } from "@/lib/competition/schedule";
import { surfaceLabel, venueKey } from "@/lib/competition/venues";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { verifyFirebaseToken } from "@/lib/api-auth";
import { adminDb } from "@/lib/firebase-admin";
import { resolveCompetitionAuthority } from "@/lib/server-competition-authority";
import {
  canonicalCompetitionRequest,
  runCompetitionOperation,
} from "@/lib/server-competition-operation";
import {
  ScheduleDeploymentError,
  assertScheduleMutationLock,
  withScheduleMutationLock,
} from "@/lib/server-schedule-deployment";
import {
  RequestBodyError,
  enforceUserRateLimit,
  readJsonBodyWithLimit,
} from "@/lib/server-request-guards";
import { isActiveTournamentPortal } from "@/lib/public-portal-data";
import {
  createCompetition,
  activeReservations,
  tournamentGames,
  type CompetitionDocument,
} from "@/lib/competition/document";
import { resolveCompetition } from "@/lib/competition/results";
import { mutateCompetition } from "@/lib/competition/mutations";
import { CompetitionError } from "@/lib/competition/types";
import {
  zonedInstant,
  minutes,
  validateActiveReservations,
  type Booking,
} from "@/lib/competition/schedule";
import { reachability } from "@/lib/competition/reachability";
import { verifyTournamentScorekeeperCode } from "@/lib/server-competition-credential";

export const runtime = "nodejs";
const validId = (id: string) => /^[A-Za-z0-9_-]{1,200}$/.test(id);
const clean = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function responseError(error: unknown) {
  if (
    error instanceof RequestBodyError ||
    error instanceof ScheduleDeploymentError
  )
    return NextResponse.json(
      { error: error.message },
      { status: error.status },
    );
  if (error instanceof CompetitionError)
    return NextResponse.json(
      { error: error.message, code: error.code, conflicts: error.conflicts },
      { status: 409 },
    );
  const message = error instanceof Error ? error.message : "";
  if (message.startsWith("Forbidden"))
    return NextResponse.json(
      { error: "Tournament access denied." },
      { status: 403 },
    );
  if (
    message.startsWith("Invalid competition") ||
    message === "Request collision."
  )
    return NextResponse.json({ error: message }, { status: 400 });
  if (error && typeof error === "object" && "issues" in error)
    return NextResponse.json(
      {
        error: "Invalid tournament configuration.",
        details: (error as { issues: unknown }).issues,
      },
      { status: 400 },
    );
  console.error("[competition]", error);
  return NextResponse.json(
    { error: "The tournament operation failed. Refresh and retry." },
    { status: 500 },
  );
}
export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get("teamId") || "",
      eventId = request.nextUrl.searchParams.get("eventId") || "";
    if (
      request.nextUrl.searchParams.get("catalog") === "true" &&
      validId(teamId)
    ) {
      const auth = await verifyFirebaseToken(request);
      if (auth instanceof Response) return auth;
      await resolveCompetitionAuthority({
        actorUid: auth.uid,
        actorRole: auth.role,
        teamId,
        domain: "tournament",
      });
      const [events, facilities, host] = await Promise.all([
        adminDb.collection("teams").doc(teamId).collection("events").get(),
        adminDb.collection("facilities").where("clubId", "==", auth.uid).get(),
        adminDb.collection("teams").doc(teamId).get(),
      ]);
      const teams = new Map<string, { id: string; name: string }>(),
        resources = new Map<string, Resource>();
      teams.set(teamId, {
        id: teamId,
        name: String(host.data()?.name || "Host team"),
      });
      for (const event of events.docs) {
        const data = event.data();
        for (const t of data.tournamentTeamsData || [])
          if (t.id && t.name)
            teams.set(t.teamId || t.id, { id: t.teamId || t.id, name: t.name });

      }
      const facilityOwners = [
        ...new Set(
          [host.data()?.ownerUserId, host.data()?.clubId].filter(
            (id): id is string => typeof id === "string" && id !== auth.uid,
          ),
        ),
      ];
      const relatedFacilities = await Promise.all(
        facilityOwners.map((id) =>
          adminDb.collection("facilities").where("clubId", "==", id).get(),
        ),
      );
      const accessibleFacilities = new Map(
        [
          ...facilities.docs,
          ...relatedFacilities.flatMap((snapshot) => snapshot.docs),
        ].map((f) => [f.id, f]),
      );
      for (const facility of accessibleFacilities.values()) {
        // Saved facilities are authoritative over historical tournament selections.
        for (const [id, resource] of resources) {
          if (
            resource.venueId === facility.id ||
            id.startsWith(`${facility.id}:`)
          )
            resources.delete(id);
        }
        if (
          facility.data().isArchived ||
          facility.data().isDeleted ||
          facility.data().isActive === false ||
          facility.data().is_active === false
        )
          continue;
        const fields = await facility.ref.collection("fields").get();
        for (const f of fields.docs) {
          if (
            f.data().isArchived ||
            f.data().isDeleted ||
            f.data().isActive === false ||
            f.data().is_active === false ||
            f.data().status === "inactive"
          )
            continue;
          const name = String(f.data().name || f.id),
            id = `${facility.id}:${name}`;
          resources.set(id, {
            id,
            name: `${facility.data().name} — ${name}`,
            venueId: facility.id,
            venueName: String(facility.data().name || facility.id),
            surfaceName: name,
            address: String(facility.data().address || ""),
          });
        }
      }
      return NextResponse.json(
        { teams: [...teams.values()], resources: [...resources.values()] },
        { headers: { "Cache-Control": "no-store" } },
      );
    }
    if (!validId(teamId) || !validId(eventId))
      return NextResponse.json(
        { error: "Invalid tournament." },
        { status: 400 },
      );
    const [team, event] = await Promise.all([
      adminDb.collection("teams").doc(teamId).get(),
      adminDb
        .collection("teams")
        .doc(teamId)
        .collection("events")
        .doc(eventId)
        .get(),
    ]);
    const data = event.data(),
      competition = data?.competition as CompetitionDocument | undefined;
    if (
      !competition ||
      !isActiveTournamentPortal(teamId, team.data(), {
        ...data,
        competition: undefined,
      })
    )
      return NextResponse.json(
        { error: "Tournament unavailable." },
        { status: 404 },
      );
    if (request.nextUrl.searchParams.get("public") !== "true") {
      const auth = await verifyFirebaseToken(request);
      if (auth instanceof Response) return auth;
      await resolveCompetitionAuthority({
        actorUid: auth.uid,
        actorRole: auth.role,
        teamId,
        domain: "tournament",
      });
    } else if (competition.status !== "published")
      return NextResponse.json(
        { error: "This tournament has not been published." },
        { status: 404 },
      );
    // The document contains only competition display data, never credentials or participant contacts.
    const publicDocument =
      request.nextUrl.searchParams.get("public") === "true"
        ? { ...competition, swissPreview: undefined }
        : competition;
    return NextResponse.json(
      {
        competition: {...publicDocument, officialAssignments: Object.fromEntries((data?.tournamentGames || []).filter((g: any) => g.refereeId).map((g: any) => [g.id, {refereeId:g.refereeId, refereeName:g.refereeName}]))},
        credentialVersion: Number(data?.credentialVersion || 0),
        lifecycleVersion: Number(data?.lifecycleVersion || 0),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return responseError(error);
  }
}
export async function POST(request: NextRequest) {
  try {
    const body = await readJsonBodyWithLimit<Record<string, unknown>>(
      request,
      700000,
    );
    const action = String(body.action || ""),
      teamId = String(body.teamId || ""),
      suppliedEventId = String(body.eventId || "");
    if (!validId(teamId) || (action !== "create" && !validId(suppliedEventId)))
      return NextResponse.json(
        { error: "Invalid tournament." },
        { status: 400 },
      );
    const code = typeof body.code === "string" ? body.code : "";
    const usingCode = action === "score" && !!code;
    const auth = usingCode ? null : await verifyFirebaseToken(request);
    if (auth instanceof Response) return auth;
    const limited = await enforceUserRateLimit(
      auth?.uid || `competition:${teamId}:${suppliedEventId}`,
      usingCode ? "competition-code-score" : "competition-workspace",
      usingCode ? 60 : 300,
      3600000,
    );
    if (limited) return limited;
    const payload =
      body.payload &&
      typeof body.payload === "object" &&
      !Array.isArray(body.payload)
        ? (body.payload as Record<string, unknown>)
        : {};
    const identity = canonicalCompetitionRequest({
      requestId: String(body.requestId || ""),
      tenantId: teamId,
      kind: "tournament-workspace",
      payload: {
        action,
        eventId: suppliedEventId,
        revision: body.revision ?? 0,
        payload,
      },
    });
    const eventId = suppliedEventId || `trn_${identity.operationId.slice(12)}`;
    const eventRef = adminDb
      .collection("teams")
      .doc(teamId)
      .collection("events")
      .doc(eventId);
    const actorUid = auth?.uid || `scorekeeper:${teamId}:${eventId}`;
    const result = await withScheduleMutationLock((holder) =>
      runCompetitionOperation(
        {
          actorUid,
          identity,
          authorizeTransaction: async (transaction) => {
            await assertScheduleMutationLock(transaction, holder);
            const team = (
              await transaction.get(adminDb.collection("teams").doc(teamId))
            ).data();
            if (!team)
              throw new CompetitionError(
                "TEAM_MISSING",
                "Tournament host not found.",
              );
            if (usingCode) {
              const [event, credential] = await Promise.all([
                transaction.get(eventRef),
                transaction.get(eventRef.collection("private").doc("scoring")),
              ]);
              if (
                !isActiveTournamentPortal(teamId, team, event.data()) ||
                !credential.exists ||
                !verifyTournamentScorekeeperCode(
                  teamId,
                  eventId,
                  code,
                  String(credential.data()?.scorekeeperCodeHash || ""),
                )
              )
                throw new Error("Forbidden scorekeeper access.");
              if (
                Number(body.credentialVersion) !==
                  Number(credential.data()?.credentialVersion) ||
                Number(event.data()?.credentialVersion) !==
                  Number(credential.data()?.credentialVersion)
              )
                throw new CompetitionError(
                  "CREDENTIAL_CHANGED",
                  "The scoring code changed. Refresh and enter the current code.",
                );
            } else
              await resolveCompetitionAuthority({
                transaction,
                actorUid: auth!.uid,
                actorRole: auth!.role,
                teamId,
                domain: "tournament",
              });
            const stored = (await transaction.get(eventRef)).data();
            const proposedRules = ["create", "configure"].includes(action)
              ? (
                  payload.setup as {
                    rules?: {
                      format?: string;
                      seriesLength?: number;
                      seriesByRound?: Record<string, number>;
                    };
                  }
                )?.rules
              : stored?.competition?.topology?.rules || {
                  format: stored?.tournamentType,
                };
            if (team.isPro !== true && !starterTournamentAllowed(proposedRules))
              throw new CompetitionError(
                "PLAN_REQUIRED",
                "Starter includes Single Elimination Pool only. Upgrade to unlock other tournament formats and multi-game series.",
              );
          },
        },
        async ({ transaction }) => {
          const snapshot = await transaction.get(eventRef);
          let current: CompetitionDocument;
          if (action === "create") {
            if (snapshot.exists)
              throw new CompetitionError(
                "EVENT_EXISTS",
                "This tournament already exists.",
              );
            current = createCompetition(payload.setup);
          } else {
            const event = snapshot.data();
            if (
              !event ||
              event.isArchived ||
              event.isDeleted ||
              event.is_active === false ||
              event.status === "cancelled" ||
              event.teamId !== teamId
            )
              throw new CompetitionError(
                "EVENT_INACTIVE",
                "Tournament unavailable.",
              );
            current = event.competition as CompetitionDocument;
            if (current?.version !== 2)
              throw new CompetitionError(
                "LEGACY_EVENT",
                "Manage this event with its existing tournament workflow.",
              );
            if (
              !Number.isInteger(body.revision) ||
              body.revision !== current.revision
            )
              throw new CompetitionError(
                "STALE_REVISION",
                "This tournament changed. Refresh before retrying.",
              );
          }
          if (action === "deploy") {
            const entries = await transaction.get(eventRef.collection("registrationEntries"));
            for (const entry of entries.docs) {
              const registration = entry.data();
              if (current.topology.teams.some(team => team.id === `p_${entry.id}`)) {
                const paid = Number(registration.payment?.amount || 0) === 0 || (registration.payment?.mode === "stripe" ? registration.payment?.status === "paid" : registration.payment_received === true && registration.payment?.status === "confirmed");
                if (registration.status !== "accepted" || !paid) throw new CompetitionError("UNCONFIRMED_REGISTRATION", "Confirm every included registration and its payment before deployment.");
              }
              if (registration.status === "pending" && registration.checkoutSessionId && registration.payment?.status !== "paid") throw new CompetitionError("PAYMENT_PENDING", "A Stripe checkout is outstanding. Wait for payment confirmation or decline that registration before deployment.");
            }
          }
          const sourceId = `tournament:${teamId}:${eventId}`;
          const owned = await transaction.get(
            adminDb
              .collection("scheduleBookings")
              .where("sourceId", "==", sourceId),
          );
          const activeForms = action === "reopen-registration" ? await transaction.get(eventRef.collection("registration").where("is_active", "==", true)) : null;
          const bookings: Booking[] = [];
          // Include adjacent calendar dates because new tournaments use explicit timezones.
          const dates = new Set<string>();
          for (const w of [...current.options.windows, ...(action === "create-playoffs" && payload.window && typeof (payload.window as {date?: unknown}).date === "string" ? [payload.window as {date: string}] : [])])
            for (const delta of [-1, 0, 1])
              dates.add(
                new Date(Date.parse(`${w.date}T12:00:00Z`) + delta * 86400000)
                  .toISOString()
                  .slice(0, 10),
              );
          for (const date of dates) {
            const existing = await transaction.get(
              adminDb.collection("scheduleBookings").where("date", "==", date),
            );
            for (const entry of existing.docs) {
              const b = entry.data();
              if (b.sourceId === sourceId) continue;
              const timezone = String(
                b.timezone || current.topology.rules.timezone,
              );
              const start = Number.isFinite(b.startMs)
                ? b.startMs
                : zonedInstant(String(b.date), Number(b.startMinute), timezone);
              const end = Number.isFinite(b.endMs)
                ? b.endMs
                : start + (Number(b.endMinute) - Number(b.startMinute)) * 60000;
              if (
                !Number.isFinite(start) ||
                !Number.isFinite(end) ||
                end <= start
              )
                throw new CompetitionError(
                  "INVALID_EXISTING_BOOKING",
                  "An existing booking has invalid timing and must be repaired before publishing.",
                );
              bookings.push({
                id: entry.id,
                resourceId: String(b.resourceId),
                teamIds: Array.isArray(b.teamIds) ? b.teamIds : [],
                start,
                end,
                rest: Number(b.restMinutes || 0),
                venueKey:
                  typeof b.venueKey === "string"
                    ? b.venueKey
                    : typeof b.resourceId === "string" &&
                        b.resourceId.includes(":")
                      ? b.resourceId.split(":")[0]
                      : undefined,
                travel: Number(b.travelMinutes || 0),
                turnaround: Number(b.turnaroundMinutes || 0),
                conflictsWith: Array.isArray(b.conflictingResourceIds)
                  ? b.conflictingResourceIds
                  : [],
              });
            }
          }
          const next =
            action === "create"
              ? current
              : mutateCompetition(current, action, payload, bookings);
          const reservations =
            next.status === "published" ? activeReservations(next) : [];
          const conflicts = validateActiveReservations(
            next.topology,
            reservations,
            { ...next.options, bookings },
          );
          if (conflicts.length)
            throw new CompetitionError(
              "BOOKING_CONFLICT",
              "Existing bookings prevent this change.",
              conflicts,
            );
          const paths = reachability(next.topology);
          const { states } = resolveCompetition(
            next.topology,
            next.results,
            next.approvals,
          );
          const writes = new Map<string, Record<string, unknown>>();
          for (const slot of reservations) {
            const id = `competition_${createHash("sha256").update(`${sourceId}:${slot.id}`).digest("hex").slice(0, 40)}`;
            const state = states.get(slot.matchId)!;
            writes.set(id, {
              id,
              sourceType: "tournament",
              hostTeamId: teamId,
              eventId,
              sourceId,
              sourceGameId: slot.id,
              teamIds: state.teamIds.every(Boolean)
                ? state.teamIds
                : [...paths.get(slot.matchId)!.keys()],
              resourceId: slot.resourceId,
              conflictingResourceIds:
                next.options.resources.find((r) => r.id === slot.resourceId)
                  ?.conflictsWith || [],
              location: surfaceLabel(
                next.options.resources.find((r) => r.id === slot.resourceId)!,
              ),
              date: slot.date,
              startMinute: minutes(slot.time),
              endMinute: minutes(slot.time) + next.options.duration,
              startMs: slot.start,
              endMs: slot.end,
              timezone: next.topology.rules.timezone,
              restMinutes: next.options.rest,
              venueKey: venueKey(
                next.options.resources.find((r) => r.id === slot.resourceId)!,
              ),
              travelMinutes: next.options.travel || 0,
              turnaroundMinutes: next.options.turnaround,
            });
          }
          const removals = owned.docs.filter((old) => !writes.has(old.id));
          const oldById = new Map(
            owned.docs.map((old) => [old.id, old.data()]),
          );
          const changes = [...writes].filter(([id, value]) => {
            const old = oldById.get(id);
            return (
              !old ||
              Object.keys(value).some(
                (key) =>
                  JSON.stringify(old[key]) !== JSON.stringify(value[key]),
              )
            );
          });
          if (changes.length + removals.length > 390)
            throw new CompetitionError(
              "ATOMIC_CAPACITY",
              "This operation exceeds the atomic booking limit (390 changed bookings). Reduce the event size or series length. No changes were saved.",
            );
          const previousGames = snapshot.data()?.tournamentGames || [];
          const projectedGames = tournamentGames(next).map((game) => {
            const old = previousGames.find(
              (item: { id: string }) => item.id === game.id,
            );
            if (!old?.refereeId) return game;
            return {
              ...game,
              refereeId: old.refereeId,
              refereeName: old.refereeName,
            };
          });
          const officialPlan = await planTournamentOfficials(adminDb, transaction, teamId, eventId, {...snapshot.data(), competition: next, gameLength: next.options.duration}, projectedGames);
          if (officialPlan.writeCount + changes.length + removals.length > 430) throw new CompetitionError("OFFICIAL_WRITE_LIMIT", "Too many schedule and referee changes to save atomically.");
          for (const old of removals) transaction.delete(old.ref);
          for (const [id, booking] of changes)
            transaction.set(adminDb.collection("scheduleBookings").doc(id), {
              ...booking,
              updatedAt: next.updatedAt,
            });
          officialPlan.apply();
          next.officialAssignments = Object.fromEntries(officialPlan.games.filter(g => g.refereeId).map(g => [g.id, {refereeId:g.refereeId, refereeName:g.refereeName}]));
          const base = {
            competition: clean(next),
            title: next.title,
            teamId,
            isTournament: true,
            eventType: "tournament",
            tournamentType: next.topology.rules.format,
            tournamentTeams: next.topology.teams.map((t) => t.name),
            tournamentTeamsData: next.topology.teams.map((t) => ({
              ...((snapshot.data()?.tournamentTeamsData || []).find(
                (old: { id: string }) => old.id === t.id,
              ) || {}),
              ...t,
            })),
            tournamentGames: clean(officialPlan.games),
            date: next.options.windows[0].date,
            endDate: next.options.windows[next.options.windows.length - 1].date,
            location: next.options.resources.map(surfaceLabel).join(", "),
            gameLength: next.options.duration,
            breakLength: next.options.rest,
            maxDailyGamesPerTeam: next.options.maxGamesPerDay,
            selectedFields: next.options.resources.map((r) => r.id),
            dailyWindows: next.options.windows,
            updatedAt: next.updatedAt,
            lifecycleVersion:
              Number(snapshot.data()?.lifecycleVersion || 0) + 1,
            scheduleVersion: Number(snapshot.data()?.scheduleVersion || 0) + 1,
            registrationOpen: next.phase === "registration" ? (activeForms ? !activeForms.empty : snapshot.data()?.registrationOpen === true) : false,
            scheduleStatus: next.status === "published" ? "ready" : "pending",
            deploymentStatus:
              next.status === "published" ? "deployed" : "undeployed",
          };
          if (action === "create")
            transaction.create(eventRef, {
              ...base,
              createdBy: actorUid,
              createdAt: next.updatedAt,
              is_active: true,
            });
          else transaction.update(eventRef, base);
          transaction.create(
            eventRef.collection("scheduleAudits").doc(identity.operationId),
            { action, actorUid, revision: next.revision, at: next.updatedAt },
          );
          return {
            eventId,
            competition: next,
            lifecycleVersion: base.lifecycleVersion,
          };
        },
      ),
    );
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return responseError(error);
  }
}
