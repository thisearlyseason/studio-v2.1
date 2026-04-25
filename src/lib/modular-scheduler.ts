import { addMinutes, format, isAfter, isBefore, parse, differenceInMinutes, addDays } from 'date-fns';

export type TournamentFormat = 'round_robin' | 'single_elimination' | 'double_elimination' | 'pool_play_knockout' | 'league';

export interface Team { id: string; name: string; }
export interface VenueSlot { date: string; startTime: string; endTime: string; }
export interface Venue { id: string; name: string; availableSlots?: VenueSlot[]; }

export interface EngineConfig {
  format: TournamentFormat;
  gameDurationMinutes: number;
  restBreakMinutes: number;
  maxGamesPerDayPerTeam: number;
  startDate: string;
  endDate?: string;
  globalStartTime?: string;
  globalEndTime?: string;
  playDays?: number[];
  /** CRIT-6 FIX: configurable pool count (was hardcoded 2) */
  poolCount?: number;
  /** Teams advancing per pool to knockout (default 2) */
  advancePerPool?: number;
}

export interface SchedulerInput { teams: Team[]; venues: Venue[]; config: EngineConfig; }

export interface MatchNode {
  id: string;
  team1Id: string | null;
  team2Id: string | null;
  team1Placeholder?: string;
  team2Placeholder?: string;
  round: string;
  stage: string;
  winnerToNodeId?: string;
  winnerToSlot?: 'team1' | 'team2';
  loserToNodeId?: string;
  loserToSlot?: 'team1' | 'team2';
  date?: string;
  time?: string;
  venueId?: string;
  isCompleted: boolean;
  poolId?: string;
  isConditional?: boolean;
}

export interface StructureDefinition {
  format: TournamentFormat;
  groups?: Record<string, Team[]>;
  rounds?: string[];
}

export interface StandingsTemplate {
  pools?: Record<string, { teamId: string; wins: number; losses: number; points: number }[]>;
  league?: { teamId: string; wins: number; losses: number; points: number }[];
}

export interface ValidationReport {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  metrics: { missingMatches: number; teamConflicts: number; venueConflicts: number; };
}

export interface SchedulerOutput {
  schedule: MatchNode[];
  structure: StructureDefinition;
  standingsTemplate: StandingsTemplate;
  validationReport: ValidationReport;
}

// ─── CRIT-4 FIX: Monotonic ID counter (replaces Date.now() collision-prone IDs) ───
let _idCounter = 0;
const nextId = (prefix: string) => `${prefix}_${++_idCounter}_${Math.random().toString(36).slice(2, 6)}`;

// ─── CRIT-5 FIX: parseLocalDate replaces parseISO to avoid UTC-offset day shift ───
function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  const clean = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [y, m, d] = clean.split('-').map(Number);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return new Date();
  return new Date(y, m - 1, d);
}

export class ModularSchedulingEngine {
  private input: SchedulerInput;
  private matches: MatchNode[] = [];
  private structure: StructureDefinition = { format: 'round_robin' };

  constructor(input: SchedulerInput) { this.input = input; }

  public runPipeline(): SchedulerOutput {
    this.phase1_MatchGeneration();
    this.phase2_StructureDefinition();
    this.phase3_and_4_TimeAndVenueScheduling();
    let report = this.phase5_ValidationEngine(this.matches);
    // CRIT-3 FIX: phase6 is now an honest repair that actually attempts slot reassignment.
    // If it cannot fix everything, it reports remaining issues honestly rather than returning null.
    if (!report.isValid) {
      this.phase6_RepairSystem();
      report = this.phase5_ValidationEngine(this.matches);
    }
    return { schedule: this.matches, structure: this.structure, standingsTemplate: this.generateStandingsTemplate(), validationReport: report };
  }

  // ---------------------------------------------------------------------------
  // PHASE 1: Match Generation
  // ---------------------------------------------------------------------------
  private phase1_MatchGeneration() {
    this.matches = [];
    const { teams, config } = this.input;

    if (config.format === 'round_robin' || config.format === 'league') {
      this.generateRoundRobin(teams, 'Regular Season');
    } else if (config.format === 'single_elimination') {
      this.generateSingleElimination(teams, 'Main Bracket');
    } else if (config.format === 'double_elimination') {
      // CRIT-2 FIX: Real DE bracket with full LB wiring (replaces stub)
      this.generateDoubleElimination(teams);
    } else if (config.format === 'pool_play_knockout') {
      // CRIT-6 FIX: Configurable pool count (was hardcoded 2)
      const numPools = Math.max(2, Math.min(config.poolCount || 2, Math.floor(teams.length / 2)));
      const advancePerPool = config.advancePerPool || 2;
      const pools: Team[][] = Array.from({ length: numPools }, () => []);
      // Snake seed distribution
      teams.forEach((t, i) => {
        const row = Math.floor(i / numPools);
        const col = row % 2 === 0 ? i % numPools : numPools - 1 - (i % numPools);
        pools[col].push(t);
      });
      pools.forEach((pool, pi) => {
        const label = String.fromCharCode(65 + pi);
        this.generateRoundRobin(pool, 'Pool Play', `Pool ${label}`);
      });
      // Knockout bracket with correctly labeled TBD seeds
      const advancing = numPools * advancePerPool;
      const koTeams: Team[] = [];
      for (let i = 0; i < advancing; i++) {
        const poolLabel = String.fromCharCode(65 + (i % numPools));
        const seed = Math.floor(i / numPools) + 1;
        koTeams.push({ id: 'TBD', name: `Pool ${poolLabel} - Seed ${seed}` });
      }
      this.generateSingleElimination(koTeams, 'Knockout');
    }
  }

  private generateRoundRobin(teams: Team[], stage: string, poolId?: string) {
    // Berger round-robin: pin first, rotate rest
    const list = teams.length % 2 === 0 ? [...teams] : [...teams, { id: 'bye', name: 'BYE' }];
    const len = list.length;
    for (let round = 0; round < len - 1; round++) {
      for (let i = 0; i < len / 2; i++) {
        const t1 = list[i], t2 = list[len - 1 - i];
        if (t1.id === 'bye' || t2.id === 'bye') continue;
        this.matches.push({
          // CRIT-4 FIX: monotonic ID
          id: nextId('rr'),
          team1Id: t1.id !== 'TBD' ? t1.id : null,
          team2Id: t2.id !== 'TBD' ? t2.id : null,
          team1Placeholder: t1.id === 'TBD' ? t1.name : undefined,
          team2Placeholder: t2.id === 'TBD' ? t2.name : undefined,
          round: 'Round Robin', stage, poolId, isCompleted: false
        });
      }
      const last = list.pop()!;
      list.splice(1, 0, last);
    }
  }

  private generateSingleElimination(teams: Team[], stage: string): MatchNode[] {
    const n = teams.length;
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
    const totalRounds = Math.log2(bracketSize);
    const roundNodes: MatchNode[][] = Array.from({ length: totalRounds }, () => []);

    // Build nodes for each round
    for (let r = 0; r < totalRounds; r++) {
      const count = bracketSize / Math.pow(2, r + 1);
      const isFinal = r === totalRounds - 1;
      const isSemi = r === totalRounds - 2;
      const label = isFinal ? (stage === 'Knockout' ? 'Championship' : 'Championship')
        : isSemi ? 'Semi-Finals'
        : `Round ${r + 1}`;
      for (let i = 0; i < count; i++) {
        const node: MatchNode = {
          id: nextId(`se_r${r}_m${i}`),
          team1Id: null, team2Id: null,
          round: label, stage, isCompleted: false
        };
        roundNodes[r].push(node);
        this.matches.push(node);
      }
    }

    // Link progression
    for (let r = 0; r < totalRounds - 1; r++) {
      for (let i = 0; i < roundNodes[r].length; i++) {
        const parent = roundNodes[r + 1][Math.floor(i / 2)];
        roundNodes[r][i].winnerToNodeId = parent.id;
        roundNodes[r][i].winnerToSlot = i % 2 === 0 ? 'team1' : 'team2';
      }
    }

    // Seed Round 1 with standard topological seeding (1v8, 4v5, 2v7, 3v6)
    let seeds = [0];
    for (let r = 1; r <= totalRounds; r++) {
      const next: number[] = [];
      const sz = Math.pow(2, r);
      for (const s of seeds) { next.push(s); next.push(sz - 1 - s); }
      seeds = next;
    }
    const r0 = roundNodes[0];
    for (let i = 0; i < r0.length; i++) {
      const t1i = seeds[i * 2], t2i = seeds[i * 2 + 1];
      r0[i].team1Id = t1i < n && teams[t1i].id !== 'TBD' ? teams[t1i].id : null;
      r0[i].team2Id = t2i < n && teams[t2i].id !== 'TBD' ? teams[t2i].id : null;
      r0[i].team1Placeholder = t1i >= n ? 'BYE' : (teams[t1i].id === 'TBD' ? teams[t1i].name : undefined);
      r0[i].team2Placeholder = t2i >= n ? 'BYE' : (teams[t2i].id === 'TBD' ? teams[t2i].name : undefined);
    }

    return roundNodes.flat();
  }

  // CRIT-2 FIX: Full double elimination with proper LB wiring
  private generateDoubleElimination(teams: Team[]) {
    const n = teams.length;
    if (n < 2) return;
    const bracketSize = Math.pow(2, Math.ceil(Math.log2(Math.max(n, 2))));
    const totalRounds = Math.log2(bracketSize);

    // Build WB
    const wbRounds: MatchNode[][] = Array.from({ length: totalRounds }, () => []);
    for (let r = 0; r < totalRounds; r++) {
      const count = bracketSize / Math.pow(2, r + 1);
      const isFinal = r === totalRounds - 1;
      const isSemi = r === totalRounds - 2;
      const label = isFinal ? 'Winners Bracket Final'
        : isSemi ? 'Winners Bracket Semi-Finals'
        : `WB Round ${r + 1}`;
      for (let i = 0; i < count; i++) {
        const node: MatchNode = { id: nextId(`wb_r${r}_m${i}`), team1Id: null, team2Id: null, round: label, stage: 'WB', isCompleted: false };
        wbRounds[r].push(node);
        this.matches.push(node);
      }
    }
    // Link WB progression
    for (let r = 0; r < totalRounds - 1; r++) {
      for (let i = 0; i < wbRounds[r].length; i++) {
        const parent = wbRounds[r + 1][Math.floor(i / 2)];
        wbRounds[r][i].winnerToNodeId = parent.id;
        wbRounds[r][i].winnerToSlot = i % 2 === 0 ? 'team1' : 'team2';
      }
    }
    // Seed WB Round 1
    let seeds = [0];
    for (let r = 1; r <= totalRounds; r++) {
      const next: number[] = [];
      const sz = Math.pow(2, r);
      for (const s of seeds) { next.push(s); next.push(sz - 1 - s); }
      seeds = next;
    }
    const wb0 = wbRounds[0];
    for (let i = 0; i < wb0.length; i++) {
      const t1i = seeds[i * 2], t2i = seeds[i * 2 + 1];
      wb0[i].team1Id = t1i < n ? teams[t1i].id : null;
      wb0[i].team2Id = t2i < n ? teams[t2i].id : null;
      wb0[i].team1Placeholder = t1i >= n ? 'BYE' : undefined;
      wb0[i].team2Placeholder = t2i >= n ? 'BYE' : undefined;
    }

    if (totalRounds < 2) return; // 2-team: DE reduces to SE

    // Grand Final IDs
    const gfId = nextId('gf');
    const gfResetId = nextId('gf_reset');

    // Build LB
    let lastLB: MatchNode[] = [];

    // LB Phase 1: WB R0 losers vs each other
    const lb1Count = Math.max(1, Math.floor(wbRounds[0].length / 2));
    const lb1: MatchNode[] = [];
    for (let i = 0; i < lb1Count; i++) {
      const m: MatchNode = { id: nextId(`lb_r1_m${i}`), team1Id: null, team2Id: null, round: 'LB Round 1', stage: 'LB', isCompleted: false };
      lb1.push(m); this.matches.push(m);
    }
    for (let i = 0; i < wbRounds[0].length; i++) {
      const ti = Math.floor(i / 2);
      if (lb1[ti]) { wbRounds[0][i].loserToNodeId = lb1[ti].id; wbRounds[0][i].loserToSlot = i % 2 === 0 ? 'team1' : 'team2'; }
    }
    lastLB = lb1;

    // LB Phases 2+
    for (let r = 1; r < totalRounds; r++) {
      const wbR = wbRounds[r];
      const isFinalWB = r === totalRounds - 1;
      const lbMajor: MatchNode[] = [];
      for (let i = 0; i < wbR.length; i++) {
        const label = isFinalWB ? 'Losers Bracket Final' : `LB Round ${r * 2}`;
        const m: MatchNode = { id: nextId(`lb_maj_r${r}_m${i}`), team1Id: null, team2Id: null, round: label, stage: 'LB', isCompleted: false };
        lbMajor.push(m); this.matches.push(m);
        if (lastLB[i]) { lastLB[i].winnerToNodeId = m.id; lastLB[i].winnerToSlot = 'team1'; }
        wbR[i].loserToNodeId = m.id; wbR[i].loserToSlot = 'team2';
      }
      if (isFinalWB) {
        if (lbMajor[0]) { lbMajor[0].winnerToNodeId = gfId; lbMajor[0].winnerToSlot = 'team2'; }
        wbRounds[totalRounds - 1][0].winnerToNodeId = gfId; wbRounds[totalRounds - 1][0].winnerToSlot = 'team1';
        lastLB = lbMajor;
      } else {
        const lbMinor: MatchNode[] = [];
        const minorCount = Math.max(1, Math.floor(lbMajor.length / 2));
        for (let i = 0; i < minorCount; i++) {
          const m: MatchNode = { id: nextId(`lb_min_r${r}_m${i}`), team1Id: null, team2Id: null, round: `LB Round ${r * 2 + 1}`, stage: 'LB', isCompleted: false };
          lbMinor.push(m); this.matches.push(m);
          if (lbMajor[i * 2]) { lbMajor[i * 2].winnerToNodeId = m.id; lbMajor[i * 2].winnerToSlot = 'team1'; }
          if (lbMajor[i * 2 + 1]) { lbMajor[i * 2 + 1].winnerToNodeId = m.id; lbMajor[i * 2 + 1].winnerToSlot = 'team2'; }
        }
        lastLB = lbMinor.length > 0 ? lbMinor : lbMajor;
      }
    }

    // Grand Final
    const gf: MatchNode = { id: gfId, team1Id: null, team2Id: null, team1Placeholder: 'TBD (Winners Bracket)', team2Placeholder: 'TBD (Losers Bracket)', round: 'Championship', stage: 'GF', isCompleted: false, loserToNodeId: gfResetId, loserToSlot: 'team1' };
    this.matches.push(gf);

    // GF Reset (conditional)
    const gfReset: MatchNode = { id: gfResetId, team1Id: null, team2Id: null, team1Placeholder: 'TBD', team2Placeholder: 'TBD', round: 'Championship Decider', stage: 'GF', isCompleted: false, isConditional: true };
    this.matches.push(gfReset);
  }

  // ---------------------------------------------------------------------------
  // PHASE 2: Structure Definition
  // ---------------------------------------------------------------------------
  private phase2_StructureDefinition() {
    this.structure = {
      format: this.input.config.format,
      rounds: [...new Set(this.matches.map(m => m.round))],
    };
    if (this.input.config.format === 'pool_play_knockout') {
      const numPools = Math.max(2, Math.min(this.input.config.poolCount || 2, Math.floor(this.input.teams.length / 2)));
      const pools: Record<string, Team[]> = {};
      this.input.teams.forEach((t, i) => {
        const row = Math.floor(i / numPools);
        const col = row % 2 === 0 ? i % numPools : numPools - 1 - (i % numPools);
        const label = `Pool ${String.fromCharCode(65 + col)}`;
        if (!pools[label]) pools[label] = [];
        pools[label].push(t);
      });
      this.structure.groups = pools;
    }
  }

  // ---------------------------------------------------------------------------
  // PHASE 3 & 4: Time & Venue Scheduling
  // ---------------------------------------------------------------------------
  private phase3_and_4_TimeAndVenueScheduling() {
    const timeSlots = this.generateAvailableTimeSlots();
    const teamGamesPerDay = new Map<string, number>();
    const venueTimeUsed = new Set<string>();
    let slotIdx = 0;

    for (const match of this.matches) {
      if (match.isConditional) continue; // Never pre-schedule conditional matches
      let assigned = false;
      for (let attempts = 0; attempts < timeSlots.length && !assigned; attempts++) {
        if (slotIdx >= timeSlots.length) slotIdx = 0;
        const slot = timeSlots[slotIdx++];
        const vtKey = `${slot.date}_${slot.startTime}_${slot.venueId}`;
        if (venueTimeUsed.has(vtKey)) continue;
        const t1 = match.team1Id, t2 = match.team2Id;
        if ((t1 && this.isTeamBusy(t1, slot.date, slot.startTime, teamGamesPerDay)) ||
            (t2 && this.isTeamBusy(t2, slot.date, slot.startTime, teamGamesPerDay))) continue;
        match.date = slot.date; match.time = slot.startTime; match.venueId = slot.venueId;
        venueTimeUsed.add(vtKey);
        if (t1) teamGamesPerDay.set(`${slot.date}_${t1}`, (teamGamesPerDay.get(`${slot.date}_${t1}`) || 0) + 1);
        if (t2) teamGamesPerDay.set(`${slot.date}_${t2}`, (teamGamesPerDay.get(`${slot.date}_${t2}`) || 0) + 1);
        assigned = true;
      }
    }
  }

  private generateAvailableTimeSlots(): { date: string; startTime: string; venueId: string }[] {
    const slots: { date: string; startTime: string; venueId: string }[] = [];
    const config = this.input.config;
    // CRIT-5 FIX: use parseLocalDate instead of parseISO
    let currentD = parseLocalDate(config.startDate);
    const endD = config.endDate ? parseLocalDate(config.endDate) : addDays(currentD, 30);
    const venues = this.input.venues;
    if (!venues?.length) return slots;
    while (isBefore(currentD, addDays(endD, 1))) {
      const dStr = format(currentD, 'yyyy-MM-dd');
      const isPlayDay = !config.playDays || config.playDays.includes(currentD.getDay());
      if (isPlayDay) {
        for (const venue of venues) {
          if (venue.availableSlots?.length) {
            venue.availableSlots.filter(vs => vs.date === dStr).forEach(ds =>
              this.fillSlots(dStr, venue.id, ds.startTime, ds.endTime, config.gameDurationMinutes + config.restBreakMinutes, slots)
            );
          } else if (config.globalStartTime && config.globalEndTime) {
            this.fillSlots(dStr, venue.id, config.globalStartTime, config.globalEndTime, config.gameDurationMinutes + config.restBreakMinutes, slots);
          }
        }
      }
      currentD = addDays(currentD, 1);
    }
    return slots;
  }

  private fillSlots(date: string, venueId: string, st: string, et: string, interval: number, out: any[]) {
    try {
      let cur = parse(st, 'HH:mm', new Date());
      const end = parse(et, 'HH:mm', new Date());
      while (isBefore(cur, end)) {
        out.push({ date, startTime: format(cur, 'HH:mm'), venueId });
        cur = addMinutes(cur, interval);
      }
    } catch { /* ignore malformed time */ }
  }

  private isTeamBusy(teamId: string, date: string, time: string, teamGamesPerDay: Map<string, number>): boolean {
    if ((teamGamesPerDay.get(`${date}_${teamId}`) || 0) >= this.input.config.maxGamesPerDayPerTeam) return true;
    for (const m of this.matches) {
      if (m.date === date && (m.team1Id === teamId || m.team2Id === teamId) && m.time) {
        const diff = Math.abs(differenceInMinutes(parse(m.time, 'HH:mm', new Date()), parse(time, 'HH:mm', new Date())));
        if (diff < this.input.config.gameDurationMinutes + this.input.config.restBreakMinutes) return true;
      }
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // PHASE 5: Validation
  // ---------------------------------------------------------------------------
  private phase5_ValidationEngine(schedule: MatchNode[]): ValidationReport {
    const errors: string[] = [], warnings: string[] = [];
    let missingMatches = 0, teamConflicts = 0, venueConflicts = 0;
    const venueMap = new Map<string, boolean>();
    const teamDaily = new Map<string, number>();
    for (const m of schedule) {
      if (m.isConditional) continue;
      if (!m.date || !m.time || !m.venueId) { errors.push(`Match ${m.id} unscheduled.`); missingMatches++; continue; }
      const vk = `${m.date}_${m.time}_${m.venueId}`;
      if (venueMap.has(vk)) { errors.push(`Venue conflict: ${m.venueId} double-booked ${m.date} ${m.time}`); venueConflicts++; }
      else venueMap.set(vk, true);
      [m.team1Id, m.team2Id].forEach(tid => {
        if (!tid) return;
        const k = `${m.date}_${tid}`; teamDaily.set(k, (teamDaily.get(k) || 0) + 1);
      });
    }
    teamDaily.forEach((count, key) => {
      if (count > this.input.config.maxGamesPerDayPerTeam) { errors.push(`Team overloaded: ${key} has ${count} games`); teamConflicts++; }
    });
    if (schedule.filter(m => !m.isConditional).length === 0) errors.push('Empty schedule generated.');
    return { isValid: errors.length === 0, errors, warnings, metrics: { missingMatches, teamConflicts, venueConflicts } };
  }

  // ---------------------------------------------------------------------------
  // PHASE 6: CRIT-3 FIX — Honest repair (no longer a no-op)
  // Attempts to assign unscheduled matches to any remaining free slot.
  // Reports what it could not fix rather than silently returning null.
  // ---------------------------------------------------------------------------
  private phase6_RepairSystem() {
    const timeSlots = this.generateAvailableTimeSlots();
    const venueUsed = new Set(
      this.matches.filter(m => m.date && m.time && m.venueId).map(m => `${m.date}_${m.time}_${m.venueId}`)
    );
    const unscheduled = this.matches.filter(m => !m.isConditional && (!m.date || !m.time || !m.venueId));
    for (const match of unscheduled) {
      for (const slot of timeSlots) {
        const vtKey = `${slot.date}_${slot.startTime}_${slot.venueId}`;
        if (venueUsed.has(vtKey)) continue;
        match.date = slot.date; match.time = slot.startTime; match.venueId = slot.venueId;
        venueUsed.add(vtKey);
        break;
      }
      // If still unscheduled after repair pass, it will surface in Phase 5 re-validation as an error
    }
  }

  private generateStandingsTemplate(): StandingsTemplate {
    if (this.input.config.format === 'pool_play_knockout' && this.structure.groups) {
      const template: StandingsTemplate = { pools: {} };
      for (const p of Object.keys(this.structure.groups)) {
        template.pools![p] = this.structure.groups[p].map(t => ({ teamId: t.id, wins: 0, losses: 0, points: 0 }));
      }
      return template;
    }
    return { league: this.input.teams.map(t => ({ teamId: t.id, wins: 0, losses: 0, points: 0 })) };
  }
}
