
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
  tournamentType?: 'round_robin' | 'single_elimination' | 'double_elimination';
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
  const [year, month, day] = dateStr.split('-').map(Number);
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

    if (playDays.includes(currentDay.getDay()) && !isBlackout) {
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

      const isT1Busy = todaysGames.some(g => g.teamId === t1.id && g.time === timeKey);
      const isT2Busy = todaysGames.some(g => g.teamId === t2.id && g.time === timeKey);
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
  
  if (tournamentType === 'round_robin') {
    const shuffled = shuffle([...teamList]);
    for (let i = 0; i < shuffled.length; i++) {
      for (let j = i + 1; j < shuffled.length; j++) {
        matchups.push({ t1: shuffled[i].name, t2: shuffled[j].name, t1Id: shuffled[i].id, t2Id: shuffled[j].id, round: 'Pool Play' });
      }
    }
  } else if (tournamentType === 'single_elimination') {
    const shuffled = shuffle([...teamList]);
    const numTeams = shuffled.length;
    const numByes = Math.pow(2, Math.ceil(Math.log2(numTeams))) - numTeams;
    
    // First Round matches
    const firstRoundMatches = (numTeams - numByes) / 2;
    for (let i = 0; i < firstRoundMatches; i++) {
      matchups.push({ t1: shuffled[i * 2 + numByes].name, t2: shuffled[i * 2 + numByes + 1].name, t1Id: shuffled[i * 2 + numByes].id, t2Id: shuffled[i * 2 + numByes + 1].id, round: 'Round 1' });
    }
    
    // Future placeholders
    const totalRounds = Math.ceil(Math.log2(numTeams));
    for (let r = 2; r <= totalRounds; r++) {
      const label = r === totalRounds ? 'Championship' : r === totalRounds - 1 ? 'Semi-Finals' : `Round ${r}`;
      const gamesInRound = Math.pow(2, totalRounds - r);
      for (let i = 0; i < gamesInRound; i++) {
        matchups.push({ t1: 'TBD', t2: 'TBD', round: label });
      }
    }
  } else if (tournamentType === 'double_elimination') {
    // Advanced DE Setup: 
    // For N teams, we need approximately 2N-1 games.
    const shuffled = shuffle([...teamList]);
    const n = shuffled.length;
    
    // Winners Bracket R1
    const wb1Games = Math.floor(n / 2);
    for (let i = 0; i < wb1Games; i++) {
      matchups.push({ t1: shuffled[i * 2].name, t2: shuffled[i * 2 + 1].name, t1Id: shuffled[i * 2].id, t2Id: shuffled[i * 2 + 1].id, round: 'WB Round 1' });
    }
    
    // Losers Bracket R1
    const lb1Games = Math.floor(wb1Games / 2) || 1;
    for (let i = 0; i < lb1Games; i++) {
      matchups.push({ t1: 'TBD', t2: 'TBD', round: 'LB Round 1' });
    }

    // Subsequent rounds placeholders
    const totalRounds = Math.ceil(Math.log2(n)) + 1;
    for (let r = 2; r <= totalRounds; r++) {
      matchups.push({ t1: 'TBD', t2: 'TBD', round: `WB Round ${r}` });
      matchups.push({ t1: 'TBD', t2: 'TBD', round: `LB Round ${r}` });
    }
    
    matchups.push({ t1: 'TBD', t2: 'TBD', round: 'Semi-Finals' });
    matchups.push({ t1: 'TBD', t2: 'TBD', round: 'Championship' });
    matchups.push({ t1: 'TBD', t2: 'TBD', round: 'IF NECESSARY' });
  }

  // --- Optimization: Limit Round Robin matches if gamesPerTeam is set ---
  let finalMatchups = matchups;
  if (tournamentType === 'round_robin' && config.gamesPerTeam) {
    const maxGames = Math.ceil((teamList.length * config.gamesPerTeam) / 2);
    finalMatchups = matchups.slice(0, maxGames);
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
    for (let i = 0; i < pool.length; i++) {
      const { t1, t2, t1Id, t2Id } = pool[i];
      const id1 = t1Id || t1; // fallback to name if ID missing
      const id2 = t2Id || t2;

      // 1. Prevent simultaneous games & enforce physical recovery (Rest Period)
      const MIN_REST_MINUTES = config.gameLength + config.breakLength; // Minimum gap between games
      const currentSlotTime = slot.time;
      
      const t1IsBusy = finalGames.some(g => {
        if (g.team1Id !== id1 && g.team2Id !== id1) return false;
        const gTime = parse(g.time, 'h:mm a', parseISO(g.date)); 
        return Math.abs(differenceInMinutes(currentSlotTime, gTime)) < MIN_REST_MINUTES;
      });

      const t2IsBusy = finalGames.some(g => {
        if (g.team1Id !== id2 && g.team2Id !== id2) return false;
        const gTime = parse(g.time, 'h:mm a', parseISO(g.date)); 
        return Math.abs(differenceInMinutes(currentSlotTime, gTime)) < MIN_REST_MINUTES;
      });

      if (t1IsBusy || t2IsBusy) continue;

      // 2. Handle Double Header Logic
      const t1DailyCount = teamGamesPerDay.get(`${dayKey}:${id1}`) || 0;
      const t2DailyCount = teamGamesPerDay.get(`${dayKey}:${id2}`) || 0;

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
        id: `tg_${Date.now()}_${finalGames.length}`,
        team1: match.t1, team2: match.t2,
        team1Id: match.t1Id || 'tbd', team2Id: match.t2Id || 'tbd',
        score1: 0, score2: 0,
        date: dayKey,
        time: format(slot.time, 'h:mm a'),
        location: slot.field,
        isCompleted: false,
        updatedAt: new Date().toISOString(),
        round: match.round,
        stage: match.round.includes('WB') ? 'WB' : match.round.includes('LB') ? 'LB' : 'Main'
      });

      todaysGames.push({ teamId: id1, time: timeKey });
      todaysGames.push({ teamId: id2, time: timeKey });
      teamGamesPerDay.set(`${dayKey}:${id1}`, (teamGamesPerDay.get(`${dayKey}:${id1}`) || 0) + 1);
      teamGamesPerDay.set(`${dayKey}:${id2}`, (teamGamesPerDay.get(`${dayKey}:${id2}`) || 0) + 1);
    }
  }
  
  return finalGames;
}
