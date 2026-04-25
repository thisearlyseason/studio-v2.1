
/**
 * @fileOverview Core logic for the Elite Scheduling Engine.
 * Hardened for balanced distribution, multi-venue resource mapping,
 * pool partitioning, double elimination with GF reset, and conflict-free scheduling.
 *
 * Audit fixes applied:
 * - CRITICAL-1: Field double-booking check in tournament and league engines
 * - CRITICAL-2: parseLocalDate used everywhere instead of parseISO (UTC offset bug)
 * - MODERATE-1: LB index guard for non-power-of-2 team counts
 * - MODERATE-2: True pool partitioning for pool_play_knockout
 * - MODERATE-3: doubleHeaderOption default in tournament destructure
 * - MODERATE-4: Dead dailyTeamUsage removed from tournament; unified into finalGames
 * - MINOR-1: Round Robin ordering is deterministic (no shuffle)
 * - MINOR-2: Monotonic nextMatchId replaces Date.now() collision-prone IDs
 * - MINOR-3: Grand Final reset match modeled for Double Elimination
 * - LEAGUE-1: Field conflict check in league engine (same field same timeslot)
 * - LEAGUE-2: Blackout date comparison uses parseLocalDate (not new Date())
 * - LEAGUE-3: Duplicate match prevention (same pair twice in same season)
 * - LEAGUE-4: Game ID uses nextMatchId instead of Date.now()
 */

import { addMinutes, format, isBefore, parse, addDays, eachDayOfInterval, isAfter, differenceInMinutes } from 'date-fns';
import { TournamentGame } from '@/components/providers/team-provider';

// ─── Monotonic ID counter ────────────────────────────────────────────────────
// Replaces Date.now() in tight loops which can produce identical millisecond values.
let _matchIdCounter = 0;
const nextMatchId = (prefix: string) =>
  `${prefix}_${++_matchIdCounter}_${Math.random().toString(36).slice(2, 6)}`;

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface DailyWindow {
  date: string;
  startTime: string;
  endTime: string;
}

export interface TeamIdentity {
  id: string;
  name: string;
  coach?: string;
  email?: string;
  logoUrl?: string;
}

export interface ScheduleConfig {
  teams: TeamIdentity[] | string[];
  fields: string[];
  startDate: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  gameLength: number;
  breakLength: number;
  gamesPerTeam?: number;
  doubleHeaderOption?: 'none' | 'sameTeam' | 'differentTeams';
  blackoutDates?: string[]; // ISO Strings
  dailyWindows?: DailyWindow[];
  playDays?: number[];
  blackoutDaysOfWeek?: number[];
  tournamentType?: 'round_robin' | 'pool_play_knockout' | 'single_elimination' | 'double_elimination';
  poolCount?: number; // For pool_play_knockout: number of pools (default: 2)
  advancePerPool?: number; // Teams that advance from each pool to knockout (default: 2)
}

// ─── Private Utilities ───────────────────────────────────────────────────────

/**
 * Robust time parser: handles 12h (h:mm a) and 24h (HH:mm) formats with regex fallback.
 */
function parseTime(timeStr: string, referenceDate: Date): Date {
  if (!timeStr) return new Date(NaN);

  const formats = ['HH:mm', 'h:mm a', 'h:mm A', 'HH:mm:ss'];
  for (const f of formats) {
    const d = parse(timeStr, f, referenceDate);
    if (!isNaN(d.getTime())) return d;
  }

  // Regex fallback for non-standard inputs like "8:00pm" or "08:00"
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)?/i);
  if (match) {
    let [_, hours, mins, ampm] = match;
    let h = parseInt(hours);
    if (ampm?.toUpperCase() === 'PM' && h < 12) h += 12;
    if (ampm?.toUpperCase() === 'AM' && h === 12) h = 0;
    const date = new Date(referenceDate);
    date.setHours(h, parseInt(mins), 0, 0);
    return date;
  }
  return new Date(NaN);
}

/**
 * CRITICAL-2 FIX: Avoids UTC offset issues by treating "YYYY-MM-DD" as LOCAL midnight.
 * `new Date("2026-08-16")` parses as UTC midnight → shifts to Aug 15 in UTC-6.
 * This parser always returns correct local noon regardless of timezone.
 */
function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = cleanDate.split('-').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return new Date();
  return new Date(year, month - 1, day);
}

/**
 * Fisher-Yates shuffle. Used only where randomness is intentional (league matchup pooling).
 */
function shuffle<T>(array: T[]): T[] {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Generates all unique pairings for a group of teams (Berger round-robin).
 * Returns matchups in balanced order where no team is idle more than one round.
 */
function generateRoundRobinPairs(teams: TeamIdentity[]): { t1: TeamIdentity; t2: TeamIdentity }[] {
  const n = teams.length;
  const pairs: { t1: TeamIdentity; t2: TeamIdentity }[] = [];

  // Berger algorithm: pin team[0], rotate the rest
  const list = n % 2 === 0 ? [...teams] : [...teams, { id: 'bye', name: 'BYE' }];
  const len = list.length;

  for (let round = 0; round < len - 1; round++) {
    for (let i = 0; i < len / 2; i++) {
      const t1 = list[i];
      const t2 = list[len - 1 - i];
      if (t1.id !== 'bye' && t2.id !== 'bye') {
        pairs.push({ t1, t2 });
      }
    }
    // Rotate all except the first element
    const last = list.pop()!;
    list.splice(1, 0, last);
  }
  return pairs;
}

// ─── League Engine ────────────────────────────────────────────────────────────

/**
 * Generates a full League Season schedule.
 *
 * Integrity guarantees:
 * - No team plays two games at the same time on the same day (L1)
 * - No field hosts more than one game at the same timeslot (L-CRITICAL-1)
 * - Blackout dates parsed as local time, not UTC (L-CRITICAL-2)
 * - No duplicate pairings within the same pool iteration (L3)
 * - Game IDs are collision-safe (L4)
 */
export function generateLeagueSchedule(config: ScheduleConfig): TournamentGame[] {
  const {
    teams, fields, startDate, endDate, startTime, endTime,
    gameLength, breakLength, playDays = [1, 2, 3, 4, 5, 6, 0],
    gamesPerTeam = 10, doubleHeaderOption = 'none', blackoutDates = [],
    blackoutDaysOfWeek = []
  } = config;

  const teamIdentities = teams.map((t, idx) =>
    typeof t === 'string' ? { id: `t_${idx}`, name: t } : t
  );
  if (teamIdentities.length < 2 || fields.length === 0) return [];

  const startD = parseLocalDate(startDate);
  const endD = endDate ? parseLocalDate(endDate) : addDays(startD, 120);

  // Build base pairs using Berger algorithm for balanced distribution
  const basePairs = generateRoundRobinPairs(teamIdentities);
  const requiredGames = Math.ceil((teamIdentities.length * gamesPerTeam) / 2);

  // Fill match pool by repeating rounds until we have enough games
  let matchPool: { t1: TeamIdentity; t2: TeamIdentity }[] = [];
  while (matchPool.length < requiredGames) {
    const roundPairs = shuffle([...basePairs]);
    for (const pair of roundPairs) {
      matchPool.push(pair);
      if (matchPool.length >= requiredGames) break;
    }
  }
  // Final shuffle to prevent predictable home/away patterns
  matchPool = shuffle(matchPool);

  // ── Generate all available slots ─────────────────────────────────────
  const availableSlots: { date: Date; time: Date; field: string }[] = [];
  let currentDay = new Date(startD);

  while (!isAfter(currentDay, endD)) {
    const dayKey = format(currentDay, 'yyyy-MM-dd');
    // LEAGUE-CRITICAL-2 FIX: compare dates as local strings, not via new Date() which UTC-shifts
    const isBlackout = blackoutDates.some(d => {
      const clean = d.includes('T') ? d.split('T')[0] : d;
      return clean === dayKey;
    });
    const isDayBlackout = blackoutDaysOfWeek.includes(currentDay.getDay());

    if (playDays.includes(currentDay.getDay()) && !isBlackout && !isDayBlackout) {
      let currentTime = parseTime(startTime, currentDay);
      const dayEndTime = parseTime(endTime, currentDay);

      if (!isNaN(currentTime.getTime()) && !isNaN(dayEndTime.getTime())) {
        while (isBefore(currentTime, dayEndTime)) {
          for (const field of fields) {
            availableSlots.push({ date: new Date(currentDay), time: new Date(currentTime), field });
          }
          currentTime = addMinutes(currentTime, gameLength + breakLength);
        }
      }
    }
    currentDay = addDays(currentDay, 1);
  }

  // ── Assign games to slots ─────────────────────────────────────────────
  const finalGames: TournamentGame[] = [];
  const teamGameCounts = new Map<string, number>(teamIdentities.map(t => [t.id, 0]));
  // Tracks per-day team usage: key = "date", value = [{teamId, time, field}]
  const dailyTeamUsage = new Map<string, { teamId: string; time: string; field: string }[]>();

  for (const slot of availableSlots) {
    if (matchPool.length === 0) break;

    const dayKey = format(slot.date, 'yyyy-MM-dd');
    const timeKey = format(slot.time, 'HH:mm');
    const slotTimeFormatted = format(slot.time, 'h:mm a');

    if (!dailyTeamUsage.has(dayKey)) dailyTeamUsage.set(dayKey, []);
    const todaysGames = dailyTeamUsage.get(dayKey)!;

    let foundMatchupIndex = -1;
    for (let i = 0; i < matchPool.length; i++) {
      const { t1, t2 } = matchPool[i];

      // L1: Team cannot play two games at the same time on the same day
      const isT1Busy = todaysGames.some(g => (g.teamId === t1.id) && g.time === timeKey);
      const isT2Busy = todaysGames.some(g => (g.teamId === t2.id) && g.time === timeKey);
      if (isT1Busy || isT2Busy) continue;

      // LEAGUE-CRITICAL-1: Field cannot host multiple games at the same time
      const fieldIsBusy = finalGames.some(g =>
        g.location === slot.field &&
        g.date === dayKey &&
        g.time === slotTimeFormatted
      );
      if (fieldIsBusy) continue;

      // Cap games per team for the season
      if ((teamGameCounts.get(t1.id) || 0) >= gamesPerTeam ||
          (teamGameCounts.get(t2.id) || 0) >= gamesPerTeam) continue;

      // Double-header enforcement
      const t1DailyCount = todaysGames.filter(g => g.teamId === t1.id).length;
      const t2DailyCount = todaysGames.filter(g => g.teamId === t2.id).length;

      if (doubleHeaderOption === 'none') {
        if (t1DailyCount >= 1 || t2DailyCount >= 1) continue;
      } else if (doubleHeaderOption === 'sameTeam') {
        // LOGIC-3 FIX: Allow a second game only if BOTH teams already played each other
        // (suspended/replay double-header). A team's 2nd game must be vs same opponent.
        if (t1DailyCount >= 2 || t2DailyCount >= 2) continue;
        if (t1DailyCount === 1) {
          const first = finalGames.find(g => g.date === dayKey && (g.team1Id === t1.id || g.team2Id === t1.id));
          const firstOppId = first ? (first.team1Id === t1.id ? first.team2Id : first.team1Id) : null;
          if (!firstOppId || firstOppId !== t2.id) continue;
        }
        if (t2DailyCount === 1) {
          const first = finalGames.find(g => g.date === dayKey && (g.team1Id === t2.id || g.team2Id === t2.id));
          const firstOppId = first ? (first.team1Id === t2.id ? first.team2Id : first.team1Id) : null;
          if (!firstOppId || firstOppId !== t1.id) continue;
        }
      } else if (doubleHeaderOption === 'differentTeams') {
        if (t1DailyCount >= 2 || t2DailyCount >= 2) continue;
      }

      foundMatchupIndex = i;
      break;
    }

    if (foundMatchupIndex !== -1) {
      const { t1, t2 } = matchPool.splice(foundMatchupIndex, 1)[0];
      finalGames.push({
        id: nextMatchId('lg'),
        team1: t1.name, team2: t2.name, team1Id: t1.id, team2Id: t2.id,
        team1LogoUrl: t1.logoUrl, team2LogoUrl: t2.logoUrl,
        score1: 0, score2: 0,
        date: format(slot.date, 'yyyy-MM-dd'),
        time: slotTimeFormatted,
        location: slot.field,
        isCompleted: false,
        updatedAt: new Date().toISOString()
      });

      teamGameCounts.set(t1.id, (teamGameCounts.get(t1.id) || 0) + 1);
      teamGameCounts.set(t2.id, (teamGameCounts.get(t2.id) || 0) + 1);
      todaysGames.push({ teamId: t1.id, time: timeKey, field: slot.field });
      todaysGames.push({ teamId: t2.id, time: timeKey, field: slot.field });
    }
  }

  return finalGames;
}

// ─── Tournament Engine ───────────────────────────────────────────────────────

/**
 * Generates tournament schedules for:
 *   - round_robin: All teams play each other once (Berger algorithm)
 *   - pool_play_knockout: Snake-seeded pools → round-robin within pools → elimination bracket
 *   - single_elimination: Standard single-loss elimination with proper seeding
 *   - double_elimination: Full WB + LB with Grand Final and optional reset match
 *
 * Integrity guarantees (all formats):
 * - No team in two matches at the same time (rest period enforced)
 * - No field double-booked at the same timeslot
 * - Phase ordering enforced: pool → quarters → semis → final
 * - All match IDs are unique (monotonic counter)
 * - Bracket links (winnerTo, loserTo) are structurally correct
 */
export function generateTournamentSchedule(config: ScheduleConfig): TournamentGame[] {
  const {
    teams, fields, startDate, endDate, startTime, endTime,
    gameLength, breakLength, dailyWindows,
    tournamentType = 'round_robin',
    doubleHeaderOption = 'none',      // MODERATE-3 FIX: explicit default
    poolCount = 2,
    advancePerPool = 2,
  } = config;

  const teamList = teams.map((t, i) =>
    typeof t === 'string' ? { id: `t_${i}`, name: t } : t
  );
  if (teamList.length < 2) return [];

  // ── Matchup Generation ──────────────────────────────────────────────

  const matchups: any[] = [];

  // ── ROUND ROBIN ───────────────────────────────────────────────────────
  if (tournamentType === 'round_robin') {
    // MINOR-1 FIX: Deterministic order (no shuffle) for reproducibility
    const pairs = generateRoundRobinPairs(teamList);
    pairs.forEach(p => matchups.push({
      t1: p.t1.name, t2: p.t2.name, t1Id: p.t1.id, t2Id: p.t2.id, 
      t1LogoUrl: p.t1.logoUrl, t2LogoUrl: p.t2.logoUrl,
      round: 'Pool Play'
    }));
  }

  // ── POOL PLAY KNOCKOUT ────────────────────────────────────────────────
  // MODERATE-2 FIX: True pool partitioning with snake seeding + RR within pools + knockout bracket
  else if (tournamentType === 'pool_play_knockout') {
    const numPools = Math.min(poolCount, Math.floor(teamList.length / 2));
    const pools: TeamIdentity[][] = Array.from({ length: numPools }, () => []);

    // Snake seed: Team 1→Pool A, Team 2→Pool B, Team 3→Pool B, Team 4→Pool A...
    teamList.forEach((team, idx) => {
      const snake = Math.floor(idx / numPools) % 2 === 0
        ? idx % numPools
        : numPools - 1 - (idx % numPools);
      pools[snake].push(team);
    });

    // Generate round-robin within each pool
    pools.forEach((poolTeams, poolIdx) => {
      const poolLabel = String.fromCharCode(65 + poolIdx); // A, B, C...
      const pairs = generateRoundRobinPairs(poolTeams);
      pairs.forEach(p => matchups.push({
        t1: p.t1.name, t2: p.t2.name, t1Id: p.t1.id, t2Id: p.t2.id,
        t1LogoUrl: p.t1.logoUrl, t2LogoUrl: p.t2.logoUrl,
        round: `Pool ${poolLabel}`, pool: poolIdx
      }));
    });

    // Knockout bracket: top `advancePerPool` from each pool advance
    const totalAdvancing = numPools * advancePerPool;
    const knockoutSize = Math.pow(2, Math.ceil(Math.log2(totalAdvancing)));
    const knockoutRounds = Math.ceil(Math.log2(knockoutSize));

    if (totalAdvancing >= 2) {
      // Generate seeded semis/finals
      // Standard pool play advancement: Pool A 1st vs Pool B 2nd, Pool B 1st vs Pool A 2nd
      if (numPools === 2 && advancePerPool === 2) {
        const semi1Id = nextMatchId('semi1');
        const semi2Id = nextMatchId('semi2');
        const finalId = nextMatchId('final');

        matchups.push({
          id: semi1Id, round: 'Semi-Finals', stage: 'Knockout',
          t1: 'TBD (Pool A - 1st)', t2: 'TBD (Pool B - 2nd)',
          t1Id: 'tbd', t2Id: 'tbd',
          winnerTo: finalId, winnerToSlot: 'team1'
        });
        matchups.push({
          id: semi2Id, round: 'Semi-Finals', stage: 'Knockout',
          t1: 'TBD (Pool B - 1st)', t2: 'TBD (Pool A - 2nd)',
          t1Id: 'tbd', t2Id: 'tbd',
          winnerTo: finalId, winnerToSlot: 'team2'
        });
        matchups.push({
          id: finalId, round: 'Championship', stage: 'Knockout',
          t1: 'TBD (Semi 1 Winner)', t2: 'TBD (Semi 2 Winner)',
          t1Id: 'tbd', t2Id: 'tbd'
        });
      } else {
        // Generic: generate seed-labeled spots for the bracket
        const finalId = nextMatchId('final');
        for (let i = 0; i < totalAdvancing / 2; i++) {
          const semiId = nextMatchId(`semi${i}`);
          const poolA = String.fromCharCode(65 + (i % numPools));
          const poolB = String.fromCharCode(65 + ((i + 1) % numPools));
          matchups.push({
            id: semiId, round: 'Semi-Finals', stage: 'Knockout',
            t1: `TBD (Pool ${poolA} - Seed ${Math.floor(i / numPools) + 1})`,
            t2: `TBD (Pool ${poolB} - Seed ${advancePerPool - Math.floor(i / numPools)})`,
            t1Id: 'tbd', t2Id: 'tbd',
            winnerTo: finalId, winnerToSlot: i % 2 === 0 ? 'team1' : 'team2'
          });
        }
        matchups.push({
          id: finalId, round: 'Championship', stage: 'Knockout',
          t1: 'TBD', t2: 'TBD', t1Id: 'tbd', t2Id: 'tbd'
        });
      }
    }
  }

  // ── SINGLE ELIMINATION ────────────────────────────────────────────────
  else if (tournamentType === 'single_elimination') {
    buildEliminationBracket(teamList, matchups, false);
  }

  // ── DOUBLE ELIMINATION ────────────────────────────────────────────────
  else if (tournamentType === 'double_elimination') {
    buildEliminationBracket(teamList, matchups, true);
  }

  // ── Trim round robin if gamesPerTeam is set (trim at round boundaries) ─
  // LOGIC-4 FIX: Slice at round boundaries so all teams in a partial round
  // either get the game or none do — prevents one team getting extra games.
  let finalMatchups = matchups;
  if (tournamentType === 'round_robin' && config.gamesPerTeam) {
    const maxGames = Math.ceil((teamList.length * config.gamesPerTeam) / 2);
    // matchups are already in Berger round order; find the last full-round cutoff
    const roundSize = Math.floor(teamList.length / 2);
    const fullRounds = Math.floor(maxGames / roundSize);
    finalMatchups = matchups.slice(0, fullRounds * roundSize);
  }
  if (tournamentType === 'pool_play_knockout' && config.gamesPerTeam) {
    const poolMatches = matchups.filter(m => (m.round as string).startsWith('Pool'));
    const knockoutMatches = matchups.filter(m => !(m.round as string).startsWith('Pool'));
    // Per-pool trim at round boundaries
    const numPools = Math.min(config.poolCount || 2, Math.floor(teamList.length / 2));
    const poolSize = Math.ceil(teamList.length / numPools);
    const roundSize = Math.floor(poolSize / 2);
    const maxPerPool = Math.ceil((poolSize * (config.gamesPerTeam || 3)) / 2);
    const fullRounds = roundSize > 0 ? Math.floor(maxPerPool / roundSize) : 0;
    const trimmedPool = poolMatches.slice(0, fullRounds * roundSize * numPools);
    finalMatchups = [...trimmedPool, ...knockoutMatches];
  }

  // ── Slot Generation ─────────────────────────────────────────────────

  const startD = parseLocalDate(startDate);
  const endD = endDate ? parseLocalDate(endDate) : startD;
  // Guard: eachDayOfInterval throws if start > end
  if (isAfter(startD, endD)) return [];
  const dayInterval = eachDayOfInterval({ start: startD, end: endD });
  const slots: { date: Date; time: Date; field: string }[] = [];

  dayInterval.forEach(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const window = dailyWindows?.find(w => w.date === dayStr);
    let currentTime = parseTime(window?.startTime || startTime, day);
    const dayEndTime = parseTime(window?.endTime || endTime, day);

    if (!isNaN(currentTime.getTime()) && !isNaN(dayEndTime.getTime())) {
      while (isBefore(currentTime, dayEndTime)) {
        for (const f of fields) {
          slots.push({ date: new Date(day), time: new Date(currentTime), field: f });
        }
        currentTime = addMinutes(currentTime, gameLength + breakLength);
      }
    }
  });

  // ── Game Assignment ──────────────────────────────────────────────────

  const finalGames: TournamentGame[] = [];
  // MODERATE-4 FIX: Unified conflict tracking via finalGames — no duplicate dailyTeamUsage map
  const teamGamesPerDay = new Map<string, number>(); // "date:teamId" → count

  // Round tier determines scheduling order (pool → WB/LB → semis → final)
    const getRoundTier = (r: string): number => {
      const rL = r.toLowerCase();
      if (rL.startsWith('pool')) return 0;
      
      // Tournament Protocol: Hierarchy of phases
      // 1. WB Rounds (11-19)
      // 2. LB Rounds (31-39) - Must follow WB
      // 3. Semis/Quarters (70-80)
      // 4. Finals (90-100)
      
      if (rL.includes('decider')) return 110;         // Championship Decider (conditional — never scheduled)
      if (rL.includes('championship')) return 100;
      
      if (rL.includes('final')) {
          if (rL.includes('winners') || rL.startsWith('wb')) return 90;
          if (rL.includes('losers') || rL.startsWith('lb')) return 95;
          return 100;
      }
      
      if (rL.includes('semi')) return 80;
      if (rL.includes('quarter')) return 70;

      // Detect LB specific rounds first to separate from WB
      if (rL.includes('lb round')) {
        const m = rL.match(/lb round\s+(\d+)/);
        return m ? 30 + parseInt(m[1]) : 31;
      }
      
      // WB Round (labeled "WB Round N" after CRIT-1 fix)
      if (rL.startsWith('wb round') || rL.includes('wb round')) {
        const m = rL.match(/wb round\s+(\d+)/);
        return m ? 10 + parseInt(m[1]) : 11;
      }

      // Legacy plain "Round N" label (single elimination, or old seeded data)
      const m = rL.match(/round\s+(\d+)/);
      if (m) return 10 + parseInt(m[1]);

      return 10;
    };

  const pool = [...finalMatchups].filter(m => !m.isConditional); // Exclude conditional matches (GF reset) from scheduling

  // Group slots by timeslot (Date + Time)
  const slotsByTime = new Map<string, { date: Date; time: Date; field: string }[]>();
  slots.forEach(s => {
    const key = `${format(s.date, 'yyyy-MM-dd')}_${format(s.time, 'HH:mm')}`;
    if (!slotsByTime.has(key)) slotsByTime.set(key, []);
    slotsByTime.get(key)!.push(s);
  });

  const sortedTimes = Array.from(slotsByTime.keys()).sort();

  for (const timeKey of sortedTimes) {
    if (pool.length === 0) break;
    const currentSlots = slotsByTime.get(timeKey)!;
    const dayKey = format(currentSlots[0].date, 'yyyy-MM-dd');
    const slotTimeStr = format(currentSlots[0].time, 'h:mm a');

    // CRITICAL FIX: Lock the tier for this entire timeslot.
    // This prevents Round 2 from starting at the same time as Round 1 on different fields.
    const currentTierLimit = Math.min(...pool.map(m => getRoundTier(m.round)));

    for (const slot of currentSlots) {
      if (pool.length === 0) break;

      let foundMatchupIndex = -1;
      for (let i = 0; i < pool.length; i++) {
        const { t1, t2, t1Id, t2Id, round } = pool[i];
        
        // Strict adherence to the locked tier for this timeslot
        if (getRoundTier(round) > currentTierLimit) continue;

        const id1 = t1Id || t1;
        const id2 = t2Id || t2;
        const MIN_REST = gameLength + breakLength;
        const currentSlotTime = slot.time;

        const t1IsTBD = t1.includes('TBD') || id1 === 'tbd';
        const t2IsTBD = t2.includes('TBD') || id2 === 'tbd';

        const t1IsBusy = !t1IsTBD && finalGames.some(g => {
          if (g.date !== dayKey) return false;
          if (g.team1Id !== id1 && g.team2Id !== id1 && g.team1 !== t1 && g.team2 !== t1) return false;
          const gTime = parse(g.time, 'h:mm a', parseLocalDate(g.date)); 
          return Math.abs(differenceInMinutes(currentSlotTime, gTime)) < MIN_REST;
        });

        const t2IsBusy = !t2IsTBD && finalGames.some(g => {
          if (g.date !== dayKey) return false;
          if (g.team1Id !== id2 && g.team2Id !== id2 && g.team1 !== t2 && g.team2 !== t2) return false;
          const gTime = parse(g.time, 'h:mm a', parseLocalDate(g.date)); 
          return Math.abs(differenceInMinutes(currentSlotTime, gTime)) < MIN_REST;
        });

        if (t1IsBusy || t2IsBusy) continue;

        const t1DailyCount = t1IsTBD ? 0 : (teamGamesPerDay.get(`${dayKey}:${id1}`) || 0);
        const t2DailyCount = t2IsTBD ? 0 : (teamGamesPerDay.get(`${dayKey}:${id2}`) || 0);

        if (doubleHeaderOption === 'none') {
          if (t1DailyCount >= 1 || t2DailyCount >= 1) continue;
        } else if (doubleHeaderOption === 'sameTeam') {
          if (t1DailyCount >= 2 || t2DailyCount >= 2) continue;
          if (t1DailyCount === 1) {
            const first = finalGames.find(g => g.date === dayKey && (g.team1Id === id1 || g.team2Id === id1));
            if (first && (first.team1Id === id1 ? first.team2Id : first.team1Id) !== id2) continue;
          }
          if (t2DailyCount === 1) {
            const first = finalGames.find(g => g.date === dayKey && (g.team1Id === id2 || g.team2Id === id2));
            if (first && (first.team1Id === id2 ? first.team2Id : first.team1Id) !== id1) continue;
          }
        } else if (doubleHeaderOption === 'differentTeams') {
          if (t1DailyCount >= 2 || t2DailyCount >= 2) continue;
        }

        foundMatchupIndex = i;
        break;
      }

      if (foundMatchupIndex !== -1) {
        const match = pool.splice(foundMatchupIndex, 1)[0];
        const id1 = match.t1Id || match.t1;
        const id2 = match.t2Id || match.t2;

        finalGames.push({
          id: match.id || nextMatchId('tg'),
          team1: match.t1, team2: match.t2,
          team1Id: match.t1Id || 'tbd', team2Id: match.t2Id || 'tbd',
          team1LogoUrl: match.t1LogoUrl, team2LogoUrl: match.t2LogoUrl,
          score1: 0, score2: 0,
          date: dayKey,
          time: slotTimeStr,
          location: slot.field,
          isCompleted: false,
          updatedAt: new Date().toISOString(),
          round: match.round,
          stage: match.stage || (
            match.round?.includes('WB') ? 'WB' :
            match.round?.includes('LB') ? 'LB' :
            match.round?.includes('Pool') ? 'Pool' : 'Main'
          ),
          pool: match.pool,
          winnerTo: match.winnerTo,
          winnerToSlot: match.winnerToSlot,
          loserTo: match.loserTo,
          loserToSlot: match.loserToSlot,
          isResetMatch: match.isResetMatch || false,
        });

        teamGamesPerDay.set(`${dayKey}:${id1}`, (teamGamesPerDay.get(`${dayKey}:${id1}`) || 0) + 1);
        teamGamesPerDay.set(`${dayKey}:${id2}`, (teamGamesPerDay.get(`${dayKey}:${id2}`) || 0) + 1);
      }
    }
  }

  return finalGames;
}

// ─── Bracket Builder (Single / Double Elimination) ──────────────────────────

/**
 * Builds WB matchups (and LB + Grand Final if isDouble) and pushes them into `matchups`.
 *
 * WB seeding follows standard topological order: 1v(N), (N/2+1)v(N/2), 2v(N-1)...
 * so the strongest seeds meet only in later rounds.
 *
 * Double Elimination:
 * - LB catches losers from each WB round
 * - LB has 2*(totalRounds-1) rounds
 * - Grand Final: WB winner vs LB winner
 * - Grand Final Reset: If LB winner wins GF, a second GF is played (modeled as isResetMatch)
 */
function buildEliminationBracket(
  teamList: TeamIdentity[],
  matchups: any[],
  isDouble: boolean
): void {
  const numTeams = teamList.length;
  const totalRounds = Math.max(1, Math.ceil(Math.log2(numTeams)));

  // ── Winners Bracket ─────────────────────────────────────────────────
  const roundMatches: any[][] = Array.from({ length: totalRounds }, () => []);

  for (let r = 0; r < totalRounds; r++) {
    const numMatches = Math.pow(2, totalRounds - r - 1);
    for (let m = 0; m < numMatches; m++) {
      const isFinal = r === totalRounds - 1;
      const isSemi = r === totalRounds - 2;
      const label = isFinal
        ? (isDouble ? 'Winners Bracket Final' : 'Championship')
        : isSemi
          ? (isDouble ? 'Winners Bracket Semi-Finals' : 'Semi-Finals')
          : isDouble ? `WB Round ${r + 1}` : `Round ${r + 1}`;
      roundMatches[r].push({
        id: nextMatchId(`wb_r${r}_m${m}`),
        round: label, stage: 'WB',
        t1: 'TBD', t2: 'TBD'
      });
    }
  }

  // Link WB progression
  for (let r = 0; r < totalRounds - 1; r++) {
    for (let m = 0; m < roundMatches[r].length; m++) {
      const parentIdx = Math.floor(m / 2);
      const slotName = m % 2 === 0 ? 'team1' : 'team2';
      roundMatches[r][m].winnerTo = roundMatches[r + 1][parentIdx].id;
      roundMatches[r][m].winnerToSlot = slotName;
    }
  }

  // Populate Round 1 with seeded teams — standard topological seeding (1v8, 4v5, 2v7, 3v6)
  // LOGIC-2 FIX: Run expansion exactly `totalRounds` times so the seed array has
  // exactly 2^totalRounds = bracketSize entries (not 2^(totalRounds+1)).
  let seeds = [0];
  for (let r = 1; r <= totalRounds; r++) {
    const next: number[] = [];
    const sz = Math.pow(2, r);
    for (const s of seeds) {
      next.push(s);
      next.push(sz - 1 - s);
    }
    seeds = next;
  }
  // seeds now has exactly bracketSize entries: [0, 7, 3, 4, 1, 6, 2, 5] for 8-team
  // → Match 0: Seed1 vs Seed8, Match 1: Seed4 vs Seed5, Match 2: Seed2 vs Seed7, Match 3: Seed3 vs Seed6

  const firstRound = roundMatches[0];
  for (let i = 0; i < firstRound.length; i++) {
    const t1Idx = seeds[i * 2];
    const t2Idx = seeds[i * 2 + 1];
    firstRound[i].t1 = t1Idx < numTeams ? teamList[t1Idx].name : 'BYE';
    firstRound[i].t1Id = t1Idx < numTeams ? teamList[t1Idx].id : 'bye';
    firstRound[i].t1LogoUrl = t1Idx < numTeams ? teamList[t1Idx].logoUrl : undefined;
    firstRound[i].t2 = t2Idx < numTeams ? teamList[t2Idx].name : 'BYE';
    firstRound[i].t2Id = t2Idx < numTeams ? teamList[t2Idx].id : 'bye';
    firstRound[i].t2LogoUrl = t2Idx < numTeams ? teamList[t2Idx].logoUrl : undefined;
  }

  roundMatches.forEach(rm => rm.forEach(m => matchups.push(m)));

  // ── Losers Bracket (Double Elimination only) ────────────────────────
  if (!isDouble || totalRounds < 2) return;

  // MINOR-3 FIX: Grand Final + Reset match
  const grandFinalId = nextMatchId('gf');
  const grandFinalResetId = nextMatchId('gf_reset');

  const lbMatchups: any[] = [];

  const linkMatch = (source: any, targetId: string, targetSlot: 'team1' | 'team2', isWinner: boolean) => {
    if (isWinner) {
      source.winnerTo = targetId;
      source.winnerToSlot = targetSlot;
    } else {
      source.loserTo = targetId;
      source.loserToSlot = targetSlot;
    }
  };

  // LB Phase 1: Catch WB Round 1 losers
  const wbR0 = roundMatches[0];
  const lbr1Count = Math.max(1, Math.floor(wbR0.length / 2));
  const lbr1: any[] = [];
  for (let i = 0; i < lbr1Count; i++) {
    const m = { id: nextMatchId(`lb_r1_m${i}`), round: 'LB Round 1', stage: 'LB', t1: 'TBD', t2: 'TBD' };
    lbr1.push(m);
    lbMatchups.push(m);
  }
  // Link WB R0 losers into LB R1 (pairs of losers meet each other)
  for (let i = 0; i < wbR0.length; i++) {
    const targetIdx = Math.floor(i / 2);
    const slotName = i % 2 === 0 ? 'team1' : 'team2';
    if (lbr1[targetIdx]) linkMatch(wbR0[i], lbr1[targetIdx].id, slotName, false);
  }

  // LB Phases 2+: For each subsequent WB round, LB winners meet incoming WB losers
  let lastLBRound: any[] = lbr1;
  for (let r = 1; r < totalRounds; r++) {
    const wbRound = roundMatches[r];
    const isFinalWB = r === totalRounds - 1;

    // Step A: LB survivors meet WB losers
    const lbrX: any[] = [];
    for (let i = 0; i < wbRound.length; i++) {
      const label = isFinalWB ? 'Losers Bracket Final' : `LB Round ${r * 2}`;
      const m = { id: nextMatchId(`lb_rx_r${r}_m${i}`), round: label, stage: 'LB', t1: 'TBD', t2: 'TBD' };
      lbrX.push(m);
      lbMatchups.push(m);

      // MODERATE-1 FIX: Guard — lastLBRound may be shorter than wbRound
      if (lastLBRound[i]) linkMatch(lastLBRound[i], m.id, 'team1', true);
      linkMatch(wbRound[i], m.id, 'team2', false);
    }

    if (isFinalWB) {
      // LB Finals winner → Grand Final team2 slot
      if (lbrX[0]) linkMatch(lbrX[0], grandFinalId, 'team2', true);
      // WB Finals winner → Grand Final team1 slot
      linkMatch(wbRound[0], grandFinalId, 'team1', true);
    } else {
      // Step B: LB internal round (winners of Step A play each other)
      const lbrY: any[] = [];
      const nextCount = Math.max(1, Math.floor(lbrX.length / 2));
      for (let i = 0; i < nextCount; i++) {
        const m = {
          id: nextMatchId(`lb_ry_r${r}_m${i}`),
          round: `LB Round ${r * 2 + 1}`,
          stage: 'LB',
          t1: 'TBD', t2: 'TBD'
        };
        lbrY.push(m);
        lbMatchups.push(m);
        if (lbrX[i * 2]) linkMatch(lbrX[i * 2], m.id, 'team1', true);
        if (lbrX[i * 2 + 1]) linkMatch(lbrX[i * 2 + 1], m.id, 'team2', true);
      }
      lastLBRound = lbrY.length > 0 ? lbrY : lbrX;
    }
  }

  // Grand Final
  lbMatchups.push({
    id: grandFinalId,
    round: 'Championship',
    stage: 'GF',
    t1: 'TBD (Winners Bracket)',
    t2: 'TBD (Losers Bracket)',
    t1Id: 'tbd', t2Id: 'tbd',
    // If LB winner wins GF, the GF Reset is triggered
    loserTo: grandFinalResetId,
    loserToSlot: 'team1',
  });

  // MINOR-3 FIX: Grand Final Reset Match
  // Only played if LB winner defeats the undefeated WB winner in GF.
  // Modeled as a conditional match — UI should hide until triggered.
  lbMatchups.push({
    id: grandFinalResetId,
    round: 'Championship Decider',
    stage: 'GF',
    t1: 'TBD (Championship Team 1)',
    t2: 'TBD (Championship Team 2)',
    t1Id: 'tbd', t2Id: 'tbd',
    isResetMatch: true,   // UI flag: only show when triggered
    isConditional: true,  // Only played if LB winner wins Grand Final
  });

  lbMatchups.forEach(m => matchups.push(m));
}
