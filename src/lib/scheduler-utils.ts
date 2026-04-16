
/**
 * @fileOverview Core logic for the Elite Scheduling Engine.
 * Hardened for balanced distribution, multi-venue resource mapping, and intelligent double-headers.
 */

import { addMinutes, format, isBefore, parse, addDays, eachDayOfInterval, isAfter, differenceInMinutes, parseISO } from 'date-fns';
import { TournamentGame } from '@/components/providers/team-provider';

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
}

/**
 * Robust time parser handling 12h and 24h formats with regex fallbacks.
 */
function parseTime(timeStr: string, referenceDate: Date): Date {
  if (!timeStr) return new Date(NaN);
  
  const formats = ['HH:mm', 'h:mm a', 'h:mm A', 'HH:mm:ss'];
  for (const f of formats) {
    const d = parse(timeStr, f, referenceDate);
    if (!isNaN(d.getTime())) return d;
  }
  
  // Robust regex fallback for non-standard inputs like "8:00pm" or "08:00"
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
 * Robust date parser that avoids UTC offset issues by treating "YYYY-MM-DD" as local time.
 */
function parseLocalDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  // Handle full ISO strings by taking only the date part
  const cleanDate = dateStr.includes('T') ? dateStr.split('T')[0] : dateStr;
  const [year, month, day] = cleanDate.split('-').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return new Date();
  return new Date(year, month - 1, day);
}

/**
 * Shuffles an array in place.
 */
function shuffle<T>(array: T[]): T[] {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
}

/**
 * Generates a full League Season schedule.
 */
export function generateLeagueSchedule(config: ScheduleConfig): TournamentGame[] {
  const {
    teams, fields, startDate, endDate, startTime, endTime,
    gameLength, breakLength, playDays = [1, 2, 3, 4, 5, 6, 0],
    gamesPerTeam = 10, doubleHeaderOption = 'none', blackoutDates = [],
    blackoutDaysOfWeek = []
  } = config;

  const teamIdentities = teams.map((t, idx) => typeof t === 'string' ? { id: `t_${idx}`, name: t } : t);
  if (teamIdentities.length < 2 || fields.length === 0) return [];

  const startD = parseLocalDate(startDate);
  const endD = endDate ? parseLocalDate(endDate) : addDays(startD, 120);

  const basePairs: { t1: TeamIdentity; t2: TeamIdentity }[] = [];
  for (let i = 0; i < teamIdentities.length; i++) {
    for (let j = i + 1; j < teamIdentities.length; j++) {
      basePairs.push({ t1: teamIdentities[i], t2: teamIdentities[j] });
    }
  }

  let matchPool: { t1: TeamIdentity; t2: TeamIdentity }[] = [];
  const requiredGames = Math.ceil((teamIdentities.length * gamesPerTeam) / 2);

  while (matchPool.length < requiredGames) {
    const roundPairs = shuffle([...basePairs]);
    for (const pair of roundPairs) {
      matchPool.push(pair);
      if (matchPool.length >= requiredGames) break;
    }
  }
  shuffle(matchPool);

  const availableSlots: { date: Date; time: Date; field: string }[] = [];
  let currentDay = new Date(startD);

  while (!isAfter(currentDay, endD)) {
    const dayKey = format(currentDay, 'yyyy-MM-dd');
    const isBlackout = blackoutDates.some(d => format(new Date(d), 'yyyy-MM-dd') === dayKey);
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

  const finalGames: TournamentGame[] = [];
  const teamGameCounts = new Map<string, number>(teamIdentities.map(t => [t.id, 0]));
  const dailyTeamUsage = new Map<string, { teamId: string; time: string; field: string }[]>();

  for (const slot of availableSlots) {
    if (matchPool.length === 0) break;

    const dayKey = format(slot.date, 'yyyy-MM-dd');
    const timeKey = format(slot.time, 'HH:mm');
    if (!dailyTeamUsage.has(dayKey)) dailyTeamUsage.set(dayKey, []);
    const todaysGames = dailyTeamUsage.get(dayKey)!;

    let foundMatchupIndex = -1;
    for (let i = 0; i < matchPool.length; i++) {
      const { t1, t2 } = matchPool[i];

      const isT1Busy = todaysGames.some(g => (g.teamId === t1.id || g.name === t1.name) && g.time === timeKey);
      const isT2Busy = todaysGames.some(g => (g.teamId === t2.id || g.name === t2.name) && g.time === timeKey);
      if (isT1Busy || isT2Busy) continue;

      if ((teamGameCounts.get(t1.id) || 0) >= gamesPerTeam || (teamGameCounts.get(t2.id) || 0) >= gamesPerTeam) continue;

      foundMatchupIndex = i;
      break;
    }

    if (foundMatchupIndex !== -1) {
      const { t1, t2 } = matchPool.splice(foundMatchupIndex, 1)[0];
      finalGames.push({
        id: `lg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
        team1: t1.name, team2: t2.name, team1Id: t1.id, team2Id: t2.id,
        score1: 0, score2: 0,
        date: format(slot.date, 'yyyy-MM-dd'),
        time: format(slot.time, 'h:mm a'),
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

/**
 * Tournament specific schedule supporting Round Robin, Single Elim, and Double Elim
 */
export function generateTournamentSchedule(config: ScheduleConfig): TournamentGame[] {
  const { teams, fields, startDate, endDate, startTime, endTime, gameLength, breakLength, dailyWindows, tournamentType = 'round_robin' } = config;
  
  const teamList = teams.map((t, i) => typeof t === 'string' ? { id: `t_${i}`, name: t } : t);
  if (teamList.length < 2) return [];

  const matchups: { t1: string; t2: string; t1Id?: string; t2Id?: string; round: string }[] = [];
  
  if (tournamentType === 'round_robin' || tournamentType === 'pool_play_knockout') {
    const shuffled = shuffle([...teamList]);
    for (let i = 0; i < shuffled.length; i++) {
      for (let j = i + 1; j < shuffled.length; j++) {
        matchups.push({ t1: shuffled[i].name, t2: shuffled[j].name, t1Id: shuffled[i].id, t2Id: shuffled[j].id, round: 'Pool Play' });
      }
    }
  } else if (tournamentType === 'single_elimination' || tournamentType === 'double_elimination') {
    const isDouble = tournamentType === 'double_elimination';
    // Instead of shuffling, maintain the competitive ranking index from the submitted setup
    const seededTeams = [...teamList]; 
    const numTeams = seededTeams.length;
    const totalRounds = Math.max(1, Math.ceil(Math.log2(numTeams)));
    const bracketSize = Math.pow(2, totalRounds);

    const roundMatches: any[][] = Array.from({length: totalRounds}, () => []);
    
    // 1. Generate Winners Bracket Topology (Shared by both Single & Double)
    for (let r = 0; r < totalRounds; r++) {
       const numMatches = Math.pow(2, totalRounds - r - 1);
       for (let m = 0; m < numMatches; m++) {
          const isFinal = r === totalRounds - 1;
          const isSemi = r === totalRounds - 2;
          const label = isFinal ? (isDouble ? 'WB Finals' : 'Championship') : isSemi ? (isDouble ? 'WB Semi-Finals' : 'Semi-Finals') : `Round ${r + 1}`;
          const id = `wb_${Date.now()}_${r}_${m}`;
          roundMatches[r].push({ id, round: label, t1: 'TBD', t2: 'TBD' });
       }
    }

    // 2. Link Winners Bracket
    for (let r = 0; r < totalRounds - 1; r++) {
       for (let m = 0; m < roundMatches[r].length; m++) {
           const parentMatchIndex = Math.floor(m / 2);
           const slot = m % 2 === 0 ? 'team1' : 'team2';
           roundMatches[r][m].winnerTo = roundMatches[r+1][parentMatchIndex].id;
           roundMatches[r][m].winnerToSlot = slot;
       }
    }

    // 3. Populate Round 1 Teams using Topological Seeding Math (1v8, 4v5, 2v7, 3v6)
    let seeds = [0];
    for (let r = 1; r < totalRounds; r++) {
       const nextSeeds = [];
       const sz = Math.pow(2, r);
       for (const s of seeds) {
          nextSeeds.push(s);
          nextSeeds.push(sz - 1 - s);
       }
       seeds = nextSeeds;
    }

    const firstRound = roundMatches[0];
    for (let i = 0; i < firstRound.length; i++) {
        const t1Idx = seeds[i * 2];
        const t2Idx = seeds[i * 2 + 1];

        firstRound[i].t1 = t1Idx !== undefined && t1Idx < numTeams ? seededTeams[t1Idx].name : 'BYE';
        firstRound[i].t1Id = t1Idx !== undefined && t1Idx < numTeams ? seededTeams[t1Idx].id : 'bye';
        
        firstRound[i].t2 = t2Idx !== undefined && t2Idx < numTeams ? seededTeams[t2Idx].name : 'BYE';
        firstRound[i].t2Id = t2Idx !== undefined && t2Idx < numTeams ? seededTeams[t2Idx].id : 'bye';
    }

    roundMatches.forEach(rm => rm.forEach(m => matchups.push(m)));

    // 4. Generate Losers Bracket Topology IF Double Elimination
    if (isDouble) {
      // Dynamic High-Fidelity DE Topology
      const lbRounds: any[][] = [];
      const wbLosersPerRound: any[][] = roundMatches.map(rm => rm.map(m => m.id));
      
      // We need LB rounds to catch losers from each WB round.
      // Usually, LB has more rounds because it also includes matches between LB winners.
      
      let currentLBRound: any[] = [];
      const lbMatchups: any[] = [];

      // HELPER: Link winner/loser to another match
      const linkMatch = (source: any, targetId: string, slot: 'team1' | 'team2', isWinner: boolean) => {
        if (isWinner) {
          source.winnerTo = targetId;
          source.winnerToSlot = slot;
        } else {
          source.loserTo = targetId;
          source.loserToSlot = slot;
        }
      };

      // Basic DE Strategy: 
      // For each WB round 'r', we need to catch its losers.
      // WB R0 (n games) -> LB R0 (n/2 games)
      // WB R1 (n/2 games) -> LB R1...
      
      // For 8 teams (R0: 4, R1: 2, R2: 1):
      // LB R1: 2 games (takes WB R0 losers)
      // LB R2: 2 games (takes LB R1 winners + WB R1 losers)
      // LB R3: 1 game (takes LB R2 winners)
      // LB R4: 1 game (takes LB R3 winner + WB R2 loser)
      // Grand Final

      // For 4 teams (R0: 2, R1: 1):
      // LB R1: 1 game (takes WB R0 losers)
      // LB R2: 1 game (takes LB R1 winner + WB R1 loser)
      // Grand Final

      if (totalRounds >= 2) {
        const grandFinalId = `gf_${Date.now()}`;
        
        // --- LB PHASE 1: Capture First Round Losers ---
        const wbR0 = roundMatches[0];
        const lbr1Count = Math.floor(wbR0.length / 2);
        const lbr1: any[] = [];
        for (let i = 0; i < lbr1Count; i++) {
          const id = `lb_r1_${i}_${Date.now()}`;
          const m = { id, round: 'LB Round 1', t1: 'TBD', t2: 'TBD' };
          lbr1.push(m); lbMatchups.push(m);
        }
        
        // Link WB R0 Losers to LB R1
        for (let i = 0; i < wbR0.length; i++) {
          const targetIdx = Math.floor(i / 2);
          const slot = i % 2 === 0 ? 'team1' : 'team2';
          if (lbr1[targetIdx]) linkMatch(wbR0[i], lbr1[targetIdx].id, slot, false);
        }

        // --- LB PHASE 2+: Catch subsequent losers and progress ---
        let lastLBRound = lbr1;
        for (let r = 1; r < totalRounds; r++) {
          const wbRound = roundMatches[r];
          const isFinalWB = r === totalRounds - 1;

          // Step A: LB Inter-round (WB Losers meet LB winners)
          const lbrX: any[] = [];
          for (let i = 0; i < wbRound.length; i++) {
            const id = `lb_rx_${r}_${i}_${Date.now()}`;
            const label = isFinalWB ? 'LB Finals' : `LB Round ${r * 2}`;
            const m = { id, round: label, t1: 'TBD', t2: 'TBD' };
            lbrX.push(m); lbMatchups.push(m);
            
            // Winners of last LB round go to Team 1
            if (lastLBRound[i]) linkMatch(lastLBRound[i], m.id, 'team1', true);
            // Losers of current WB round go to Team 2
            linkMatch(wbRound[i], m.id, 'team2', false);
          }

          if (isFinalWB) {
            // Link LB Final winner to Grand Final
            linkMatch(lbrX[0], grandFinalId, 'team2', true);
            // Link WB Final winner to Grand Final
            linkMatch(wbRound[0], grandFinalId, 'team1', true);
          } else {
            // Step B: LB Internal Progression (Winners play each other)
            const lbrY: any[] = [];
            const nextCount = Math.floor(lbrX.length / 2);
            for (let i = 0; i < nextCount; i++) {
              const id = `lb_ry_${r}_${i}_${Date.now()}`;
              const m = { id, round: `LB Round ${r * 2 + 1}`, t1: 'TBD', t2: 'TBD' };
              lbrY.push(m); lbMatchups.push(m);
              
              linkMatch(lbrX[i*2], m.id, 'team1', true);
              linkMatch(lbrX[i*2+1], m.id, 'team2', true);
            }
            lastLBRound = lbrY.length > 0 ? lbrY : lbrX;
          }
        }

        // Add Grand Final
        lbMatchups.push({
          id: grandFinalId,
          round: 'Championship',
          t1: 'TBD (WB Winner)',
          t2: 'TBD (LB Winner)',
          t1Id: 'tbd', t2Id: 'tbd'
        });
      }

      lbMatchups.forEach(m => matchups.push(m));
    }
  }

  // --- Automatic Elimination Bracket for Pool Play Knockout ---
  if (tournamentType === 'pool_play_knockout' && teamList.length >= 4) {
    const semi1Id = `s1_${Date.now()}`;
    const semi2Id = `s2_${Date.now()}`;
    const finalId = `f1_${Date.now()}`;
    
    matchups.push({ 
      t1: 'TBD (Seed 1)', t2: 'TBD (Seed 4)', 
      t1Id: 'tbd', t2Id: 'tbd', 
      round: 'Semi-Finals', 
      id: semi1Id, 
      winnerTo: finalId, 
      winnerToSlot: 'team1' 
    });
    matchups.push({ 
      t1: 'TBD (Seed 2)', t2: 'TBD (Seed 3)', 
      t1Id: 'tbd', t2Id: 'tbd', 
      round: 'Semi-Finals', 
      id: semi2Id, 
      winnerTo: finalId, 
      winnerToSlot: 'team2' 
    });
    matchups.push({ 
      t1: 'TBD (Semi 1 Winner)', t2: 'TBD (Semi 2 Winner)', 
      t1Id: 'tbd', t2Id: 'tbd', 
      round: 'Championship', 
      id: finalId 
    });
  }

  // Helper to enforce phase dependencies
  const getRoundTier = (r: string) => {
    const rLower = r.toLowerCase();
    if (rLower.includes('pool')) return 0;
    const m = rLower.match(/round\s+(\d+)/);
    if (m) return parseInt(m[1]);
    if (rLower.includes('quarter')) return 80;
    if (rLower.includes('semi')) return 90;
    if (rLower.includes('championship') || rLower.includes('final')) return 100;
    return 10;
  };

  // --- Optimization: Limit Round Robin matches if gamesPerTeam is set ---
  let finalMatchups = matchups;
  if ((tournamentType === 'round_robin' || tournamentType === 'pool_play_knockout') && config.gamesPerTeam) {
    const maxGames = Math.ceil((teamList.length * config.gamesPerTeam) / 2);
    // Keep Semis and Finals from being sliced off if they exist!
    const poolMatches = matchups.filter(m => m.round === 'Pool Play').slice(0, maxGames);
    const bracketMatches = matchups.filter(m => m.round !== 'Pool Play');
    finalMatchups = [...poolMatches, ...bracketMatches];
  }
  
  const startD = parseLocalDate(startDate);
  const endD = endDate ? parseLocalDate(endDate) : startD;
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

  const finalGames: TournamentGame[] = [];
  const dailyTeamUsage = new Map<string, { teamId: string; time: string }[]>();
  const teamGamesPerDay = new Map<string, number>(); // key: "date:teamId"

  const pool = [...finalMatchups];
  
  for (const slot of slots) {
    if (pool.length === 0) break;

    const dayKey = format(slot.date, 'yyyy-MM-dd');
    const timeKey = format(slot.time, 'HH:mm');
    if (!dailyTeamUsage.has(dayKey)) dailyTeamUsage.set(dayKey, []);
    const todaysGames = dailyTeamUsage.get(dayKey)!;

    let foundMatchupIndex = -1;
    
    // Determine the minimum active tier we are currently scheduling to enforce chronological phases
    const minTierInPool = Math.min(...pool.map(m => getRoundTier(m.round)));

    for (let i = 0; i < pool.length; i++) {
      const { t1, t2, t1Id, t2Id, round } = pool[i];
      const id1 = t1Id || t1; // fallback to name if ID missing
      const id2 = t2Id || t2;

      // Phase isolation: never schedule a knockout/later round while early rounds are pending!
      const currentTier = getRoundTier(round);
      if (currentTier > minTierInPool) continue;

      // 1. Prevent simultaneous games & enforce physical recovery (Rest Period)
      const MIN_REST_MINUTES = config.gameLength + config.breakLength; // Minimum gap between games
      const currentSlotTime = slot.time;
      
      const t1IsTBD = t1.includes('TBD') || id1 === 'tbd';
      const t2IsTBD = t2.includes('TBD') || id2 === 'tbd';

      const t1IsBusy = !t1IsTBD && finalGames.some(g => {
        const matchT1 = (g.team1Id === id1 || g.team1 === t1);
        const matchT2 = (g.team2Id === id1 || g.team2 === t1);
        if (!matchT1 && !matchT2) return false;
        
        const gTime = parse(g.time, 'h:mm a', parseISO(g.date)); 
        return Math.abs(differenceInMinutes(currentSlotTime, gTime)) < MIN_REST_MINUTES;
      });

      const t2IsBusy = !t2IsTBD && finalGames.some(g => {
        const matchT1 = (g.team1Id === id2 || g.team1 === t2);
        const matchT2 = (g.team2Id === id2 || g.team2 === t2);
        if (!matchT1 && !matchT2) return false;
        
        const gTime = parse(g.time, 'h:mm a', parseISO(g.date)); 
        return Math.abs(differenceInMinutes(currentSlotTime, gTime)) < MIN_REST_MINUTES;
      });

      if (t1IsBusy || t2IsBusy) continue;

      // 2. Handle Double Header Logic
      const t1DailyCount = t1IsTBD ? 0 : (teamGamesPerDay.get(`${dayKey}:${id1}`) || 0);
      const t2DailyCount = t2IsTBD ? 0 : (teamGamesPerDay.get(`${dayKey}:${id2}`) || 0);

      if (config.doubleHeaderOption === 'none') {
        if (t1DailyCount >= 1 || t2DailyCount >= 1) continue;
      } else if (config.doubleHeaderOption === 'sameTeam') {
        if (t1DailyCount >= 2 || t2DailyCount >= 2) continue;
        
        // If it's a second game for T1, check if the opponent matches their first game
        if (t1DailyCount === 1) {
          const firstGame = finalGames.find(g => g.date === dayKey && (g.team1Id === id1 || g.team2Id === id1));
          const firstOpponentId = firstGame?.team1Id === id1 ? firstGame?.team2Id : firstGame?.team1Id;
          if (id2 !== firstOpponentId) continue;
        }
        // If it's a second game for T2, check if the opponent matches their first game
        if (t2DailyCount === 1) {
          const firstGame = finalGames.find(g => g.date === dayKey && (g.team1Id === id2 || g.team2Id === id2));
          const firstOpponentId = firstGame?.team1Id === id2 ? firstGame?.team2Id : firstGame?.team1Id;
          if (id1 !== firstOpponentId) continue;
        }
      } else if (config.doubleHeaderOption === 'differentTeams') {
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
        id: match.id || `tg_${Date.now()}_${finalGames.length}`,
        team1: match.t1, team2: match.t2,
        team1Id: match.t1Id || 'tbd', team2Id: match.t2Id || 'tbd',
        score1: 0, score2: 0,
        date: dayKey,
        time: format(slot.time, 'h:mm a'),
        location: slot.field,
        isCompleted: false,
        updatedAt: new Date().toISOString(),
        round: match.round,
        stage: match.round.includes('WB') ? 'WB' : match.round.includes('LB') ? 'LB' : 'Main',
        winnerTo: match.winnerTo,
        winnerToSlot: match.winnerToSlot,
        loserTo: match.loserTo,
        loserToSlot: match.loserToSlot
      });

      todaysGames.push({ teamId: id1, time: timeKey });
      todaysGames.push({ teamId: id2, time: timeKey });
      teamGamesPerDay.set(`${dayKey}:${id1}`, (teamGamesPerDay.get(`${dayKey}:${id1}`) || 0) + 1);
      teamGamesPerDay.set(`${dayKey}:${id2}`, (teamGamesPerDay.get(`${dayKey}:${id2}`) || 0) + 1);
    }
  }
  
  return finalGames;
}
