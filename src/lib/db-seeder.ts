'use client';

import { 
  Firestore, 
  doc, 
  writeBatch,
  WriteBatch,
  collection,
  serverTimestamp,
  setDoc,
  getDocs,
  deleteDoc,
  query,
  where
} from 'firebase/firestore';
import { generateTournamentSchedule } from '@/lib/scheduler-utils';
import { format, parseISO } from 'date-fns';
import { getPlanTeamLimit } from '@/lib/plan-catalog';

/**
 * BatchHelper — safely accumulates Firestore writes and auto-commits every
 * CHUNK_SIZE operations to stay well under the 500-op hard limit.
 * Tracks the last 20 document paths per chunk for permission-denied diagnostics.
 */
class BatchHelper {
  private db: Firestore;
  private batch: WriteBatch;
  private opCount = 0;
  // Firestore rules allow only a small number of document lookups across one
  // atomic batch. Demo writes repeatedly verify their owning team, so keep
  // chunks deliberately small even though Firestore's write-count limit is 500.
  // Five writes keeps rules-engine document lookups comfortably below the
  // multi-write access-call ceiling, including player/media writes that verify
  // both the player and owning squad.
  private readonly CHUNK_SIZE = 5;
  private chunkPaths: string[] = [];  // paths in current chunk for debugging
  private pendingChunks: Array<{ batch: WriteBatch; count: number; paths: string[] }> = [];

  constructor(db: Firestore) {
    this.db = db;
    this.batch = writeBatch(db);
  }

  set(ref: any, data: any, opts?: any) {
    // Track up to 20 paths per chunk so we know what was in the failing commit
    if (this.chunkPaths.length < 20) {
      this.chunkPaths.push(ref.path ?? ref._key?.path?.segments?.join('/') ?? String(ref));
    }
    // Trusted server code creates every demo team shell first. Merge client
    // blueprint data so the server-owned demoSessionOwnerId is never removed.
    const isDemoTeamRoot = /^teams\/[^/]+$/.test(ref.path || '') && data?.isDemo === true;
    if (opts) {
      this.batch.set(ref, data, opts);
    } else if (isDemoTeamRoot) {
      this.batch.set(ref, data, { merge: true });
    } else {
      this.batch.set(ref, data);
    }
    this.opCount++;
    if (this.opCount >= this.CHUNK_SIZE) {
      this.queueCurrentChunk();
    }
    return this;
  }

  async maybeCommit() {
    if (this.pendingChunks.length > 0) {
      await this.flush();
    }
  }

  /**
   * Always commit the current batch immediately, regardless of op count.
   * Use this at strategic checkpoints to isolate writes into sequential,
   * independent commits — preventing one failing rule from poisoning an
   * entire batch of unrelated documents.
   */
  async flush() {
    this.queueCurrentChunk();
    while (this.pendingChunks.length > 0) {
      const chunk = this.pendingChunks.shift()!;
      await this._commitChunk(chunk);
    }
  }

  async commit() {
    await this.flush();
  }

  private queueCurrentChunk() {
    if (this.opCount === 0) return;
    this.pendingChunks.push({
      batch: this.batch,
      count: this.opCount,
      paths: [...this.chunkPaths],
    });
    this.batch = writeBatch(this.db);
    this.opCount = 0;
    this.chunkPaths = [];
  }

  private async _commitChunk(chunk: { batch: WriteBatch; count: number; paths: string[] }) {
    console.log(`[Demo] Committing batch chunk (${chunk.count} ops). Paths sampled:`, chunk.paths);
    const transientCodes = new Set([
      'aborted',
      'cancelled',
      'deadline-exceeded',
      'firestore/aborted',
      'firestore/cancelled',
      'firestore/deadline-exceeded',
      'firestore/internal',
      'firestore/unavailable',
      'internal',
      'unavailable',
    ]);
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        await chunk.batch.commit();
        return;
      } catch (err: any) {
        const code = typeof err?.code === 'string' ? err.code.toLowerCase() : '';
        const canRetry = transientCodes.has(code) && attempt < 3;
        if (!canRetry) {
          console.error('[Demo] Batch chunk FAILED. Paths in this chunk:', chunk.paths);
          throw err;
        }
        await new Promise(resolve => setTimeout(resolve, attempt * 500));
      }
    }
  }
}

/**
 * Sanitizes objects for Firestore by removing undefined values recursively.
 */
const clean = (obj: any): any => {
  if (Array.isArray(obj)) return obj.map(v => clean(v));
  if (obj !== null && typeof obj === 'object') {
    const newObj: any = {};
    Object.keys(obj).forEach(key => {
      const val = obj[key];
      if (val !== undefined) {
        newObj[key] = clean(val);
      }
    });
    return newObj;
  }
  return obj ?? null;
};

/**
 * STATIC BLUEPRINTS
 * Using fixed content for stable resets.
 */
// ── Per-team coaching staff pools ──────────────────────────────────────────
const COACHING_STAFF = [
  { headName: 'Marcus Powell',    headEmail: 'm.powell@thesquad.pro',    headAvatar: 'marcuspowell',    asstName: 'Jennifer Walsh',    asstEmail: 'j.walsh@thesquad.pro',    asstAvatar: 'jenniferwelsh' },
  { headName: 'Derek Santos',     headEmail: 'd.santos@thesquad.pro',    headAvatar: 'dereksantos',     asstName: 'Karen Osei',        asstEmail: 'k.osei@thesquad.pro',     asstAvatar: 'karenosei' },
  { headName: 'Tyler Brooks',     headEmail: 't.brooks@thesquad.pro',    headAvatar: 'tylerbrooks',     asstName: 'Maria Gonzalez',    asstEmail: 'm.gonzalez@thesquad.pro', asstAvatar: 'mariagonzalez' },
  { headName: 'Craig Henderson',  headEmail: 'c.henderson@thesquad.pro', headAvatar: 'craighenderson',  asstName: 'Lisa Park',         asstEmail: 'l.park@thesquad.pro',     asstAvatar: 'lisapark' },
  { headName: 'Brandon Kim',      headEmail: 'b.kim@thesquad.pro',       headAvatar: 'brandonkim',      asstName: 'Samantha Reed',     asstEmail: 's.reed@thesquad.pro',     asstAvatar: 'samanthareed' },
  { headName: 'Jonathan Mercer',  headEmail: 'j.mercer@thesquad.pro',    headAvatar: 'jonathanmercer',  asstName: 'Angela Torres',     asstEmail: 'a.torres@thesquad.pro',   asstAvatar: 'angelatorres' },
];

// ── Per-team player pools (8 players each) ────────────────────────────────
const PLAYER_POOLS = [
  [ // Pool 0
    { name: 'Alex Rivera',   position: 'Forward',        jersey: '10', gpa: '3.9', gradYear: '2026', school: 'Metro Academy',   avatar: 'alex',    amountOwed: 0,   feesPaid: true },
    { name: 'Taylor Chen',   position: 'Midfield',       jersey: '22', gpa: '3.7', gradYear: '2027', school: 'Heights High',    avatar: 'taylor',  amountOwed: 450, feesPaid: false },
    { name: 'Casey Morgan',  position: 'Defense',        jersey: '44', gpa: '4.0', gradYear: '2025', school: 'Westside Prep',   avatar: 'casey',   amountOwed: 0,   feesPaid: true },
    { name: 'Sam Wilson',    position: 'Goalkeeper',     jersey: '01', gpa: '3.5', gradYear: '2026', school: 'Heights High',    avatar: 'sam',     amountOwed: 100, feesPaid: false },
    { name: 'Riley Jones',   position: 'Forward',        jersey: '15', gpa: '3.8', gradYear: '2027', school: 'Metro Academy',   avatar: 'riley',   amountOwed: 0,   feesPaid: true },
    { name: 'Morgan Lee',    position: 'Defense',        jersey: '12', gpa: '3.9', gradYear: '2026', school: 'Westside Prep',   avatar: 'morgan',  amountOwed: 0,   feesPaid: true },
    { name: 'Quinn Davis',   position: 'Midfield',       jersey: '08', gpa: '4.0', gradYear: '2025', school: 'Metro Academy',   avatar: 'quinn',   amountOwed: 0,   feesPaid: true },
    { name: 'Skyler King',   position: 'Forward',        jersey: '11', gpa: '3.5', gradYear: '2027', school: 'Heights High',    avatar: 'skyler',  amountOwed: 0,   feesPaid: true },
  ],
  [ // Pool 1
    { name: 'Jordan Hayes',  position: 'Point Guard',    jersey: '05', gpa: '3.8', gradYear: '2026', school: 'Riverside High',  avatar: 'jordanhayes', amountOwed: 0,   feesPaid: true },
    { name: 'Devon Clark',   position: 'Shooting Guard', jersey: '03', gpa: '3.6', gradYear: '2027', school: 'Summit Academy',  avatar: 'devonclark',  amountOwed: 200, feesPaid: false },
    { name: 'Reagan Torres', position: 'Power Forward',  jersey: '21', gpa: '3.9', gradYear: '2025', school: 'Eastside Prep',   avatar: 'reagantorres',amountOwed: 0,   feesPaid: true },
    { name: 'Cameron Scott', position: 'Center',         jersey: '33', gpa: '3.4', gradYear: '2026', school: 'Riverside High',  avatar: 'cameronscott',amountOwed: 75,  feesPaid: false },
    { name: 'Peyton Adams',  position: 'Small Forward',  jersey: '14', gpa: '3.7', gradYear: '2027', school: 'Summit Academy',  avatar: 'peytonadams', amountOwed: 0,   feesPaid: true },
    { name: 'Blake Nelson',  position: 'Guard',          jersey: '23', gpa: '4.0', gradYear: '2025', school: 'Eastside Prep',   avatar: 'blakenelson', amountOwed: 0,   feesPaid: true },
    { name: 'Harley Price',  position: 'Forward',        jersey: '18', gpa: '3.5', gradYear: '2026', school: 'Riverside High',  avatar: 'harleyprice', amountOwed: 0,   feesPaid: true },
    { name: 'Sidney Ross',   position: 'Defense',        jersey: '11', gpa: '3.8', gradYear: '2027', school: 'Summit Academy',  avatar: 'sidneyross',  amountOwed: 300, feesPaid: false },
  ],
  [ // Pool 2
    { name: 'Parker Hughes', position: 'Winger',         jersey: '09', gpa: '3.7', gradYear: '2026', school: 'North Prep',      avatar: 'parkerhughes',amountOwed: 0,   feesPaid: true },
    { name: 'Lane Cooper',   position: 'Midfield',       jersey: '17', gpa: '3.5', gradYear: '2027', school: 'Central High',    avatar: 'lanecooper',  amountOwed: 125, feesPaid: false },
    { name: 'Emery Foster',  position: 'Center Back',    jersey: '28', gpa: '3.9', gradYear: '2025', school: 'North Prep',      avatar: 'emeryfoster', amountOwed: 0,   feesPaid: true },
    { name: 'Drew Mason',    position: 'Goalkeeper',     jersey: '30', gpa: '3.6', gradYear: '2026', school: 'Central High',    avatar: 'drewmason',   amountOwed: 0,   feesPaid: true },
    { name: 'Sage Thompson', position: 'Striker',        jersey: '06', gpa: '4.0', gradYear: '2027', school: 'Valley Academy',  avatar: 'sagethompson',amountOwed: 0,   feesPaid: true },
    { name: 'River Collins', position: 'Midfield',       jersey: '04', gpa: '3.8', gradYear: '2025', school: 'Valley Academy',  avatar: 'rivercollins',amountOwed: 50,  feesPaid: false },
    { name: 'Oakley Brooks', position: 'Defense',        jersey: '25', gpa: '3.4', gradYear: '2026', school: 'North Prep',      avatar: 'oakleybrooks',amountOwed: 0,   feesPaid: true },
    { name: 'Quinn Miller',  position: 'Forward',        jersey: '07', gpa: '3.7', gradYear: '2027', school: 'Central High',    avatar: 'quinnmiller', amountOwed: 0,   feesPaid: true },
  ],
  [ // Pool 3
    { name: 'Avery Martinez',position: 'Guard',          jersey: '02', gpa: '3.9', gradYear: '2026', school: 'South Academy',   avatar: 'averymartinez',amountOwed: 0,  feesPaid: true },
    { name: 'Reagan Lewis',  position: 'Forward',        jersey: '13', gpa: '3.6', gradYear: '2027', school: 'Lakewood High',   avatar: 'reaganlewis', amountOwed: 250, feesPaid: false },
    { name: 'Jordan Green',  position: 'Midfielder',     jersey: '20', gpa: '3.8', gradYear: '2025', school: 'South Academy',   avatar: 'jordangreen', amountOwed: 0,   feesPaid: true },
    { name: 'Casey White',   position: 'Defense',        jersey: '31', gpa: '4.0', gradYear: '2026', school: 'Lakewood High',   avatar: 'caseywhite',  amountOwed: 0,   feesPaid: true },
    { name: 'Taylor Hall',   position: 'Striker',        jersey: '26', gpa: '3.5', gradYear: '2027', school: 'West Ridge Prep', avatar: 'taylorhall',  amountOwed: 0,   feesPaid: true },
    { name: 'Morgan Young',  position: 'Guard',          jersey: '10', gpa: '3.7', gradYear: '2025', school: 'West Ridge Prep', avatar: 'morganyoung', amountOwed: 175, feesPaid: false },
    { name: 'Dylan Roberts', position: 'Defense',        jersey: '38', gpa: '3.9', gradYear: '2026', school: 'South Academy',   avatar: 'dylanroberts',amountOwed: 0,   feesPaid: true },
    { name: 'Robin Cruz',    position: 'Winger',         jersey: '09', gpa: '3.6', gradYear: '2027', school: 'Lakewood High',   avatar: 'robincruz',   amountOwed: 0,   feesPaid: true },
  ],
];

const GET_DEMO_DATA = (teamId: string, userId: string, teamSuffix: string = '', teamName: string = '', teamIndex: number = 0) => {
  const staff = COACHING_STAFF[teamIndex % COACHING_STAFF.length];
  const playerPool = PLAYER_POOLS[teamIndex % PLAYER_POOLS.length];
  const now = new Date();
  const day = (d: number) => new Date(now.getTime() + d * 86400000).toISOString();
  
  const yesterday = day(-1);
  const weekAgo = day(-7);
  const tomorrow = day(1);
  const later = day(2);
  const day3 = day(3);
  const day4 = day(4);

  return {
    members: [
      // Head coach (unique per team via staff pool)
      { id: `m1_${teamId}`, userId: `u1_${teamId}`, playerId: `p_u1_${teamId}`, name: staff.headName, role: 'Admin', position: 'Head Coach', jersey: 'HC', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 0, email: staff.headEmail, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${staff.headAvatar}` },
      // Assistant coach (unique per team via staff pool)
      { id: `m2_${teamId}`, userId: `u2_${teamId}`, playerId: `p_u2_${teamId}`, name: staff.asstName, role: 'Admin', position: 'Assistant Coach', jersey: 'AC', medicalClearance: true, amountOwed: 0, feesPaid: true, totalFees: 0, email: staff.asstEmail, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${staff.asstAvatar}` },
      // Players from unique pool
      ...playerPool.map((p, idx) => ({
        id: `m${idx + 3}_${teamId}`,
        userId: `u${idx + 3}_${teamId}`,
        playerId: `p_u${idx + 3}_${teamId}`,
        name: p.name,
        role: 'Member',
        position: p.position,
        jersey: p.jersey,
        medicalClearance: true,
        amountOwed: p.amountOwed,
        feesPaid: p.feesPaid,
        totalFees: 1250,
        email: `${p.avatar}@example.com`,
        parentEmail: `parent.${p.avatar}@example.com`,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.avatar}`,
        gradYear: p.gradYear,
        gpa: p.gpa,
        school: p.school,
      })),
    ],
    games: [
      { id: `g1_${teamId}`, opponent: 'City Strikers', date: day(-21), myScore: 8, opponentScore: 4, result: 'Win', location: 'Apex Performance Center – Main Arena', notes: 'Dominant performance. Scored 4 in the first half.' },
      { id: `g2_${teamId}`, opponent: 'North Hawks', date: day(-14), myScore: 11, opponentScore: 11, result: 'Tie', location: 'Memorial Stadium – Field A', notes: 'Strong first half, tied late in closing minutes.' },
      { id: `g3_${teamId}`, opponent: 'Eastside Tigers', date: day(-7), myScore: 14, opponentScore: 6, result: 'Win', location: 'Apex Performance Center – Practice Field B', notes: 'Best performance of the season.' },
      { id: `g4_${teamId}`, opponent: 'Lakewood Ravens', date: day(-4), myScore: 5, opponentScore: 9, result: 'Loss', location: 'West Complex – Court 2', notes: 'Struggled in second half. Conditioning focus needed.' },
      { id: `g5_${teamId}`, opponent: 'Summit Lions', date: day(-2), myScore: 18, opponentScore: 12, result: 'Win', location: 'Apex Performance Center – Main Arena', notes: 'Great team effort all around.' }
    ],
    events: [
      { 
        id: `tourn_${teamId}`, 
        teamId, 
        title: `${teamSuffix || 'Regional'} Championship Tournament`, 
        eventType: 'tournament', 
        isTournament: true, 
        date: tomorrow, 
        endDate: day3, 
        location: 'Premier Sports Park', 
        description: 'Elite multi-day tournament for top-tier squads.', 
        tournamentTeams: [teamName || `Team ${teamSuffix || 'A'}`, 'Thunder', 'Storm', 'Shadows', 'Lions', 'Eagles', 'Tigers', 'Bears'], 
        multiDaySchedule: [
          { day: 1, title: 'Opening Rounds', date: tomorrow },
          { day: 2, title: 'Semi-Finals', date: later },
          { day: 3, title: 'Finals Day', date: day3 }
        ],
        refereePool: [
          { id: `ref_1_${teamId}`, name: 'Marcus Webb', email: 'marcus.webb@officials.org', phone: '555-0141', certLevel: 'National', notes: 'Head referee. Available all 3 days.' },
          { id: `ref_2_${teamId}`, name: 'Dana Holloway', email: 'd.holloway@officials.org', phone: '555-0182', certLevel: 'State', notes: 'Experienced center ref. Available Day 1 & 2 only.' },
          { id: `ref_3_${teamId}`, name: 'Jordan Park', email: 'j.park@officials.org', phone: '555-0233', certLevel: 'Regional', notes: 'Line judge specialist.' },
          { id: `ref_4_${teamId}`, name: 'Sam Torres', email: 's.torres@officials.org', phone: '555-0274', certLevel: 'State', notes: 'Certified in double-elimination formats.' },
          { id: `ref_5_${teamId}`, name: 'Casey Nguyen', email: 'c.nguyen@officials.org', phone: '555-0315', certLevel: 'Regional', notes: 'New to program — covering Day 3 finals.' }
        ],
        tournamentTeamsData: [
          { id: `tt_0`, name: teamName || `Team ${teamSuffix || 'A'}`, coach: `Coach ${teamSuffix || 'A'}`, email: 'coach.a@example.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_1`, name: 'Thunder', coach: 'Mike Thunder', email: 'mike@thunder.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_2`, name: 'Storm', coach: 'Sarah Storm', email: 'sarah@storm.com', source: 'manual', complianceStatus: 'pending' },
          { id: `tt_3`, name: 'Shadows', coach: 'Dave Shadow', email: 'dave@shadows.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_4`, name: 'Lions', coach: 'Tim Lion', email: 'tim@lions.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_5`, name: 'Eagles', coach: 'Jane Eagle', email: 'jane@eagles.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_6`, name: 'Tigers', coach: 'Leo Tiger', email: 'leo@tigers.com', source: 'manual', complianceStatus: 'verified' },
          { id: `tt_7`, name: 'Bears', coach: 'Bear Brown', email: 'bear@bears.com', source: 'manual', complianceStatus: 'verified' },
        ],
        tournamentGames: generateTournamentSchedule({
          teams: [
            { id: teamId, name: teamName || `Team ${teamSuffix || 'A'}` },
            { id: 'tt_1', name: 'Thunder' },
            { id: 'tt_2', name: 'Storm' },
            { id: 'tt_3', name: 'Shadows' },
            { id: 'tt_4', name: 'Lions' },
            { id: 'tt_5', name: 'Eagles' },
            { id: 'tt_6', name: 'Tigers' },
            { id: 'tt_7', name: 'Bears' }
          ],
          fields: ['Main Arena', 'Championship Field', 'Field 1'],
          startDate: tomorrow,
          endDate: day3,
          startTime: '08:00',
          endTime: '20:00',
          gameLength: 60,
          breakLength: 15,
          tournamentType: 'double_elimination'
        }).map((g, idx) => {
          // ── Day assignment — matched against exact scheduler round name strings ──
          // Scheduler emits: "WB Round 1/2/3", "Winners Bracket Semi-Finals",
          //   "Winners Bracket Final", "LB Round 1/2/3/4", "Losers Bracket Final",
          //   "Championship", "Championship Decider"
          // Day 1 (tomorrow): WB Round 1, LB Round 1, LB Round 2
          // Day 2 (later):    WB Round 2+, Winners Bracket Semi-Finals, LB Round 3+
          // Day 3 (day3):     Winners Bracket Final, Losers Bracket Final, Championship, Championship Decider
          const r = (g.round || '').toLowerCase();

          // Championship Decider is conditional — only played if LB winner defeats
          // the undefeated WB champion. It is excluded from the scheduling pool
          // entirely (isConditional flag) and should never receive a demo date.
          const isConditional = r === 'championship decider' || (g as any).isConditional;

          const isDay3 =
            r === 'winners bracket final' ||
            r === 'losers bracket final' ||
            r === 'championship' ||
            r.includes('grand final');

          const lbRoundMatch = r.match(/lb round\s+(\d+)/);
          const lbRoundNum = lbRoundMatch ? parseInt(lbRoundMatch[1], 10) : 0;

          const isDay2 = !isDay3 && !isConditional && (
            r.includes('winners bracket semi-finals') ||
            r.includes('semi') ||
            r.match(/wb round\s+[2-9]/) !== null ||
            (lbRoundNum >= 3)
          );

          // Day 1: WB Round 1, LB Round 1, LB Round 2 (and anything unclassified)
          let gameDate = tomorrow;
          if (isConditional) gameDate = day3; // Park conditional match on day3 if ever surfaced
          else if (isDay3) gameDate = day3;
          else if (isDay2) gameDate = later;

          const completed = idx < 4;

          // Cycle through all 5 pool members deterministically for every game
          const allRefs = [
            { refereeId: `ref_1_${teamId}`, refereeName: 'Marcus Webb' },
            { refereeId: `ref_2_${teamId}`, refereeName: 'Dana Holloway' },
            { refereeId: `ref_3_${teamId}`, refereeName: 'Jordan Park' },
            { refereeId: `ref_4_${teamId}`, refereeName: 'Sam Torres' },
            { refereeId: `ref_5_${teamId}`, refereeName: 'Casey Nguyen' },
          ];
          const refAssignment = allRefs[idx % allRefs.length];

          return {
            ...g,
            ...refAssignment,
            date: gameDate,
            isCompleted: completed,
            score1: completed ? [5, 4, 8, 10][idx] : 0,
            score2: completed ? [2, 6, 1, 9][idx] : 0,
            matchTeamIds: [g.team1Id, g.team2Id].filter(Boolean)
          };
        }),
        teamAgreements: {
          [teamName || `Team ${teamSuffix || 'A'}`]: { signedAt: yesterday, signatureCount: 15, captainName: staff.headName },
          'Thunder': { signedAt: day(-2), signatureCount: 12, captainName: 'Mike Thunder' },
          'Shadows': { signedAt: day(-3), signatureCount: 14, captainName: 'Dave Shadow' },
          'Lions': { signedAt: day(-1), signatureCount: 11, captainName: 'Tim Lion' },
          'Eagles': { signedAt: yesterday, signatureCount: 16, captainName: 'Jane Eagle' }
        }
      },
      { id: `lg1_${teamId}`, teamId, title: `League Match vs City Wildcats`, eventType: 'game', isLeagueGame: true, date: tomorrow, startTime: '06:00 PM', location: 'Memorial Field', description: 'Primary season league match.', matchTeamIds: [teamId, 'wildcats_id'] },
      { id: `lg2_${teamId}`, teamId, title: `League Match vs Metro Stars`, eventType: 'game', isLeagueGame: true, date: later, startTime: '12:00 PM', location: 'City Park', description: 'Second league fixture of the week.', matchTeamIds: [teamId, 'stars_id'] },
      { id: `prac1_${teamId}`, teamId, title: `Team Tactical Session`, eventType: 'practice', date: later, startTime: '03:30 PM', location: 'West Fields', description: 'Drill-focused training session.', drillIds: [`d1_${teamId}`] },
      { id: `prac2_${teamId}`, teamId, title: `Conditioning Lab`, eventType: 'practice', date: tomorrow, startTime: '04:00 PM', location: 'Field 4', description: 'Strength and focus drills.', drillIds: [`d2_${teamId}`] },
      { id: `prac3_${teamId}`, teamId, title: `Morning Skills`, eventType: 'practice', date: day3, startTime: '07:30 AM', location: 'Main Gym', description: 'Voluntary skills session.' },
      { id: `meet_${teamId}`, teamId, title: `Strategy Review`, eventType: 'meeting', date: day(2), startTime: '07:00 PM', location: 'Clubhouse', description: 'Film study and strategy review.' }
    ],
    eventBrackets: [
      {
        eventId: `tourn_${teamId}`,
        brackets: [
          { 
            id: 'b1', 
            title: 'Elite Series Bracket', 
            matchups: {
              "1": { match: 1, round: 'WB Quarterfinals', team1: teamName || 'Squad', team2: 'Thunder', score1: 5, score2: 2, status: 'Completed', winner: teamName || 'Squad' },
              "2": { match: 2, round: 'WB Quarterfinals', team1: 'Storm', team2: 'Shadows', score1: 4, score2: 6, status: 'Completed', winner: 'Shadows' },
              "3": { match: 3, round: 'WB Quarterfinals', team1: 'Lions', team2: 'Eagles', score1: 8, score2: 1, status: 'Completed', winner: 'Lions' },
              "4": { match: 4, round: 'WB Quarterfinals', team1: 'Tigers', team2: 'Bears', score1: 10, score2: 9, status: 'Completed', winner: 'Tigers' },
              "5": { match: 5, round: 'WB Semi-Finals', team1: teamName || 'Squad', team2: 'Shadows', status: 'Scheduled' },
              "6": { match: 6, round: 'WB Semi-Finals', team1: 'Lions', team2: 'Tigers', status: 'Scheduled' }
            }
          }
        ]
      }
    ],
      // ── Seeded Drills — verified-embeddable sports YouTube videos ──
    drills: [
      {
        id: `d1_${teamId}`, title: 'Defensive Footwork Fundamentals',
        description: 'Master defensive footwork, positioning, and communication. Focus on your zone and help-side rotations for maximum defensive coverage.',
        // Source: CoachUp Nation — "5 Defensive Basketball Drills" (public, embedding enabled)
        videoUrl: 'https://www.youtube.com/watch?v=3er8D0hFj2g',
        coverImageUrl: 'https://images.unsplash.com/photo-1546519638-68e109498ffc?w=800&q=80',
        additionalMedia: [
          { url: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80', description: 'Full-court defensive positioning diagram' },
          { url: 'https://images.unsplash.com/photo-1519861531473-9200262188bf?w=800&q=80', description: 'Player footwork breakdown' }
        ],
        estimatedTime: '20 mins', createdAt: now.toISOString(), mandatoryWatch: true, mandatoryWatchThreshold: 75, watchedBy: {}
      },
      {
        id: `d2_${teamId}`, title: 'Agility Ladder & Speed Drills',
        description: 'Ladder drills, cone exercises, and explosive first-step training. Builds the quickness and footwork elite athletes use every game.',
        // Source: MindBodyGreen — "The Perfect Push Up" (public, embedding verified)
        videoUrl: 'https://www.youtube.com/watch?v=IODxDxX7oi4',
        coverImageUrl: 'https://images.unsplash.com/photo-1517963879433-6ad2b056d712?w=800&q=80',
        additionalMedia: [],
        estimatedTime: '25 mins', createdAt: now.toISOString(), mandatoryWatch: false, mandatoryWatchThreshold: 75, watchedBy: {}
      },
      {
        id: `d3_${teamId}`, title: 'Team Passing & Movement Patterns',
        description: 'Crisp passing mechanics and off-ball movement. These patterns build chemistry and create open looks through coordinated team motion.',
        // Source: MommaStrong — "15 Min Full Body Stretch" (public, embedding verified)
        videoUrl: 'https://www.youtube.com/watch?v=g_tea8ZNk5A',
        coverImageUrl: 'https://images.unsplash.com/photo-1608245449230-4ac19066d2d0?w=800&q=80',
        additionalMedia: [{ url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=800&q=80', description: 'Passing lanes diagram' }],
        estimatedTime: '15 mins', createdAt: now.toISOString(), mandatoryWatch: false, mandatoryWatchThreshold: 75, watchedBy: {}
      },
      {
        id: `d4_${teamId}`, title: 'Conditioning & Endurance Circuit',
        description: 'High-intensity conditioning circuit designed to build game-ready stamina. Push through fatigue so you perform in the fourth quarter.',
        // Source: STACK Media — athletic conditioning (public, embedding enabled)
        videoUrl: 'https://www.youtube.com/watch?v=ml6cT4AZdqI',
        coverImageUrl: 'https://images.unsplash.com/photo-1541534741688-6078c6bfb5c5?w=800&q=80',
        additionalMedia: [],
        estimatedTime: '30 mins', createdAt: now.toISOString(), mandatoryWatch: true, mandatoryWatchThreshold: 75, watchedBy: {}
      },
    ],
    practice_templates: [
      { id: `t1_${teamId}`, title: 'Defensive Masterclass', description: 'Elite defensive rotations and communication protocol.', drillIds: [`d1_${teamId}`, `d3_${teamId}`], createdAt: now.toISOString() },
      { id: `t2_${teamId}`, title: 'Athletic Development Block', description: 'Agility, speed, and conditioning circuit for peak physical performance.', drillIds: [`d2_${teamId}`, `d4_${teamId}`], createdAt: now.toISOString() }
    ],
    feed: [
      { id: `p1_${teamId}`, type: 'user', content: `Focus for Saturday, ${teamSuffix || 'the'} squad!`, author: { name: staff.headName }, authorId: `u1_${teamId}`, createdAt: yesterday, likes: [userId] },
      { id: `p2_${teamId}`, type: 'user', content: `Great game last night! Highlights are up.`, author: { name: playerPool[0].name }, authorId: `u3_${teamId}`, createdAt: day(-2), likes: [userId] }
    ],
    documents: [
      {
        id: `w1_${teamId}`, teamId, title: 'Annual Liability Waiver', type: 'waiver',
        isActive: true, assignedTo: ['all'], signatureCount: 3, required: true, createdAt: now.toISOString(),
        content: `PARTICIPANT LIABILITY WAIVER & RELEASE OF LIABILITY\n\nI, the undersigned participant (or parent/guardian if participant is a minor), acknowledge that participation in team sports and athletic activities involves inherent risks of physical injury, including but not limited to sprains, fractures, concussions, and other serious injuries.\n\nBy signing this waiver, I voluntarily agree to assume all risks associated with participation in practices, games, tournaments, and team-related activities organized by the team and its affiliated leagues.\n\nI hereby release, waive, discharge, and covenant not to sue the team, its coaches, administrators, officers, volunteers, sponsors, and affiliated organizations from any and all liability, claims, demands, or causes of action arising out of or related to any loss, damage, or injury that may be sustained during participation.\n\nI confirm that the participant is in good physical health and has no medical conditions that would prevent safe participation. I authorize team staff to seek emergency medical treatment on behalf of the participant if I cannot be reached.\n\nThis waiver shall be binding upon my heirs, executors, administrators, and legal representatives. I have read this waiver carefully, understand its terms, and sign it voluntarily.`
      },
      {
        id: `w2_${teamId}`, teamId, title: 'Media Release Form', type: 'waiver',
        isActive: true, assignedTo: ['all'], signatureCount: 2, required: false, createdAt: weekAgo,
        content: `MEDIA & PHOTOGRAPHY RELEASE AUTHORIZATION\n\nI, the undersigned, hereby grant permission to the team, its coaching staff, and authorized representatives to photograph, record video, and capture audio of the participant during team practices, games, tournaments, events, and any other team-related activities.\n\nI authorize the team to use, publish, and distribute any such photographs, video footage, or audio recordings for purposes including but not limited to: team websites and social media accounts, promotional materials, sponsor content, highlight reels, and press coverage.\n\nI understand that I will not receive compensation for this authorization and that the team retains all rights to the media captured. I waive any right to inspect or approve the finished product.\n\nThis release applies to all media formats including digital, print, broadcast, and online platforms. I understand this authorization remains in effect for the duration of the current season and any subsequent seasons unless revoked in writing.\n\nIf the participant is a minor, I confirm that I am the parent or legal guardian and have full authority to grant this release.`
      },
      {
        id: `w3_${teamId}`, teamId, title: 'Medical Clearance 2024', type: 'waiver',
        isActive: true, assignedTo: ['all'], signatureCount: 5, required: true, createdAt: day(-30),
        content: `PRE-SEASON MEDICAL CLEARANCE & HEALTH DISCLOSURE FORM\n\nParticipant Health Declaration\n\nI certify that the participant has undergone a physical examination by a licensed physician within the past 12 months and has been cleared for full athletic participation, including high-intensity training, competitive games, and multi-day tournaments.\n\nMedical History Disclosure: I confirm that the participant has disclosed all relevant medical conditions, including but not limited to: cardiovascular conditions, asthma or respiratory issues, musculoskeletal injuries, neurological conditions, and any prescribed medications that may affect athletic performance or require administration during team activities.\n\nEmergency Medical Information: I authorize the team's certified athletic trainer or coaching staff to administer basic first aid in the event of an injury. In the event of a serious medical emergency, I authorize emergency medical services to be contacted and appropriate treatment to be provided.\n\nAllergies & Medications: Any known allergies and current medications have been documented on the participant's confidential health record on file with the team administrator.\n\nI affirm that all information provided is accurate and complete, and I agree to notify the team immediately of any change in the participant's medical status during the season.`
      }
    ],
    alerts: [
      { id: `a1_${teamId}`, title: 'Venue Change', message: 'Match moved to Court 4 due to maintenance.', audience: 'everyone', createdAt: yesterday, createdBy: userId }
    ],
    volunteers: [
      { id: `vol1_${teamId}`, title: 'Tournament Concessions', description: 'Help run the stand during the multi-day event.', date: tomorrow, location: 'Premier Sports Park', startTime: '09:00', endTime: '15:00', spots: 5, hoursPerSlot: 2, pointsPerSlot: 10, isShareable: true, signups: { [`u3_${teamId}`]: { userId: `u3_${teamId}`, userName: playerPool[0].name, status: 'pending', createdAt: yesterday } } },
      { id: `vol2_${teamId}`, title: 'Match Day Photography', description: 'Capture high-quality action shots for the social feed.', date: later, startTime: '18:00', endTime: '20:00', spots: 2, hoursPerSlot: 2, pointsPerSlot: 25, signups: {} }
    ],
    fundraising: [
      { 
        id: `fund1_${teamId}`, 
        title: 'Elite Performance Kits', 
        description: 'Raising funds for professional away kits, warm-up gear, and technical equipment for the full squad.', 
        goalAmount: 5000, 
        currentAmount: 3250, 
        raisedAmount: 3250,
        deadline: day(30),
        isShareable: true,
        eTransferDetails: 'Send to team@squad.pro with campaign ID in memo.',
        donations: [
          { id: `don1_${teamId}`, donorName: 'Riverside Athletics Corp', amount: 1500, status: 'verified', method: 'bank_transfer', note: 'Annual club sponsorship commitment.', createdAt: day(-8) },
          { id: `don2_${teamId}`, donorName: 'Smith Family', amount: 500, status: 'verified', method: 'etransfer', note: 'Go team!', createdAt: day(-5) },
          { id: `don3_${teamId}`, donorName: 'Coach Rodriguez', amount: 250, status: 'verified', method: 'cash', note: 'Personal contribution.', createdAt: day(-3) },
          { id: `don4_${teamId}`, donorName: 'Anonymous Supporter', amount: 1000, status: 'verified', method: 'external', note: '', createdAt: day(-1) },
          { id: `don5_${teamId}`, donorName: 'Johnson Family', amount: 150, status: 'pending', method: 'etransfer', note: 'Sent via email transfer.', createdAt: day(-2) },
          { id: `don6_${teamId}`, donorName: 'Metro Sports Foundation', amount: 200, status: 'pending', method: 'external', note: 'Grant application pending review.', createdAt: now.toISOString() },
        ]
      }
    ],
    equipment: [
      { id: `eq1_${teamId}`, name: 'Official Match Balls', category: 'Training Gear', totalQuantity: 30, availableQuantity: 24, status: 'Active', description: 'Institutional grade size 5 match balls. Serialized tracking.', assignments: { [`u3_${teamId}`]: { userId: `u3_${teamId}`, userName: playerPool[0].name, quantity: 6, date: yesterday } } },
      { id: `eq2_${teamId}`, name: 'Varsity Travel Jackets', category: 'Uniforms', totalQuantity: 20, availableQuantity: 20, status: 'Active', description: 'Heavyweight weather-resistant travel kits.', assignments: {} },
      { id: `eq3_${teamId}`, name: 'Field Medical Kit Pro', category: 'Medical', totalQuantity: 2, availableQuantity: 1, status: 'Active', description: 'Fully stocked pitch-side trauma kit.', assignments: { [`u1_${teamId}`]: { userId: `u1_${teamId}`, userName: staff.headName, quantity: 1, date: now.toISOString() } } }
    ],
    incidents: [
      { id: `inc1_${teamId}`, teamId, title: 'Ankle Sprain - Grade 1', date: yesterday, time: '3:45 PM', location: 'Practice Court B', description: 'Player landed awkwardly after a contested jump. Immediate swelling noted.', emergencyServicesCalled: false, severity: 'minor', treatmentProvided: 'RICE protocol initiated. Assisted to clubhouse. Follow-up with physio required.', witnesses: `Coach ${staff.headName}, ${playerPool[1]?.name || 'Team Player'}`, reportedBy: staff.headName, followUpRequired: true, weatherConditions: 'Indoors', equipmentInvolved: 'Ankle Brace (Active)' },
      { id: `inc2_${teamId}`, teamId, title: 'Heat Protocol Precedence', date: weekAgo, time: '11:00 AM', location: 'Field 7', description: 'Extended exposure led to early signs of heat fatigue.', emergencyServicesCalled: false, severity: 'minor', treatmentProvided: 'Mandatory hydration break and shade recovery.', reportedBy: staff.headName, actionsTaken: 'Scheduled breaks increased for remaining session.' }
    ],
    files: [
      { id: `f1_${teamId}`, name: 'Season Strategy Playbook.pdf', type: 'pdf', size: '2.4 MB', sizeBytes: 2516582, url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', category: 'Playbook', description: 'Full season tactical overview and formation guides.', date: now.toISOString() },
      { id: `f2_${teamId}`, name: 'Medical Clearance Forms 2024.pdf', type: 'pdf', size: '841 KB', sizeBytes: 861184, url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', category: 'Medical', description: 'Pre-season physicals and clearance documentation.', date: weekAgo },
      { id: `f3_${teamId}`, name: 'Tournament Bracket Analysis.pdf', type: 'pdf', size: '1.1 MB', sizeBytes: 1153434, url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf', category: 'Scouting', description: 'Opponent breakdown and seeding probability charts.', date: day(-3) }
    ],
    signatures: [
      { docId: `w1_${teamId}`, sigs: [
        { id: `sig1_${teamId}`, documentId: `w1_${teamId}`, teamId, userId: `u3_${teamId}`, userName: playerPool[0].name, timestamp: day(-5) },
        { id: `sig2_${teamId}`, documentId: `w1_${teamId}`, teamId, userId: `u4_${teamId}`, userName: playerPool[1]?.name || playerPool[0].name, timestamp: day(-4) },
        { id: `sig3_${teamId}`, documentId: `w1_${teamId}`, teamId, userId: `u5_${teamId}`, userName: playerPool[2]?.name || playerPool[0].name, timestamp: day(-3) }
      ]},
      { docId: `w2_${teamId}`, sigs: [
        { id: `sig4_${teamId}`, documentId: `w2_${teamId}`, teamId, userId: `u6_${teamId}`, userName: playerPool[3]?.name || playerPool[0].name, timestamp: day(-6) },
        { id: `sig5_${teamId}`, documentId: `w2_${teamId}`, teamId, userId: `u7_${teamId}`, userName: playerPool[4]?.name || playerPool[0].name, timestamp: day(-5) }
      ]}
    ],
    chats: [
      {
        id: `chat1_${teamId}`,
        name: 'Squad Main Channel',
        createdBy: userId,
        memberIds: [userId, `u1_${teamId}`, `u2_${teamId}`, `u3_${teamId}`],
        isDeleted: false,
        teamId: teamId,
        createdAt: weekAgo,
        messages: [
          { id: `msg1_${teamId}`, author: staff.headName, authorId: `u1_${teamId}`, content: 'Ready for the tourneys this weekend! Brackets are live.', type: 'text', createdAt: weekAgo },
          { id: `msg2_${teamId}`, author: playerPool[0].name, authorId: `u3_${teamId}`, content: 'Practiced my shot all morning. See you guys there.', type: 'text', createdAt: yesterday },
          { id: `msg3_${teamId}`, author: playerPool[1]?.name || playerPool[0].name, authorId: `u4_${teamId}`, content: 'Can someone share the updated game plan? Coach sent it last night.', type: 'text', createdAt: yesterday },
          { id: `msg4_${teamId}`, author: staff.headName, authorId: `u1_${teamId}`, content: 'Playbook drills are mandatory watch — check the Playbook hub for the new videos!', type: 'text', createdAt: now.toISOString() }
        ]
      },
      {
        id: `chat2_${teamId}`,
        name: 'Coaching Staff',
        createdBy: userId,
        memberIds: [userId, `u1_${teamId}`, `u2_${teamId}`],
        isDeleted: false,
        teamId: teamId,
        createdAt: weekAgo,
        messages: [
          { id: `coachmsg1_${teamId}`, author: staff.headName, authorId: `u1_${teamId}`, content: 'Reviewing film from last game. Defense was excellent.', type: 'text', createdAt: weekAgo },
          { id: `coachmsg2_${teamId}`, author: staff.asstName, authorId: `u2_${teamId}`, content: 'Agreed. Transition attack needs work in training this week.', type: 'text', createdAt: yesterday }
        ]
      }
    ]
  };
};

/**
 * HIGH-SPEED ATOMIC SEEDER
 * Ensures a stable, predictable reset for demo users.
 * Pass isBetaTester=true to preserve the user's real name/email (beta accounts use real auth identities).
 */
export async function seedGuestDemoTeam(db: Firestore, userId: string, planId: string, isBetaTester = false) {
  const nowObj = new Date();
  const now = nowObj.toISOString();
  const day = (d: number) => new Date(nowObj.getTime() + d * 86400000).toISOString();
  const yesterday = day(-1);
  const tomorrow = day(1);
  const later = day(2);
  const day2 = day(2);
  const day3 = day(3);
  const day4 = day(4);
  const weekAgo = day(-7);

  const isParentDemo = planId === 'parent_demo';
  const isPlayerDemo = planId === 'player_demo';
  const isLeagueDemo = planId === 'league_demo';
  const isEliteDemo = ['elite_teams', 'elite_league', 'league', 'elite'].includes(planId);
  const isSchoolDemo = planId === 'school_demo' || planId === 'school';
  // league_demo gets facilities/equipment seeded (like a Pro demo) but NO paid Pro team quota
  const isProTier = planId !== 'starter_squad' && planId !== 'free';

  // --- PRE-FLIGHT CLEANUP ROUTINE ---
  // If the user is running the seeder multiple times, ghost events and overlapping teams pile up.
  // We wipe their existing team memberships and attached events for a clean slate.
  // NOTE: Each team is wrapped in its own try/catch. If a team was seeded by a prior session
  // (different UID or institution record), Firestore may deny the read — we skip it gracefully
  // rather than aborting the entire seeder with a permission error.
  try {
    const membershipsSnapshot = await getDocs(collection(db, 'users', userId, 'teamMemberships'));
    for (const membershipDoc of membershipsSnapshot.docs) {
      const existingTeamId = membershipDoc.id;
      try {
        // Wipe all events attached to this team to prevent itinerary overlap
        const eventsRef = collection(db, 'teams', existingTeamId, 'events');
        const eventsSnap = await getDocs(eventsRef);
        for (const eDoc of eventsSnap.docs) {
          await deleteDoc(doc(db, 'teams', existingTeamId, 'events', eDoc.id));
        }
      } catch (teamErr) {
        // Permission denied on a team we don't own (e.g. institution from prior session) — skip
        console.warn(`[Demo] Cleanup skipped for team ${existingTeamId} (insufficient permissions — safe to ignore):`, teamErr);
      }
      // Always sever the membership record regardless of events cleanup success
      await deleteDoc(doc(db, 'users', userId, 'teamMemberships', existingTeamId));
    }

    // Cleanup prior leagues created by the user
    const leaguesSnap = await getDocs(query(collection(db, 'leagues'), where('creatorId', '==', userId)));
    for (const lDoc of leaguesSnap.docs) {
      await deleteDoc(doc(db, 'leagues', lDoc.id));
    }
  } catch (err) {
    console.warn("Cleanup routine skipped or failed (safe to ignore if first run): ", err);
  }

  // Map legacy/demo plan IDs to new schema
  const planTypeMap: Record<string, string> = {
    'starter_squad': 'free',
    'squad_pro': 'team',
    'elite_teams': 'elite',
    'elite_league': 'league',
    'squad_organization': 'school',
    'school_demo': 'school',
    'free': 'free',
    'team': 'team',
    'elite': 'elite',
    'league': 'league',
    'school': 'school',
    'parent_demo': 'team',
    'player_demo': 'team',
    // League demo users start on free — they must pay to add Pro teams
    'league_demo': 'free'
  };

  const plan_type = planTypeMap[planId] || 'free';
  const teamLimitMap: Record<string, number> = {
    'free': 1,
    'team': 1,
    'elite': 8,
    'league': 15,
    'school': 15
  };
  const team_limit = teamLimitMap[plan_type] || 1;

  const userRole = isSchoolDemo ? 'admin' : (isParentDemo ? 'parent' : (isPlayerDemo ? 'adult_player' : (isLeagueDemo ? 'league_creator' : 'coach')));
  const pos = isParentDemo ? 'Parent' : (isPlayerDemo ? 'Player' : (isSchoolDemo ? 'Athletic Director' : (isLeagueDemo ? 'League Creator' : 'Coach')));
  const role = (isParentDemo || isPlayerDemo) ? 'Member' : 'Admin';

  const batch = new BatchHelper(db);

  // Protected profile, plan, staff, and subscription fields are initialized by
  // /api/demo/seed. The browser never writes account authority for any demo.

  // 1.1 Secure Facilities Seeding (All Pro Tiers)
  if (isProTier && !isParentDemo && !isPlayerDemo) {
    const facId = `fac_main_${userId.slice(-4)}`;
    const facName = isSchoolDemo ? 'Springfield High Athletic Complex' : (isEliteDemo ? 'Apex Performance Center' : 'Home Training Center');
    const facAddress = isSchoolDemo ? '456 Education Ave, Springfield' : (isEliteDemo ? '789 Tactical Way, Metro City' : '123 Athletic Drive, Downtown');
    batch.set(doc(db, 'facilities', facId), clean({
      id: facId,
      name: facName,
      address: facAddress,
      clubId: userId,
      notes: isSchoolDemo
        ? 'Main athletic campus. Parking lot C open for event days. Contact facilities@school.edu for rentals.'
        : 'Primary training venue. Gate code: 1992#. Concessions open on game days. Coaches arrive 45 min early.',
      isDemo: true
    }));
    // CRITICAL: Flush the facility doc before writing fields subcollection.
    // The fields write rule calls get(facilities/{facilityId}) — if the parent doc
    // is in the same batch, the get() returns null and the write is denied.
    await batch.flush();

    // Enroll Standard Fields/Courts
    const fieldResources = isSchoolDemo
      ? ['Main Gymnasium', 'Field House', 'Outdoor Track', 'Football Field', 'Tennis Courts']
      : ['Main Arena', 'Practice Field A', 'Practice Field B', 'Weight Room'];
    fieldResources.forEach(fn => {
      const fid = `res_${fn.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${userId.slice(-4)}`;
      batch.set(doc(db, 'facilities', facId, 'fields', fid), clean({
        id: fid,
        facilityId: facId,
        name: fn,
        isDemo: true
      }));
    });
    await batch.flush();

    // Second facility for elite/school demos
    if (isEliteDemo || isSchoolDemo) {
      const fac2Id = `fac_secondary_${userId.slice(-4)}`;
      batch.set(doc(db, 'facilities', fac2Id), clean({
        id: fac2Id,
        name: isSchoolDemo ? 'Memorial Sports Complex' : 'Satellite Training Annex',
        address: isSchoolDemo ? '900 Memorial Blvd, Springfield' : '456 West Campus Ave',
        clubId: userId,
        notes: 'Secondary training venue. Call ahead for equipment setup.',
        isDemo: true
      }));
      // Flush fac2 doc before its fields subcollection
      await batch.flush();
      const field2Resources = isSchoolDemo
        ? ['Court A', 'Court B', 'Wrestling Room']
        : ['Turf Field 1', 'Turf Field 2'];
      field2Resources.forEach(fn => {
        const fid = `res2_${fn.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${userId.slice(-4)}`;
        batch.set(doc(db, 'facilities', fac2Id, 'fields', fid), clean({
          id: fid,
          facilityId: fac2Id,
          name: fn,
          isDemo: true
        }));
      });
      await batch.flush();
    }
  }

  // NOTE: Plan definitions are written server-side by a superadmin and must NOT be
  // seeded client-side — the Firestore rules restrict /plans/ writes to superadmins
  // and attempting to write them as a demo guest causes the entire batch to fail.
  // If plans are missing, deploy them via the Firebase console or Admin SDK.
  await batch.flush();

    // --- Specialized Parent/Player Demo Data ---
    if (isParentDemo || isPlayerDemo) {
        const strikerId = `demo_${planId}_${userId.slice(-4)}_strikers`;
        const lakerId = `demo_${planId}_${userId.slice(-4)}_lakers`;
        const leagueId = `demo_league_${userId.slice(-4)}`;
        const tids = [strikerId, lakerId];

        // 1. Create a Global League Document
        batch.set(doc(db, 'leagues', leagueId), clean({
            id: leagueId,
            name: 'Elite Youth League',
            description: 'The premier circuit for local talent.',
            createdBy: userId,
            creatorId: userId,
            memberTeamIds: [strikerId, lakerId, 'hawks_id', 'tigers_id', 'eagles_id'],
            memberUserIds: [userId],
            isDemo: true,
            status: 'active',
            teams: {
                [strikerId]: { teamName: 'Strikers', coachName: 'Marcus Miller', coachEmail: 'm.miller@example.com', wins: 2, losses: 1, points: 6 },
                [lakerId]: { teamName: 'Lakers', coachName: 'Sarah Thompson', coachEmail: 's.thompson@example.com', wins: 3, losses: 0, points: 9 },
                ['hawks_id']: { teamName: 'Hawks', coachName: 'David Chen', coachEmail: 'd.chen@example.com', wins: 1, losses: 2, points: 3 },
                ['tigers_id']: { teamName: 'Tigers', coachName: 'James Wilson', coachEmail: 'j.wilson@example.com', wins: 0, losses: 3, points: 0 }
            },
            schedule: [
              { id: 'lg1', team1: 'Strikers', team1Id: strikerId, team2: 'Lakers', team2Id: lakerId, date: tomorrow, time: '10:00 AM', location: 'Court A', status: 'scheduled' },
              { id: 'lg2', team1: 'Strikers', team1Id: strikerId, team2: 'Hawks', team2Id: 'hawks_id', date: later, time: '12:00 PM', location: 'Court B', status: 'scheduled' },
              { id: 'lg3', team1: 'Lakers', team1Id: lakerId, team2: 'Tigers', team2Id: 'tigers_id', date: later, time: '02:00 PM', location: 'Court A', status: 'scheduled' },
              { id: 'lg4', team1: 'Strikers', team1Id: strikerId, team2: 'Eagles', team2Id: 'eagles_id', date: new Date(nowObj.getTime() + 5 * 86400000).toISOString(), time: '04:00 PM', location: 'Main Arena', status: 'scheduled' },
              { id: 'lg5', team1: 'Lakers', team1Id: lakerId, team2: 'Hawks', team2Id: 'hawks_id', date: new Date(nowObj.getTime() + 8 * 86400000).toISOString(), time: '06:00 PM', location: 'Court B', status: 'scheduled' },
              { id: 'lg6', team1: 'Strikers', team1Id: strikerId, team2: 'Tigers', team2Id: 'tigers_id', date: new Date(nowObj.getTime() + 11 * 86400000).toISOString(), time: '01:00 PM', location: 'Court A', status: 'scheduled' },
              { id: 'lg7', team1: 'Lakers', team1Id: lakerId, team2: 'Eagles', team2Id: 'eagles_id', date: new Date(nowObj.getTime() + 14 * 86400000).toISOString(), time: '03:00 PM', location: 'Main Arena', status: 'scheduled' }
            ],
            createdAt: now
        }));

        // 2. Create the Teams (Strikers & Lakers)
        const variants = [
            { id: strikerId, name: 'Strikers', logo: 'https://picsum.photos/seed/strikers/200/200' },
            { id: lakerId, name: 'Lakers', logo: 'https://picsum.photos/seed/lakers/200/200' }
        ];

        for (const v of variants) {
            const uniqueCode = (h => Math.abs(h).toString(36).toUpperCase().padStart(8,'0'))(v.id.split('').reduce((h,c)=>(Math.imul(31,h)+c.charCodeAt(0))|0,0));

            // For player demos, teams are OWNED by a fictional coach, not the player.
            // This prevents proQuotaStatus from firing (player owns 0 teams).
            // For parent demos, same principle — parents observe, they don't own.
            const fictionalCoachId = `demo_coach_${userId.slice(-8)}`;
            const teamOwner = (isParentDemo || isPlayerDemo) ? fictionalCoachId : userId;

            batch.set(doc(db, 'teams', v.id), clean({
                id: v.id,
                teamName: v.name,
                code: uniqueCode,
                teamCode: uniqueCode,
                inviteCode: uniqueCode,
                ownerUserId: teamOwner, // NOT the player/parent user
                isPro: true,
                planId: 'team',
                sport: 'Basketball',
                isDemo: true,
                demoOwnerUserId: userId,
                type: 'youth',
                leagueId: leagueId,
                createdAt: now,
                heroImageUrl: `https://picsum.photos/seed/${v.id}hero/1200/400`,
                teamLogoUrl: v.logo
            }));

            // --- Role-specific membership & member records ---
            // Parent: viewer/guardian role — redirected to /family hub
            // Player: participant role — stays on main dashboard with read-only ops access
            const membershipRole = isParentDemo ? 'parent' : 'Member';
            const memberPosition = isParentDemo ? 'Guardian' : 'Player';
            const memberName = isParentDemo ? 'Guest Parent' : 'Guest Player';

            // Membership document (users/{uid}/teamMemberships/{teamId})
            // ownerUserId is intentionally the fictional coach — player/parent never owns
            batch.set(doc(db, 'users', userId, 'teamMemberships', v.id), clean({
                teamId: v.id,
                name: v.name,
                role: membershipRole,
                isPro: true,
                planId: 'team',
                isDemo: true,
                ownerUserId: teamOwner,
                joinedAt: now
            }));
            // CRITICAL: Flush team doc before subcollection writes so exists(teams/teamId)
            // returns true when Firestore evaluates the member/event write rules.
            await batch.flush();

            // Member record inside the team (teams/{teamId}/members/{uid})
            batch.set(doc(db, 'teams', v.id, 'members', userId), clean({
                id: userId, userId, teamId: v.id,
                name: memberName,
                role: membershipRole,
                position: memberPosition,
                joinedAt: now,
                isDemo: true
            }));

            // For player demos: also seed a linked players doc so isPlayer resolves
            // correctly on pages that look up the players collection.
            if (isPlayerDemo) {
                const playerDob = new Date(nowObj.getFullYear() - 19, 3, 10).toISOString().split('T')[0];
                batch.set(doc(db, 'players', userId), clean({
                    id: userId,
                    firstName: 'Guest',
                    lastName: 'Player',
                    isMinor: false,
                    parentId: null,
                    userId: userId,
                    dateOfBirth: playerDob,
                    hasLogin: true,
                    createdAt: now,
                    joinedTeamIds: [v.id],
                    primaryTeamId: v.id,
                    updatedByTeamId: v.id,
                    ageGroup: 'Adult',
                    avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=guestplayer`,
                    sports: ['Basketball'],
                    primaryPosition: 'Player',
                    isDemo: true,
                    demoOwnerUserId: userId,
                }), { merge: true });
            }

            // Pull rich sub-resources from the static blueprint (NO EVENTS — handled by staggered parent block below)
            const data = GET_DEMO_DATA(v.id, userId, v.name, v.name, variants.indexOf(v));
            data.members.forEach(m => {
              batch.set(doc(db, 'teams', v.id, 'members', m.id), clean({ ...m, teamId: v.id, joinedAt: now, isDemo: true }));
            });
            await batch.flush();
            data.volunteers.forEach(vol => batch.set(doc(db, 'teams', v.id, 'volunteers', vol.id), clean(vol)));
            data.fundraising.forEach(fund => {
              const { donations: _d, ...fundDoc } = fund;
              batch.set(doc(db, 'teams', v.id, 'fundraising', fund.id), clean(fundDoc));
            });
            // Seed donation sub-docs for Audit Hub
            for (const fund of data.fundraising) {
              for (const don of (fund.donations || [])) {
                batch.set(doc(db, 'teams', v.id, 'fundraising', fund.id, 'donations', don.id), clean(don));
              }
            }
            data.equipment.forEach(eq => batch.set(doc(db, 'teams', v.id, 'equipment', eq.id), clean(eq)));
            data.incidents.forEach(inc => batch.set(doc(db, 'teams', v.id, 'incidents', inc.id), clean(inc)));
            data.games.forEach(g => {
                const matchTeamIds = [v.id, 'mock_opp'].filter(Boolean);
                batch.set(doc(db, 'teams', v.id, 'games', g.id), clean({ ...g, teamId: v.id, matchTeamIds, createdAt: now }));
            });
            await batch.flush();
            data.drills.forEach(d => batch.set(doc(db, 'teams', v.id, 'drills', d.id), clean(d)));
            data.practice_templates.forEach(pt => batch.set(doc(db, 'teams', v.id, 'practice_templates', pt.id), clean(pt)));
            data.documents.forEach(d => batch.set(doc(db, 'teams', v.id, 'documents', d.id), clean({ ...d, ownerUserId: userId, teamId: v.id })));
            data.files.forEach(f => batch.set(doc(db, 'teams', v.id, 'files', f.id), clean({ ...f, teamId: v.id })));
            data.alerts.forEach(a => batch.set(doc(db, 'teams', v.id, 'alerts', a.id), clean(a)));
            data.feed.forEach(p => batch.set(doc(db, 'teams', v.id, 'feedPosts', p.id), clean(p)));
            data.signatures.forEach(s => s.sigs.forEach(sig => batch.set(doc(db, 'teams', v.id, 'members', sig.userId, 'signatures', sig.documentId), clean(sig))));
            await batch.flush();
            data.chats.forEach(c => {
              batch.set(doc(db, 'teams', v.id, 'groupChats', c.id), clean({ id: c.id, name: c.name, createdBy: c.createdBy, memberIds: c.memberIds, isDeleted: c.isDeleted, teamId: v.id, createdAt: c.createdAt }));
              c.messages.forEach(m => batch.set(doc(db, 'teams', v.id, 'groupChats', c.id, 'messages', m.id), clean(m)));
            });
            await batch.flush();
        }

        // 3. Children Profiles
        const juniorId = `c1_${userId}`;
        const juniorDob = new Date(nowObj.getFullYear() - 9, 5, 15).toISOString().split('T')[0]; // 9 years old
        batch.set(doc(db, 'players', juniorId), clean({
            id: juniorId, firstName: 'Junior', lastName: 'Guest', isMinor: true, parentId: userId, userId: null,
            dateOfBirth: juniorDob, isDemo: true,
            demoOwnerUserId: userId,
            hasLogin: false, createdAt: now, joinedTeamIds: [strikerId], ageGroup: 'U10', avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=junior',
            sports: ['Basketball'], primaryPosition: 'Point Guard', primaryTeamId: strikerId, updatedByTeamId: strikerId
        }));

        const alexId = `c2_${userId}`;
        const alexDob = new Date(nowObj.getFullYear() - 16, 2, 20).toISOString().split('T')[0]; // 16 years old
        const alexEmail = `alex.guest_${userId.slice(-4)}@thesquad.pro`;
        batch.set(doc(db, 'players', alexId), clean({
            id: alexId, firstName: 'Alex', lastName: 'Guest', isMinor: true, parentId: userId, userId: alexId,
            dateOfBirth: alexDob, isDemo: true,
            demoOwnerUserId: userId,
            hasLogin: true, pendingInviteEmail: alexEmail, createdAt: now, joinedTeamIds: [lakerId], ageGroup: 'U17', avatar: 'https://api.dicebear.com/7.x/pixel-art/svg?seed=alex',
            sports: ['Basketball', 'Soccer', 'Cross Country'], primaryPosition: 'Striker', primaryTeamId: lakerId, updatedByTeamId: lakerId
        }));

        // Link kids to teams as members
        // Junior -> Strikers
        batch.set(doc(db, 'teams', strikerId, 'members', juniorId), clean({
            id: juniorId, teamId: strikerId, name: 'Junior Guest', role: 'Member', position: 'Player', joinedAt: now, isDemo: true, parentId: userId
        }));

        // Alex -> Lakers
        batch.set(doc(db, 'teams', lakerId, 'members', alexId), clean({
            id: alexId, teamId: lakerId, name: 'Alex Guest', role: 'Member', position: 'Player', joinedAt: now, isDemo: true, parentId: userId, email: alexEmail
        }));

        // Seed household payment records
        const paymentRecords = [
          { id: `pay1_${userId}`, childId: juniorId, childName: 'Junior Guest', teamId: strikerId, teamName: 'Strikers', description: 'Season Registration Fee', amount: 350.00, status: 'paid', date: day(-45), dueDate: day(-60), invoiceNumber: `INV-${userId.slice(-4)}-001`, category: 'Registration' },
          { id: `pay2_${userId}`, childId: juniorId, childName: 'Junior Guest', teamId: strikerId, teamName: 'Strikers', description: 'Team Equipment Package', amount: 125.00, status: 'paid', date: day(-30), dueDate: day(-35), invoiceNumber: `INV-${userId.slice(-4)}-002`, category: 'Equipment' },
          { id: `pay3_${userId}`, childId: juniorId, childName: 'Junior Guest', teamId: strikerId, teamName: 'Strikers', description: 'Spring Tournament Entry', amount: 80.00, status: 'paid', date: day(-15), dueDate: day(-20), invoiceNumber: `INV-${userId.slice(-4)}-003`, category: 'Tournament Entry' },
          { id: `pay4_${userId}`, childId: alexId, childName: 'Alex Guest', teamId: lakerId, teamName: 'Lakers', description: 'Season Registration Fee', amount: 400.00, status: 'paid', date: day(-40), dueDate: day(-55), invoiceNumber: `INV-${userId.slice(-4)}-004`, category: 'Registration' },
          { id: `pay5_${userId}`, childId: alexId, childName: 'Alex Guest', teamId: lakerId, teamName: 'Lakers', description: 'Monthly Team Dues — April', amount: 85.00, status: 'paid', date: day(-28), dueDate: day(-28), invoiceNumber: `INV-${userId.slice(-4)}-005`, category: 'Dues' },
          { id: `pay6_${userId}`, childId: alexId, childName: 'Alex Guest', teamId: lakerId, teamName: 'Lakers', description: 'Monthly Team Dues — May', amount: 85.00, status: 'pending', date: day(-7), dueDate: day(7), invoiceNumber: `INV-${userId.slice(-4)}-006`, category: 'Dues' },
          { id: `pay7_${userId}`, childId: juniorId, childName: 'Junior Guest', teamId: strikerId, teamName: 'Strikers', description: 'Elite Performance Camp', amount: 220.00, status: 'overdue', date: day(-20), dueDate: day(-5), invoiceNumber: `INV-${userId.slice(-4)}-007`, category: 'Tournament Entry' },
          { id: `pay8_${userId}`, childId: alexId, childName: 'Alex Guest', teamId: lakerId, teamName: 'Lakers', description: 'Pre-Season Medical Screening', amount: 60.00, status: 'pending', date: day(-3), dueDate: day(14), invoiceNumber: `INV-${userId.slice(-4)}-008`, category: 'Medical' },
        ];
        paymentRecords.forEach(p => batch.set(doc(db, 'users', userId, 'payments', p.id), clean({ ...p, isDemo: true })));
        await batch.flush();

        for (const tid of tids) {
            const isJunior = tid === strikerId;
            
            // Stagger timelines: Junior gets Early Tournament & Late League. Alex gets Early League & Late Tournament.
            const tournOffset = isJunior ? 1 : 11; // Junior starts Day 1, Alex starts Day 11
            const lgOffset = isJunior ? 7 : 1;     // Junior starts League Day 7, Alex starts League Day 1
            const pracOffset = isJunior ? 4 : 4;   // Practices start day 4

            // Use YYYY-MM-DD strings (not full ISO) so parseLocalDate in the scheduler
            // treats them as local midnight — prevents UTC offset shifting matches 1 day early.
            const tournStartDate = new Date(nowObj.getTime() + tournOffset * 86400000);
            const tournEndDate = new Date(nowObj.getTime() + (tournOffset + 2) * 86400000);
            const pad = (n: number) => String(n).padStart(2, '0');
            const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
            const tournStart = tournStartDate.toISOString(); // Keep ISO for event metadata display
            const tournEnd = tournEndDate.toISOString();
            const tournStartStr = toDateStr(tournStartDate); // Clean date for scheduler engine
            const tournEndStr = toDateStr(tournEndDate);

            // Sync the league games into team events for immediate visibility
            // IDs are scoped to tid to prevent Strikers/Lakers overwriting each other
            const leagueGames = [
              { id: `lg_${tid}_1`, teamId: tid, title: `Conference Match vs Riverside High`, eventType: 'game', isLeagueGame: true, date: new Date(nowObj.getTime() + (lgOffset) * 86400000).toISOString(), startTime: '10:00 AM', location: 'City Arena', description: 'National broadcast game.', matchTeamIds: [tid, 'rival_riverside'] },
              { id: `lg_${tid}_2`, teamId: tid, title: `Division Rival Match vs Lincoln Prep`, eventType: 'game', isLeagueGame: true, date: new Date(nowObj.getTime() + (lgOffset + 2) * 86400000).toISOString(), startTime: isJunior ? '12:00 PM' : '02:00 PM', location: isJunior ? 'Field 7' : 'Field 2', description: 'Critical seeding match.', matchTeamIds: [tid, 'rival_lincoln'] },
              { id: `lg_${tid}_3`, teamId: tid, title: `Regional Qualifier`, eventType: 'game', isLeagueGame: true, date: new Date(nowObj.getTime() + (lgOffset + 4) * 86400000).toISOString(), startTime: '03:30 PM', location: 'State Complex', description: 'Qualifier for states.', matchTeamIds: [tid] },
              { id: `lg_${tid}_4`, teamId: tid, title: `Pre-Season Scrimmage`, eventType: 'game', isLeagueGame: true, date: yesterday, startTime: '04:00 PM', location: 'Home Stadium', description: 'Early season tune-up.', matchTeamIds: [tid] },
              { id: `lg_${tid}_5`, teamId: tid, title: `Mid-Season Invitational`, eventType: 'game', isLeagueGame: true, date: new Date(nowObj.getTime() + (lgOffset + 8) * 86400000).toISOString(), startTime: '11:00 AM', location: 'Summit Center', description: 'League-wide showcase event.', matchTeamIds: [tid] }
            ];
            leagueGames.forEach(lg => {
              batch.set(doc(db, 'teams', tid, 'events', lg.id), clean(lg));
            });

            // Multi-day Tournament (3 Days)
            const tournamentId = `tourn_${tid}_demo`;
            const tournamentTeamsData = [
              { id: strikerId, name: 'Strikers', coach: 'Mike Strike', email: 'mike@strikers.com', source: 'manual', complianceStatus: 'verified' },
              { id: lakerId, name: 'Lakers', coach: 'Jim Lake', email: 'jim@lakers.com', source: 'manual', complianceStatus: 'verified' },
              { id: 'tt_2', name: 'Hawks', coach: 'Sarah Hawk', email: 'sarah@hawks.com', source: 'manual', complianceStatus: 'pending' },
              { id: 'tt_3', name: 'Tigers', coach: 'Leo Tiger', email: 'leo@tigers.com', source: 'manual', complianceStatus: 'verified' },
              { id: 'tt_4', name: 'Eagles', coach: 'Jane Eagle', email: 'jane@eagles.com', source: 'manual', complianceStatus: 'verified' },
              { id: 'tt_5', name: 'Panthers', coach: 'Tim Panther', email: 'tim@panthers.com', source: 'manual', complianceStatus: 'verified' },
              { id: 'tt_6', name: 'Cougars', coach: 'Chris Coug', email: 'chris@cougars.com', source: 'manual', complianceStatus: 'verified' },
              { id: 'tt_7', name: 'Bears', coach: 'Bear Brown', email: 'bear@bears.com', source: 'manual', complianceStatus: 'verified' }
            ];
            const tournamentGames = generateTournamentSchedule({
              teams: tournamentTeamsData,
              fields: ['Arena 1', 'Main Field'],
              startDate: tournStartStr,   // YYYY-MM-DD — no UTC shift
              endDate: tournEndStr,
              startTime: '08:00',
              endTime: '20:00',
              gameLength: 60,
              breakLength: 15,
              tournamentType: isJunior ? 'double_elimination' : 'pool_play_knockout',
              gamesPerTeam: 3
            }).map(g => ({
              ...g,
              matchTeamIds: [g.team1Id, g.team2Id].filter(Boolean)
            }));

            const demoRefereePool = [
              { id: `ref_1_${tid}`, name: 'Marcus Webb', email: 'marcus.webb@officials.org', phone: '555-0141', certLevel: 'National', notes: 'Head referee. Available all 3 days.' },
              { id: `ref_2_${tid}`, name: 'Dana Holloway', email: 'd.holloway@officials.org', phone: '555-0182', certLevel: 'State', notes: 'Experienced center ref. Day 1 & 2 only.' },
              { id: `ref_3_${tid}`, name: 'Jordan Park', email: 'j.park@officials.org', phone: '555-0233', certLevel: 'Regional', notes: 'Line judge specialist.' },
              { id: `ref_4_${tid}`, name: 'Sam Torres', email: 's.torres@officials.org', phone: '555-0274', certLevel: 'State', notes: 'Certified in DE formats.' },
              { id: `ref_5_${tid}`, name: 'Casey Nguyen', email: 'c.nguyen@officials.org', phone: '555-0315', certLevel: 'Regional', notes: 'Covering Day 3 finals.' }
            ];
            // Assign refs to first 4 games (typically completed in demo)
            const demoRefAssignments: Record<number, { refereeId: string; refereeName: string }> = {
              0: { refereeId: `ref_1_${tid}`, refereeName: 'Marcus Webb' },
              1: { refereeId: `ref_2_${tid}`, refereeName: 'Dana Holloway' },
              2: { refereeId: `ref_3_${tid}`, refereeName: 'Jordan Park' },
              3: { refereeId: `ref_4_${tid}`, refereeName: 'Sam Torres' },
            };
            const enrichedTournamentGames = tournamentGames.map((g: any, idx: number) => ({
              ...g,
              ...(demoRefAssignments[idx] || {}),
              matchTeamIds: [g.team1Id, g.team2Id].filter(Boolean)
            }));

            batch.set(doc(db, 'teams', tid, 'events', tournamentId), clean({
              id: tournamentId,
              teamId: tid,
              title: isJunior ? 'City Championship Tournament' : 'Lakers Spring Showcase',
              eventType: 'tournament',
              isTournament: true,
              date: tournStart,
              endDate: tournEnd,
              location: 'Premier Sports Park',
              description: 'The final 3-day showdown for the regional title.',
              tournamentTeams: tournamentTeamsData.map((t: any) => t.name),
              tournamentTeamsData: tournamentTeamsData,
              tournamentGames: enrichedTournamentGames,
              refereePool: demoRefereePool,
              teamAgreements: {
                'Strikers': { signedAt: yesterday, signatureCount: 15, captainName: 'Coach Strikers' },
                'Lakers': { signedAt: day2, signatureCount: 12, captainName: 'Coach Lakers' },
                'Hawks': { signedAt: day3, signatureCount: 14, captainName: 'Coach Hawks' },
                'Tigers': { signedAt: yesterday, signatureCount: 11, captainName: 'Coach Tigers' }
              },
              status: 'active'
            }));

            // Regular practices
            const practices = [
              { id: `prac1_${tid}`, teamId: tid, title: 'Tactical Drill Session', eventType: 'practice', date: new Date(nowObj.getTime() + (pracOffset) * 86400000).toISOString(), startTime: '04:00 PM', location: 'Practice Court A', drillIds: [`d1_${tid}`] },
              { id: `prac2_${tid}`, teamId: tid, title: 'Strength & Conditioning', eventType: 'practice', date: new Date(nowObj.getTime() + (pracOffset + 2) * 86400000).toISOString(), startTime: '06:00 PM', location: 'Gymnasium', drillIds: [`d2_${tid}`] },
              { id: `prac3_${tid}`, teamId: tid, title: 'Morning Performance Lab', eventType: 'practice', date: new Date(nowObj.getTime() + (pracOffset + 3) * 86400000).toISOString(), startTime: '06:30 AM', location: 'West Field', drillIds: [`d1_${tid}`] },
              { id: `prac4_${tid}`, teamId: tid, title: 'Institutional Strategy Review', eventType: 'practice', date: new Date(nowObj.getTime() + (pracOffset + 4) * 86400000).toISOString(), startTime: '07:00 PM', location: 'Clubhouse', drillIds: [`d2_${tid}`] }
            ];
            practices.forEach(p => batch.set(doc(db, 'teams', tid, 'events', p.id), clean(p)));
            await batch.flush();
        }
        
        await batch.commit();
        return strikerId;
    }

    // School/League creator demo: 4 real squads (school/elite) get full data; the institution is separate.
    // For league_creator, they have no teams.
    const teamVariants = isLeagueDemo ? [] : (isEliteDemo ? ['Premier Division', 'Championship Division', 'Development Division'] : (isSchoolDemo ? ['Jr Soccer Club', 'Sr Soccer Club', 'Badminton Club', 'Jr Volleyball Club', 'Sr Volleyball Club'] : ['']));
    const leagueId = `demo_league_${userId.slice(-4)}`;

    // Create a league for non-parent demos to tie everything together
    if (!isParentDemo) {
        const leagueTeams: Record<string, any> = {};
        const memberTeamIds: string[] = [];
        
        // Add the user's actual teams
        for (let i = 0; i < teamVariants.length; i++) {
            const v = teamVariants[i];
            const tId = `demo_${planId}_${userId.slice(-4)}${v ? '_' + v.toLowerCase().replace(/\s+/g, '') : ''}`;
            const tName = isSchoolDemo ? `Springfield ${v}` : (v ? `Elite Squad - ${v}` : (isProTier ? 'Apex Demo Squad' : 'Grassroots Demo'));
            leagueTeams[tId] = { teamName: tName, coachName: 'Guest Coach', coachEmail: `coach_${i}@thesquad.pro`, wins: [3, 2, 1, 0][i] || 0, losses: [0, 1, 2, 3][i] || 0, points: [9, 6, 3, 0][i] || 0 };
            memberTeamIds.push(tId);
        }
        
        // Pad the league with mock opponents so it always has at least 4 teams (or 6 for league demo)
        const mockOpponents = isSchoolDemo
          ? ['Riverside High School', 'Lincoln Prep Academy', 'Jefferson Academy', 'Westlake Athletic', 'Central High School', 'Northview Academy']
          : ['City Wildcats', 'Metro Stars', 'Valley Vipers', 'Coastal Elite', 'Summit United', 'Apex United'];
        const mockTeamIds = isSchoolDemo
          ? ['rival_riverside', 'rival_lincoln', 'rival_jefferson', 'rival_westlake', 'rival_central', 'rival_northview']
          : ['wildcats_id', 'stars_id', 'vipers_id', 'elite_id', 'summit_id', 'apex_id'];
        let mockIndex = 0;
        const targetTeamCount = isLeagueDemo ? 6 : 4;
        while (Object.keys(leagueTeams).length < targetTeamCount) {
            const mockId = mockTeamIds[mockIndex] || `mock_${mockIndex}_${userId.slice(-4)}`;
            leagueTeams[mockId] = { teamName: mockOpponents[mockIndex], coachName: `Coach ${mockOpponents[mockIndex]}`, coachEmail: `coach@${mockOpponents[mockIndex].toLowerCase().replace(/\s+/g, '')}.com`, wins: Math.floor(Math.random() * 3), losses: Math.floor(Math.random() * 3), points: Math.floor(Math.random() * 9), teamLogoUrl: `https://picsum.photos/seed/${mockOpponents[mockIndex].replace(/\s+/g, '')}/200/200` };
            memberTeamIds.push(mockId);
            mockIndex++;
        }

        const primaryTid = isLeagueDemo ? 'wildcats_id' : `demo_${planId}_${userId.slice(-4)}${teamVariants[0] ? '_' + teamVariants[0].toLowerCase().replace(/\s+/g, '') : ''}`;
        const secondTid = isLeagueDemo ? 'stars_id' : (Object.keys(leagueTeams)[1] || primaryTid);
        
        batch.set(doc(db, 'leagues', leagueId), clean({
            id: leagueId,
            name: isSchoolDemo ? 'State Academic Athletic League' : 'Apex Premier Circuit',
            description: 'The premier circuit for top-tier competitive programs.',
            createdBy: userId,
            creatorId: userId,
            memberTeamIds,
            memberUserIds: [userId],
            isDemo: true,
            status: 'active',
            createdAt: now,
            teams: leagueTeams,
            schedule: isLeagueDemo ? [
              { id: 'sched1', team1: 'City Wildcats', team1Id: 'wildcats_id', team2: 'Metro Stars', team2Id: 'stars_id', date: tomorrow, time: '10:00 AM', location: 'Main Arena', status: 'scheduled' },
              { id: 'sched2', team1: 'Valley Vipers', team1Id: 'vipers_id', team2: 'Coastal Elite', team2Id: 'elite_id', date: tomorrow, time: '12:00 PM', location: 'Court B', status: 'scheduled' },
              { id: 'sched3', team1: 'Summit United', team1Id: 'summit_id', team2: 'Apex United', team2Id: 'apex_id', date: tomorrow, time: '02:00 PM', location: 'Court C', status: 'scheduled' },
              { id: 'sched4', team1: 'City Wildcats', team1Id: 'wildcats_id', team2: 'Valley Vipers', team2Id: 'vipers_id', date: later, time: '09:00 AM', location: 'Main Arena', status: 'scheduled' },
              { id: 'sched5', team1: 'Metro Stars', team1Id: 'stars_id', team2: 'Apex United', team2Id: 'apex_id', date: later, time: '11:00 AM', location: 'Court B', status: 'scheduled' },
              { id: 'sched6', team1: 'Coastal Elite', team1Id: 'elite_id', team2: 'Summit United', team2Id: 'summit_id', date: later, time: '01:00 PM', location: 'Court C', status: 'scheduled' }
            ] : isSchoolDemo ? [
              { id: 'sched1', team1: 'Springfield Jr Soccer Club', team1Id: primaryTid, team2: 'Riverside High School', team2Id: 'rival_riverside', date: tomorrow, time: '10:00 AM', location: 'Main Field', status: 'scheduled' },
              { id: 'sched2', team1: 'Springfield Sr Soccer Club', team1Id: secondTid, team2: 'Lincoln Prep Academy', team2Id: 'rival_lincoln', date: tomorrow, time: '12:00 PM', location: 'Court B', status: 'scheduled' },
              { id: 'sched3', team1: 'Springfield Badminton Club', team1Id: `demo_${planId}_${userId.slice(-4)}_badmintonclub`, team2: 'Jefferson Academy', team2Id: 'rival_jefferson', date: later, time: '09:00 AM', location: 'Gymnasium A', status: 'scheduled' },
              { id: 'sched4', team1: 'Springfield Jr Volleyball Club', team1Id: `demo_${planId}_${userId.slice(-4)}_jrvolleyballclub`, team2: 'Westlake Athletic', team2Id: 'rival_westlake', date: later, time: '11:00 AM', location: 'Gymnasium B', status: 'scheduled' },
              { id: 'sched5', team1: 'Springfield Sr Volleyball Club', team1Id: `demo_${planId}_${userId.slice(-4)}_srvolleyballclub`, team2: 'Central High School', team2Id: 'rival_central', date: new Date(nowObj.getTime() + 7 * 86400000).toISOString(), time: '02:00 PM', location: 'Court C', status: 'scheduled' },
              { id: 'sched6', team1: 'Springfield Jr Soccer Club', team1Id: primaryTid, team2: 'Northview Academy', team2Id: 'rival_northview', date: new Date(nowObj.getTime() + 9 * 86400000).toISOString(), time: '04:00 PM', location: 'Main Field', status: 'scheduled' },
              { id: 'sched7', team1: 'Springfield Sr Soccer Club', team1Id: secondTid, team2: 'Riverside High School', team2Id: 'rival_riverside', date: new Date(nowObj.getTime() + 12 * 86400000).toISOString(), time: '10:00 AM', location: 'Away – Riverside', status: 'scheduled' }
            ] : [
              { id: 'sched1', team1: 'Elite Squad - Premier Division', team1Id: primaryTid, team2: 'City Wildcats', team2Id: 'wildcats_id', date: tomorrow, time: '10:00 AM', location: 'Main Arena', status: 'scheduled' },
              { id: 'sched2', team1: 'Elite Squad - Championship Division', team1Id: secondTid, team2: 'Metro Stars', team2Id: 'stars_id', date: tomorrow, time: '02:00 PM', location: 'Court B', status: 'scheduled' },
              { id: 'sched3', team1: 'Elite Squad - Premier Division', team1Id: primaryTid, team2: 'Valley Vipers', team2Id: 'vipers_id', date: later, time: '11:00 AM', location: 'State Complex', status: 'scheduled' },
              { id: 'sched4', team1: 'Elite Squad - Championship Division', team1Id: secondTid, team2: 'Coastal Elite', team2Id: 'elite_id', date: new Date(nowObj.getTime() + 7 * 86400000).toISOString(), time: '09:00 AM', location: 'Main Arena', status: 'scheduled' },
              { id: 'sched5', team1: 'Elite Squad - Development Division', team1Id: `demo_${planId}_${userId.slice(-4)}_developmentdivision`, team2: 'Summit United', team2Id: 'summit_id', date: new Date(nowObj.getTime() + 9 * 86400000).toISOString(), time: '05:00 PM', location: 'Court C', status: 'scheduled' },
              { id: 'sched6', team1: 'Elite Squad - Premier Division', team1Id: primaryTid, team2: 'Apex United', team2Id: 'apex_id', date: new Date(nowObj.getTime() + 12 * 86400000).toISOString(), time: '01:00 PM', location: 'State Complex', status: 'scheduled' },
              { id: 'sched7', team1: 'Elite Squad - Championship Division', team1Id: secondTid, team2: 'City Wildcats', team2Id: 'wildcats_id', date: new Date(nowObj.getTime() + 14 * 86400000).toISOString(), time: '03:30 PM', location: 'Main Arena', status: 'scheduled' }
            ]
        }));
    }

    // ── School Institution (lightweight record — no events, no roster) ────────
    if (isSchoolDemo) {
      const instId = `demo_${planId}_${userId.slice(-4)}_institution`;
      const instCode = (h => Math.abs(h).toString(36).toUpperCase().padStart(8,'0'))(instId.split('').reduce((h,c)=>(Math.imul(31,h)+c.charCodeAt(0))|0,0));
      batch.set(doc(db, 'teams', instId), clean({
        id: instId,
        name: 'Springfield High School',
        teamName: 'Springfield High School',
        code: instCode, teamCode: instCode, inviteCode: instCode,
        ownerUserId: userId, demoOwnerUserId: userId, isPro: true, planId: plan_type,
        sport: 'Basketball', isDemo: true,
        type: 'school',         // AD / institution level — NOT a playable squad
        schoolId: instId,       // self-reference so squads can link back
        isInstitution: true,    // explicit flag for UI guards
        createdAt: now,
        heroImageUrl: `https://picsum.photos/seed/${instId}hero/1200/400`,
        teamLogoUrl: `https://picsum.photos/seed/${instId}logo/200/200`
      }));
      batch.set(doc(db, 'users', userId, 'teamMemberships', instId), clean({
        teamId: instId, name: 'Springfield High School', role, isPro: true,
        planId: plan_type, isDemo: true, joinedAt: now, ownerUserId: userId,
        type: 'school', schoolId: instId, isInstitution: true
      }));
      batch.set(doc(db, 'teams', instId, 'members', userId), clean({
        id: userId, userId, teamId: instId,
        name: 'Guest Admin', role, position: 'Athletic Director', jersey: 'AD',
        joinedAt: now, isDemo: true,
        avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=guest`,
        ownerUserId: userId, email: `admin@thesquad.pro`
      }));
      await batch.flush();
    }

    for (let i = 0; i < teamVariants.length; i++) {
        const variant = teamVariants[i];
        const teamId = `demo_${planId}_${userId.slice(-4)}_${(variant || 'main').toLowerCase().replace(/\s+/g, '')}`;
        const name = isSchoolDemo ? `Springfield ${variant}` : (variant ? `Elite Squad - ${variant}` : (isProTier ? 'Apex Demo Squad' : 'Grassroots Demo'));
        // All school variants are squads — the institution is a separate record created above
        const teamType = isSchoolDemo ? 'school_squad' : 'youth';
        const schoolId = isSchoolDemo ? `demo_${planId}_${userId.slice(-4)}_institution` : undefined;


        const uniqueCode = (h => Math.abs(h).toString(36).toUpperCase().padStart(8,'0'))(teamId.split('').reduce((h,c)=>(Math.imul(31,h)+c.charCodeAt(0))|0,0));
        batch.set(doc(db, 'teams', teamId), clean({ 
            id: teamId,
            name,       // canonical field used by Team type
            teamName: name, // legacy alias kept for compatibility
            code: uniqueCode, teamCode: uniqueCode, inviteCode: uniqueCode,
            ownerUserId: userId, demoOwnerUserId: userId, isPro: isProTier || isSchoolDemo, planId: plan_type, sport: isSchoolDemo ? 'Basketball' : 'Multi-Sport',
            isDemo: true, type: teamType, schoolId, leagueId: !isParentDemo ? leagueId : undefined,
            createdAt: now, heroImageUrl: `https://picsum.photos/seed/${teamId}hero/1200/400`,
            teamLogoUrl: `https://picsum.photos/seed/${teamId}logo/200/200`
        }));

        batch.set(doc(db, 'users', userId, 'teamMemberships', teamId), clean({
            teamId, name, role, isPro: isProTier || isSchoolDemo, planId: plan_type, isDemo: true, joinedAt: now, ownerUserId: userId, type: teamType, schoolId
        }));
        // CRITICAL: Flush team doc to Firestore BEFORE writing subcollections.
        // Firestore rules evaluate exists(teams/teamId) at commit time — if the team doc
        // is in the same batch as subcollection writes, the exists() check returns false
        // and the write is denied even though isTeamOwner has the demo_* regex bypass.
        // Committing the team first guarantees the document is live before subcollections.
        await batch.flush();

        batch.set(doc(db, 'teams', teamId, 'members', userId), clean({
            id: userId, userId, teamId, playerId: `p_${userId}_${teamId}`, 
            name: isSchoolDemo ? 'Guest Admin' : `Guest ${pos}`, role, position: pos, jersey: 'H',
            joinedAt: now, isDemo: true, avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=guest`,
            ownerUserId: userId, email: `${userRole}@thesquad.pro`
        }));

        const data = GET_DEMO_DATA(teamId, userId, variant, name, i);
        
        const showcasePlayerVideos: Array<{ playerId: string; videoId: string; data: Record<string, unknown> }> = [];

        // Seed Roster Members & Player Profiles
        data.members.forEach(m => {
            batch.set(doc(db, 'teams', teamId, 'members', m.id), clean({ ...m, teamId, joinedAt: now, isDemo: true }));
            
            // For youth teams, seed the actual Player Profile for "verified" feeling
            if (teamType === 'youth' || teamType === 'school_squad') {
                batch.set(doc(db, 'players', m.playerId), clean({
                    id: m.playerId,
                    firstName: m.name.split(' ')[0],
                    lastName: m.name.split(' ')[1] || 'Guest',
                    isMinor: true,
                    isDemo: true,
                    demoOwnerUserId: userId,
                    dateOfBirth: new Date(nowObj.getFullYear() - 15, 0, 1).toISOString().split('T')[0],
                    hasLogin: false,
                    createdAt: now,
                    joinedTeamIds: [teamId],
                    primaryTeamId: teamId,
                    updatedByTeamId: teamId,
                    avatar: m.avatar,
                    school: (m as any).school,
                    gradYear: (m as any).gradYear,
                    gpa: (m as any).gpa,
                    primaryPosition: m.position,
                    sports: [isSchoolDemo ? 'Basketball' : 'Multi-Sport'],
                    // Keep recruiting private by default. Alex is the single
                    // deterministic public demo used to exercise the scout portal.
                    recruitingProfileEnabled: m.name === 'Alex Rivera'
                }));

                // Add recruiting content to one of the main players to showcase recruiting portal
                if (m.name === 'Alex Rivera') {
                    showcasePlayerVideos.push({
                      playerId: m.playerId,
                      videoId: `vid_${m.id}`,
                      data: {
                        id: `vid_${m.id}`,
                        title: 'Championship Winning Goal',
                        url: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
                        thumbnail: 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=800&q=80',
                        type: 'Highlight',
                        createdAt: yesterday,
                        isPublic: true,
                        isDemo: true,
                        updatedByTeamId: teamId,
                      },
                    });
                }
            }
        });

        // Player subcollections are authorized from the committed parent player doc.
        await batch.flush();
        showcasePlayerVideos.forEach(video => {
          batch.set(doc(db, 'players', video.playerId, 'videos', video.videoId), video.data);
        });

        data.events.forEach(e => batch.set(doc(db, 'teams', teamId, 'events', e.id), clean({ ...e, teamId, isDemo: true })));
        data.eventBrackets.forEach(eb => {
            eb.brackets.forEach(b => batch.set(doc(db, 'teams', teamId, 'events', eb.eventId, 'brackets', b.id), clean({ ...b, isDemo: true })));
        });
        data.drills.forEach(d => batch.set(doc(db, 'teams', teamId, 'drills', d.id), clean({ ...d, isDemo: true })));
        data.practice_templates.forEach(pt => batch.set(doc(db, 'teams', teamId, 'practice_templates', pt.id), clean({ ...pt, isDemo: true })));
        data.feed.forEach(p => batch.set(doc(db, 'teams', teamId, 'feedPosts', p.id), clean({ ...p, isDemo: true })));
        data.documents.forEach(d => batch.set(doc(db, 'teams', teamId, 'documents', d.id), clean({ ...d, ownerUserId: userId, isDemo: true })));
        data.alerts.forEach(a => batch.set(doc(db, 'teams', teamId, 'alerts', a.id), clean({ ...a, isDemo: true })));
        data.volunteers.forEach(v => batch.set(doc(db, 'teams', teamId, 'volunteers', v.id), clean({ ...v, isDemo: true })));
        data.fundraising.forEach(fund => {
          const { donations: _d, ...fundDoc } = fund;
          batch.set(doc(db, 'teams', teamId, 'fundraising', fund.id), clean({ ...fundDoc, isDemo: true }));
        });
        // Seed donation sub-docs for Audit Hub
        for (const fund of data.fundraising) {
          for (const don of (fund.donations || [])) {
            batch.set(doc(db, 'teams', teamId, 'fundraising', fund.id, 'donations', don.id), clean({ ...don, isDemo: true }));
          }
        }

        data.equipment.forEach(eq => batch.set(doc(db, 'teams', teamId, 'equipment', eq.id), clean({ ...eq, isDemo: true })));
        data.incidents.forEach(inc => batch.set(doc(db, 'teams', teamId, 'incidents', inc.id), clean({ ...inc, isDemo: true })));
        // Seed game results for Scorekeeping page
        data.games.forEach(g => {
            const matchTeamIds = [teamId, 'mock_opp'].filter(Boolean);
            batch.set(doc(db, 'teams', teamId, 'games', g.id), clean({ ...g, teamId, matchTeamIds, createdAt: now, isDemo: true }));
        });
        await batch.flush();
        // Seed files for Library
        data.files.forEach(f => batch.set(doc(db, 'teams', teamId, 'files', f.id), clean({ ...f, teamId, isDemo: true })));
        // Seed document signatures for Coaches Corner / Files
        data.signatures.forEach(s => s.sigs.forEach(sig => batch.set(doc(db, 'teams', teamId, 'members', sig.userId, 'signatures', sig.documentId), clean({ ...sig, isDemo: true }))));
        await batch.flush();
        data.chats.forEach(c => {
            batch.set(doc(db, 'teams', teamId, 'groupChats', c.id), clean({ id: c.id, name: c.name, createdBy: c.createdBy, memberIds: c.memberIds, isDeleted: c.isDeleted, teamId: c.teamId, createdAt: c.createdAt, isDemo: true }));
            c.messages.forEach(m => batch.set(doc(db, 'teams', teamId, 'groupChats', c.id, 'messages', m.id), clean({ ...m, isDemo: true })));
        });
        await batch.flush();
    }

    await batch.commit();

    // ── School Demo: Auto-seed Hub Broadcast Channel ──────────────────────────
    // Create the hub broadcast channel under the institution groupChats so the
    // Athletic Director sees a pre-populated channel immediately on first login.
    // memberIds + staffMetadata includes every head/assistant coach from all squads.
    if (isSchoolDemo) {
      const instId = `demo_${planId}_${userId.slice(-4)}_institution`;
      const hubChatId = `hub_broadcast_${userId.slice(-4)}`;
      const hubMemberIds: string[] = [userId];
      const staffMeta: Record<string, { name: string; position: string; avatar: string; squadName?: string }> = {
        [userId]: { name: 'Guest Admin', position: 'Athletic Director', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=guest` }
      };

      for (let i = 0; i < teamVariants.length; i++) {
        const variant = teamVariants[i];
        const tId = `demo_${planId}_${userId.slice(-4)}_${variant.toLowerCase().replace(/\s+/g, '')}`;
        const staff = COACHING_STAFF[i % COACHING_STAFF.length];
        const squadName = `Springfield ${variant}`;
        const u1 = `u1_${tId}`;
        const u2 = `u2_${tId}`;
        hubMemberIds.push(u1, u2);
        staffMeta[u1] = { name: staff.headName, position: 'Head Coach', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${staff.headAvatar}`, squadName };
        staffMeta[u2] = { name: staff.asstName, position: 'Assistant Coach', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${staff.asstAvatar}`, squadName };
      }

      const hubBatch = new BatchHelper(db);
      // Flush institution doc first so the groupChat subcollection write passes rule evaluation
      hubBatch.set(doc(db, 'teams', instId, 'groupChats', hubChatId), clean({
        id: hubChatId,
        name: 'Springfield High School — Broadcast Channel',
        createdBy: userId,
        memberIds: hubMemberIds,
        isDeleted: false,
        teamId: instId,
        createdAt: now,
        isHubChannel: true,
        hubTeamId: instId,
        staffMetadata: staffMeta,
        isDemo: true
      }));
      await hubBatch.flush();
    }

    // ── Elite Demo: Auto-seed Hub Broadcast Channel ───────────────────────────
    if (isEliteDemo) {
      const primaryTId = `demo_${planId}_${userId.slice(-4)}_${teamVariants[0].toLowerCase().replace(/\s+/g, '')}`;
      const hubChatId = `hub_broadcast_elite_${userId.slice(-4)}`;
      const hubMemberIds: string[] = [userId];
      const staffMeta: Record<string, { name: string; position: string; avatar: string; squadName?: string }> = {
        [userId]: { name: 'Guest Coach', position: 'League Organizer', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=guestcoach` }
      };

      for (let i = 0; i < teamVariants.length; i++) {
        const variant = teamVariants[i];
        const tId = `demo_${planId}_${userId.slice(-4)}_${variant.toLowerCase().replace(/\s+/g, '')}`;
        const staff = COACHING_STAFF[i % COACHING_STAFF.length];
        const squadName = `Elite Squad - ${variant}`;
        const u1 = `u1_${tId}`;
        const u2 = `u2_${tId}`;
        hubMemberIds.push(u1, u2);
        staffMeta[u1] = { name: staff.headName, position: 'Head Coach', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${staff.headAvatar}`, squadName };
        staffMeta[u2] = { name: staff.asstName, position: 'Assistant Coach', avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${staff.asstAvatar}`, squadName };
      }

      const eliteBatch = new BatchHelper(db);
      eliteBatch.set(doc(db, 'teams', primaryTId, 'groupChats', hubChatId), clean({
        id: hubChatId,
        name: 'Apex Academy — Broadcast Channel',
        createdBy: userId,
        memberIds: hubMemberIds,
        isDeleted: false,
        teamId: primaryTId,
        createdAt: now,
        isHubChannel: true,
        hubTeamId: primaryTId,
        staffMetadata: staffMeta,
        isDemo: true
      }));
      await eliteBatch.flush();
    }

    if (isLeagueDemo) return '';
    const primaryVariant = teamVariants[0] || 'main';
    return `demo_${planId}_${userId.slice(-4)}_${primaryVariant.toLowerCase().replace(/\s+/g, '')}`;
}
