import { registrationConfigHash } from "../../src/lib/registration-policy.ts";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import admin from "firebase-admin";
if (
  process.env.GCLOUD_PROJECT !== "demo-squad-tournaments" ||
  process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:58080" ||
  process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:59099"
)
  throw new Error(
    "This test only runs against the isolated local tournament emulators.",
  );
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = admin.firestore();
const runId = randomUUID().slice(0, 8);
const uid = `tournament-qa-${runId}`,
  email = `tournament-qa-${runId}@example.test`,
  password = "LocalOnlyTournamentQA2026!";
try {
  await admin.auth().createUser({ uid, email, password, emailVerified: true });
} catch (e) {
  if (
    e.code !== "auth/uid-already-exists" &&
    e.code !== "auth/email-already-exists"
  )
    throw e;
}
await db.doc(`users/${uid}`).set({
  email,
  role: "coach",
  status: "active",
  planId: "elite_league",
  isPro: true,
});
const teamId = `qa_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
await db.doc(`teams/${teamId}`).set({
  name: "Tournament QA Club",
  ownerUserId: uid,
  isPro: true,
  planId: "elite_league",
  is_active: true,
});
const auth = await fetch(
  "http://127.0.0.1:59099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=demo-key",
  {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  },
).then((r) => r.json());
assert.ok(auth.idToken);
const root = "http://localhost:9019";
let checks = 0;
async function request(body, { token = auth.idToken } = {}) {
  const response = await fetch(`${root}/api/tournaments/competition`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}
async function act(state, action, payload = {}, options = {}) {
  return request(
    {
      action,
      teamId,
      eventId: state?.eventId || "",
      revision: state?.competition?.revision || 0,
      requestId: randomUUID(),
      payload,
      ...options.body,
    },
    options,
  );
}
function okay(result) {
  assert.equal(result.status, 200, JSON.stringify(result.body));
  checks++;
  return result.body;
}
const suffix = randomUUID().slice(0, 8);
const setup = {
  title: "Tournament HTTP QA",
  teams: Array.from({ length: 4 }, (_, i) => ({
    id: `${suffix}_t${i}`,
    name: `Team ${i + 1}`,
  })),
  rules: {
    version: 2,
    format: "single_elimination",
    timezone: "America/Edmonton",
  },
  options: {
    resources: [
      {
        id: `${suffix}_court1`,
        name: "North — Court 1",
        venueId: "north",
        venueName: "North Arena",
        surfaceName: "Court 1",
        address: "100 North Road",
      },
      {
        id: `${suffix}_court2`,
        name: "South — Court 1",
        venueId: "south",
        venueName: "South Arena",
        surfaceName: "Court 1",
        address: "200 South Road",
      },
    ],
    windows: [{ date: "2026-10-10", startTime: "08:00", endTime: "20:00" }],
    duration: 20,
    rest: 10,
    turnaround: 5,
    maxGamesPerDay: 6,
  },
};
let state = okay(await act(null, "create", { setup }));
let publicResponse = await fetch(
  `${root}/api/tournaments/competition?teamId=${teamId}&eventId=${state.eventId}&public=true`,
);
assert.equal(publicResponse.status, 404);
checks++;
state = okay(await act(state, "generate"));
assert.equal(state.competition.schedule.length, 3);
checks++;
state = okay(await act(state, "publish"));
publicResponse = await fetch(
  `${root}/api/tournaments/competition?teamId=${teamId}&eventId=${state.eventId}&public=true`,
);
assert.equal(publicResponse.status, 200);
const dto = await publicResponse.json();
assert.equal(dto.competition.status, "published");
assert.deepEqual(dto.competition.options.resources, setup.options.resources);
checks++;
assert.ok(!JSON.stringify(dto).includes("scorekeeperCodeHash"));
checks++;
const second = state.competition.schedule[1],
  first = state.competition.schedule[0];
const before = state.competition.revision;
const invalid = await act(state, "move", {
  gameId: second.id,
  date: first.date,
  time: first.time,
  resourceId: first.resourceId,
});
assert.equal(invalid.status, 409);
assert.equal(
  (await db.doc(`teams/${teamId}/events/${state.eventId}`).get()).data()
    .competition.revision,
  before,
);
checks++;
state = okay(
  await act(state, "score", {
    result: {
      matchId: state.competition.topology.matches[0].id,
      game: 1,
      score1: 2,
      score2: 1,
    },
  }),
);
const stale = await request({
  action: "score",
  teamId,
  eventId: state.eventId,
  revision: before,
  requestId: randomUUID(),
  payload: {
    result: {
      matchId: state.competition.topology.matches[1].id,
      game: 1,
      score1: 1,
      score2: 0,
    },
  },
});
assert.equal(stale.status, 409);
checks++;
const forbidden = await act(state, "generate", {}, { token: null });
assert.equal(forbidden.status, 401);
checks++;
// A scorer has only code-scoped scoring access; public links never grant mutation authority.
const credential = await fetch(`${root}/api/tournaments/credential`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth.idToken}`,
  },
  body: JSON.stringify({
    teamId,
    eventId: state.eventId,
    requestId: randomUUID(),
    scoringCode: "QAONLY42",
    expectedLifecycleVersion: state.lifecycleVersion,
    expectedCredentialVersion: 0,
  }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
okay(credential);
state = okay(
  await act(
    state,
    "score",
    {
      result: {
        matchId: state.competition.topology.matches[1].id,
        game: 1,
        score1: 1,
        score2: 0,
      },
    },
    { token: null, body: { code: "QAONLY42", credentialVersion: 1 } },
  ),
);
const badCode = await act(
  state,
  "score",
  {
    result: {
      matchId: state.competition.topology.matches[2].id,
      game: 1,
      score1: 1,
      score2: 0,
    },
  },
  { token: null, body: { code: "WRONG", credentialVersion: 1 } },
);
assert.equal(badCode.status, 403);
checks++;
// Two independently generated drafts race to book the same shared surfaces.
const raceSetup = {
  ...setup,
  title: "Concurrent scheduling QA",
  teams: setup.teams.map((t) => ({ ...t, id: `race_${t.id}` })),
  options: {
    ...setup.options,
    windows: [{ date: "2026-10-11", startTime: "08:00", endTime: "10:00" }],
    resources: [setup.options.resources[0]],
  },
};
let a = okay(await act(null, "create", { setup: raceSetup })),
  b = okay(
    await act(null, "create", {
      setup: { ...raceSetup, title: "Concurrent scheduling QA B" },
    }),
  );
a = okay(await act(a, "generate"));
b = okay(await act(b, "generate"));
const race = await Promise.all([act(a, "publish"), act(b, "publish")]);
assert.equal(
  race.filter((r) => r.status === 200).length,
  1,
  JSON.stringify(race.map((r) => ({ status: r.status, error: r.body.error }))),
);
checks++;
// Revoke code and prove previously granted scoring can no longer write.
const revoked = await fetch(`${root}/api/tournaments/credential`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    Authorization: `Bearer ${auth.idToken}`,
  },
  body: JSON.stringify({
    teamId,
    eventId: state.eventId,
    requestId: randomUUID(),
    revoke: true,
    scoringCode: "QAONLY42",
    expectedLifecycleVersion: state.lifecycleVersion,
    expectedCredentialVersion: 1,
  }),
}).then(async (r) => ({ status: r.status, body: await r.json() }));
okay(revoked);
const deniedAfterRevoke = await act(
  state,
  "score",
  {
    result: {
      matchId: state.competition.topology.matches[2].id,
      game: 1,
      score1: 1,
      score2: 0,
    },
  },
  { token: null, body: { code: "QAONLY42", credentialVersion: 1 } },
);
assert.equal(deniedAfterRevoke.status, 403);
checks++;
const formats = [
  "single_elimination",
  "double_elimination",
  "round_robin",
  "double_round_robin",
  "pool_play",
  "pool_play_knockout",
  "pool_double_elimination",
  "tiered_playoffs",
  "consolation",
  "placement",
  "swiss",
  "best_of_series",
  "custom",
];
for (const [i, format] of formats.entries()) {
  const entrants = setup.teams
    .slice(0, format === "best_of_series" ? 2 : 4)
    .map((t) => ({ ...t, id: `${format}_${t.id}` }));
  const config = {
    ...setup,
    title: `Format QA ${format}`,
    teams: entrants,
    rules: {
      ...setup.rules,
      format,
      poolCount: 2,
      advancePerPool: 1,
      tiers: [
        { name: "Gold", size: 2 },
        { name: "Silver", size: 2 },
      ],
      swissRounds: 3,
      seriesLength: format === "best_of_series" ? 3 : 1,
      customPools: [
        { name: "Group", teamIds: entrants.map((t) => t.id), cycles: 1 },
      ],
      customMatches: [
        {
          id: "final",
          stage: "Final",
          round: 1,
          sources: [
            { kind: "rank", group: "Group", rank: 1 },
            { kind: "rank", group: "Group", rank: 2 },
          ],
        },
      ],
    },
    options: {
      ...setup.options,
      resources: [{ id: `${suffix}_${format}_f`, name: "Field" }],
      windows: [
        {
          date: `2026-11-${String(i + 1).padStart(2, "0")}`,
          startTime: "08:00",
          endTime: "22:00",
        },
      ],
      maxGamesPerDay: 20,
    },
  };
  let event = okay(await act(null, "create", { setup: config }));
  event = okay(await act(event, "generate"));
  event = okay(await act(event, "publish"));
  assert.equal(event.competition.status, "published");
  if (format === "best_of_series") {
    const matchId = event.competition.topology.matches[0].id;
    for (let game = 1; game <= 2; game++)
      event = okay(
        await act(event, "score", {
          result: { matchId, game, score1: 2, score2: 0 },
        }),
      );
    const reservations = await db
      .collection("scheduleBookings")
      .where("sourceId", "==", `tournament:${teamId}:${event.eventId}`)
      .get();
    assert.equal(reservations.size, 2);
    checks++;
  }
}
// Exercise Starter enforcement through the same authenticated API, not UI-only gating.
await db
  .doc(`teams/${teamId}`)
  .update({ isPro: false, planId: "starter_squad" });
for (const format of [
  "single_elimination",
  "double_elimination",
  "round_robin",
  "double_round_robin",
  "pool_play",
  "pool_play_knockout",
  "pool_double_elimination",
  "tiered_playoffs",
  "consolation",
  "placement",
  "swiss",
  "best_of_series",
  "custom",
]) {
  const attempt = await request({
    action: "create",
    teamId,
    requestId: randomUUID(),
    payload: {
      setup: {
        ...setup,
        title: `Starter ${format}`,
        rules: { ...setup.rules, format },
      },
    },
  });
  assert.equal(
    attempt.status,
    format === "single_elimination" ? 200 : 409,
    format + JSON.stringify(attempt.body),
  );
  checks++;
  if (format === "single_elimination") {
    const created = attempt.body;
    const configure = await request({
      action: "configure",
      teamId,
      eventId: created.eventId,
      revision: created.competition.revision,
      requestId: randomUUID(),
      payload: {
        setup: { ...setup, rules: { ...setup.rules, format: "round_robin" } },
      },
    });
    assert.equal(configure.status, 409);
    checks++;
    const generated = await request({
      action: "generate",
      teamId,
      eventId: created.eventId,
      revision: created.competition.revision,
      requestId: randomUUID(),
      payload: {},
    });
    assert.equal(generated.status, 200, JSON.stringify(generated.body));
    checks++;
  }
}
await db.doc(`teams/${teamId}`).update({ isPro: true, planId: "elite_league" });
// Restoration coverage: saved facility activity, signup, officials, and clone parity.
const facilityId = `facility_${suffix}`;
await db
  .doc(`facilities/${facilityId}`)
  .set({ name: "QA Championship Arena", clubId: uid });
await db
  .doc(`facilities/${facilityId}/fields/active`)
  .set({ name: "Court A", isActive: true });
await db
  .doc(`facilities/${facilityId}/fields/inactive`)
  .set({ name: "Court B", isActive: false });
const catalog = await fetch(
  `${root}/api/tournaments/competition?catalog=true&teamId=${teamId}`,
  { headers: { Authorization: `Bearer ${auth.idToken}` } },
).then((r) => r.json());
assert.ok(catalog.resources.some((r) => r.id === `${facilityId}:Court A`));
checks++;
assert.ok(!catalog.resources.some((r) => r.id === `${facilityId}:Court B`));
checks++;
let restored = okay(
  await act(null, "create", {
    setup: {
      ...setup,
      title: "Restored portals QA",
      teams: setup.teams.slice(0, 2),
      rules: { ...setup.rules, format: "single_elimination" },
      options: {
        ...setup.options,
        resources: [
          {
            id: `${facilityId}:Court A`,
            name: "QA Championship Arena — Court A",
            venueId: facilityId,
            venueName: "QA Championship Arena",
            surfaceName: "Court A",
          },
        ],
      },
    },
  }),
);
const restoredRef = db.doc(`teams/${teamId}/events/${restored.eventId}`);
const config = {
  title: "Tournament signup",
  description: "",
  is_active: true,
  type: "team",
  form_schema: [
    { id: "teamName", label: "Team Name", type: "short_text", required: true },
    {
      id: "name",
      label: "Head Coach Name",
      type: "short_text",
      required: true,
    },
    { id: "email", label: "Email Address", type: "email", required: true },
  ],
  form_version: 1,
  registration_cost: "0",
  offline_payment_instructions: "",
  currency: "CAD",
  waiver_mode: "none",
  require_default_waiver: false,
  default_waiver_text: "",
  custom_waiver_text: "",
  team_waivers_content: [],
};
config.config_hash = registrationConfigHash(config);
await restoredRef.collection("registration").doc("team_config").set(config);
await restoredRef.update({ registrationOpen: true });
const publicForm = await fetch(
  `${root}/api/public/portals?kind=tournament-registration&teamId=${teamId}&eventId=${restored.eventId}`,
);
assert.equal(publicForm.status, 200);
checks++;
assert.deepEqual((await publicForm.json()).data.event.tournamentGames, []);
checks++;
const signup = await fetch(`${root}/api/public/portals/action`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    kind: "tournament",
    action: "register",
    teamId,
    eventId: restored.eventId,
    protocolId: "team_config",
    requestId: randomUUID(),
    formVersion: 1,
    formHash: config.config_hash,
    answers: {
      teamName: "Registered Lions",
      name: "QA Coach",
      email: "signup@example.test",
    },
  }),
});
assert.equal(signup.status, 200, JSON.stringify(await signup.json()));
checks++;
restored.competition = (await restoredRef.get()).data().competition;
assert.equal(restored.competition.topology.teams.length, 3);
checks++;
restored = okay(await act(restored, "generate"));
restored = okay(await act(restored, "publish"));
async function legacyCommand(path, payload) {
  const response = await fetch(`${root}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${auth.idToken}`,
    },
    body: JSON.stringify({
      ...payload,
      teamId,
      eventId: restored.eventId,
      requestId: randomUUID(),
    }),
  });
  const body = await response.json();
  assert.equal(response.status, 200, JSON.stringify(body));
  checks++;
  return body;
}
let event = (await restoredRef.get()).data();
await legacyCommand("/api/tournaments/schedule", {
  action: "add-referee",
  expectedVersion: event.lifecycleVersion,
  expectedScheduleVersion: event.scheduleVersion,
  referee: { name: "QA Referee", email: `referee-${suffix}@example.test` },
});
event = (await restoredRef.get()).data();
const game = event.tournamentGames.find(
  (g) => g.team1Id && g.team2Id && g.team1Id !== "tbd" && g.team2Id !== "tbd",
);
await legacyCommand("/api/tournaments/schedule", {
  action: "assign-referee",
  expectedVersion: event.lifecycleVersion,
  expectedScheduleVersion: event.scheduleVersion,
  gameId: game.id,
  refereeId: event.refereePool[0].id,
});
restored = okay(
  await act(restored, "score", {
    result: {
      matchId: restored.competition.schedule.find((slot) => slot.id === game.id)
        .matchId,
      game: 1,
      score1: 2,
      score2: 0,
    },
  }),
);
event = (await restoredRef.get()).data();
assert.ok(event.tournamentGames.find((g) => g.id === game.id).refereeId);
checks++;
const clone = await legacyCommand("/api/tournaments/lifecycle", {
  action: "replicate",
  expectedVersion: event.lifecycleVersion,
  payload: { title: `Restored clone ${suffix}` },
});
const cloned = (
  await db.doc(`teams/${teamId}/events/${clone.eventId}`).get()
).data();
assert.equal(cloned.competition.status, "draft");
assert.equal(cloned.competition.schedule.length, 0);
assert.equal(cloned.refereePool.length, 0);
checks++;
assert.equal(
  (
    await db
      .doc(`teams/${teamId}/events/${clone.eventId}/registration/team_config`)
      .get()
  ).data().is_active,
  false,
);
checks++;
console.log(
  JSON.stringify({
    restoredTeamId: teamId,
    restoredEventId: restored.eventId,
    cloneEventId: clone.eventId,
  }),
);
// Registration-first lifecycle uses real HTTP routes and isolated emulator data.
let registrationDraft=okay(await act(null,'create',{setup:{...setup,title:'Registration first QA',registrationFirst:true,teams:[],rules:{version:2,format:'round_robin',timezone:'UTC'},options:{...setup.options,resources:[{id:`reg_court_${runId}`,name:'Registration court'}],windows:[{date:'2026-11-10',startTime:'08:00',endTime:'22:00'}]}}}));
assert.equal(registrationDraft.competition.topology.matches.length,0);checks++;
const postRegistration=async(path,body,token=auth.idToken)=>{const response=await fetch(`${root}${path}`,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});const data=await response.json();assert.equal(response.status,200,JSON.stringify(data));checks++;return data;};
let formConfig;
async function saveRegistrationForm(cost){const config={title:'QA team form',description:'',type:'team',is_active:true,registration_cost:String(cost),currency:'CAD',payment_method:'offline',offline_payment_instructions:'Pay organizer',waiver_mode:'none',form_schema:[]};const result=await postRegistration('/api/registrations/config',{targetKind:'tournament',targetId:teamId,eventId:registrationDraft.eventId,configId:'team_config',expectedVersion:formConfig?.form_version||0,expectedHash:formConfig?.config_hash||'',config});formConfig=result.config;}
async function registerTeam(i){return postRegistration('/api/public/portals/action',{kind:'tournament',action:'register',teamId,eventId:registrationDraft.eventId,protocolId:'team_config',requestId:randomUUID(),formVersion:formConfig.form_version,formHash:formConfig.config_hash,answers:{teamName:`Registration ${i}`,name:`Coach ${i}`,email:`${runId}-${i}@example.test`}},null);}
await saveRegistrationForm(0);await registerTeam(1);await registerTeam(2);
await saveRegistrationForm(25);const offlineA=await registerTeam(3),offlineB=await registerTeam(4);
const registrationRef=db.doc(`teams/${teamId}/events/${registrationDraft.eventId}`);
assert.equal((await registrationRef.get()).data().competition.topology.teams.length,2);checks++;
for(const entry of [offlineA,offlineB])await postRegistration('/api/public/portals/action',{kind:'tournament',action:'update-registration',teamId,eventId:registrationDraft.eventId,entryId:entry.entryId,status:'accepted'});
registrationDraft.competition=(await registrationRef.get()).data().competition;
assert.equal(registrationDraft.competition.topology.teams.length,4);checks++;
assert.equal((await act(registrationDraft,'deploy',{confirmedTeamIds:[]})).status,409);checks++;
registrationDraft=okay(await act(registrationDraft,'deploy',{confirmedTeamIds:registrationDraft.competition.topology.teams.map(t=>t.id)}));
assert.equal((await registrationRef.get()).data().registrationOpen,false);checks++;
for(const match of registrationDraft.competition.topology.matches)registrationDraft=okay(await act(registrationDraft,'score',{result:{matchId:match.id,game:1,score1:5,score2:2}}));
const {playoffSeeds}=await import('../../src/lib/competition/playoffs.ts');
const blockedRef=db.doc(`scheduleBookings/registration_future_${runId}`);
await blockedRef.set({sourceId:`league:other_${runId}`,resourceId:`reg_court_${runId}`,date:'2026-11-11',timezone:'UTC',startMs:Date.parse('2026-11-11T08:00:00Z'),endMs:Date.parse('2026-11-11T22:00:00Z'),teamIds:[]});
const finalsPayload={qualifiers:4,brackets:1,confirmedTeamIds:playoffSeeds(registrationDraft.competition,4).map(row=>row.teamId),window:{date:'2026-11-11',startTime:'08:00',endTime:'22:00'}};
assert.equal((await act(registrationDraft,'create-playoffs',finalsPayload)).status,409);checks++;
assert.equal((await registrationRef.get()).data().competition.finalsCreated,undefined);checks++;
await blockedRef.delete();
registrationDraft=okay(await act(registrationDraft,'create-playoffs',finalsPayload));
assert.equal(registrationDraft.competition.finalsCreated,true);checks++;
console.log(JSON.stringify({registrationFirstTeamId:teamId,registrationFirstEventId:registrationDraft.eventId}));
await writeFile(
  "docs/implementation/tournament-http-evidence.json",
  JSON.stringify(
    {
      checks,
      teamId,
      eventId: state.eventId,
      publicUrl: `${root}/tournaments/live/${teamId}/${state.eventId}`,
      verified: [
        "draft privacy",
        "generation",
        "publication",
        "invalid move atomicity",
        "score progression",
        "stale revision",
        "unauthenticated denial",
        "code-scoped scoring",
        "bad-code denial",
        "concurrent publication exclusion",
      ],
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ checks, teamId, eventId: state.eventId }));
