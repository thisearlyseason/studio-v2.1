/**
 * @fileOverview Core logic for the Elite Scheduling Engine.
 * Hardened for balanced distribution, multi-venue resource mapping, and intelligent double-headers.
 */

import { addMinutes, format, isBefore, parse, addDays, eachDayOfInterval, isAfter } from 'date-fns';
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
 * Robust time parser handling 12h and 24h formats.
 */
function parseTime(timeStr: string, referenceDate: Date): Date {
  const formats = ['HH:mm', 'h:mm a', 'h:mm A', 'HH:mm:ss'];
  for (const f of formats) {
    const d = parse(timeStr, f, referenceDate);
    if (!isNaN(d.getTime())) return d;
  }
  // Fallback: manual regex if standard parse fails
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
    teams,
    fields,
    startDate,
    endDate,
    startTime,
    endTime,
    gameLength,
    breakLength,
    playDays = [1, 2, 3, 4, 5, 6, 0],
    gamesPerTeam = 10,
    doubleHeaderOption = 'none',
    blackoutDates = [],
  } = config;

  const teamIdentities = teams.map((t, idx) => typeof t === 'string' ? { id: `t_${idx}`, name: t } : t);

  if (teamIdentities.length < 2 || fields.length === 0) return [];

  const startD = new Date(startDate);
  const endD = endDate ? new Date(endDate) : addDays(startD, 120);

  const basePairs: { t1: TeamIdentity; t2: TeamIdentity }[] = [];
  for (let i = 0; i < teamIdentities.length; i++) {
    for (let j = i + 1; j < teamIdentities.length; j++) {
      basePairs.push({ t1: teamIdentities[i], t2: teamIdentities[j] });
    }
  }

  let matchPool: { t1: TeamIdentity; t2: TeamIdentity }[] = [];
  const requiredGames = Math.ceil((teamIdentities.length * gamesPerTeam) / 2);

  while (matchPool.length < requiredGames) {
    const round = Math.floor(matchPool.length / basePairs.length);
    const roundPairs = shuffle([...basePairs]);
    for (const pair of roundPairs) {
      if (round % 2 === 0) {
        matchPool.push({ t1: pair.t1, t2: pair.t2 });
      } else {
        matchPool.push({ t1: pair.t2, t2: pair.t1 });
      }
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

      while (isBefore(currentTime, dayEndTime)) {
        for (const field of fields) {
          availableSlots.push({
            date: new Date(currentDay),
            time: new Date(currentTime),
            field,
          });
        }
        currentTime = addMinutes(currentTime, gameLength + breakLength);
      }
    }
    currentDay = addDays(currentDay, 1);
  }

  const finalGames: TournamentGame[] = [];
  const teamGameCounts = new Map<string, number>(teamIdentities.map(t => [t.id, 0]));
  const dailyTeamUsage = new Map<string, { teamId: string; field: string; opponentId: string; time: string }[]>();

  for (const slot of availableSlots) {
    if (matchPool.length === 0) break;

    const dayKey = format(slot.date, 'yyyy-MM-dd');
    const timeKey = format(slot.time, 'HH:mm');
    if (!dailyTeamUsage.has(dayKey)) dailyTeamUsage.set(dayKey, []);
    const todaysGames = dailyTeamUsage.get(dayKey)!;

    let foundMatchupIndex = -1;
    for (let i = 0; i < matchPool.length; i++) {
      const { t1, t2 } = matchPool[i];

      const isT1BusyNow = todaysGames.some(g => g.teamId === t1.id && g.time === timeKey);
      const isT2BusyNow = todaysGames.some(g => g.teamId === t2.id && g.time === timeKey);
      if (isT1BusyNow || isT2BusyNow) continue;

      if ((teamGameCounts.get(t1.id) || 0) >= gamesPerTeam || (teamGameCounts.get(t2.id) || 0) >= gamesPerTeam) continue;

      const t1PrevGames = todaysGames.filter(g => g.teamId === t1.id);
      const t2PrevGames = todaysGames.filter(g => g.teamId === t2.id);

      if (doubleHeaderOption === 'none') {
        if (t1PrevGames.length > 0 || t2PrevGames.length > 0) continue;
      } else {
        if (t1PrevGames.length >= 2 || t2PrevGames.length >= 2) continue;
        if (t1PrevGames.length === 1 && t1PrevGames[0].field !== slot.field) continue;
        if (t2PrevGames.length === 1 && t2PrevGames[0].field !== slot.field) continue;

        if (doubleHeaderOption === 'sameTeam') {
          if (t1PrevGames.length === 1 && t1PrevGames[0].opponentId !== t2.id) continue;
          if (t2PrevGames.length === 1 && t2PrevGames[0].opponentId !== t1.id) continue;
        } else if (doubleHeaderOption === 'differentTeams') {
          if (t1PrevGames.length === 1 && t1PrevGames[0].opponentId === t2.id) continue;
          if (t2PrevGames.length === 1 && t2PrevGames[0].opponentId === t1.id) continue;
        }
      }

      foundMatchupIndex = i;
      break;
    }

    if (foundMatchupIndex !== -1) {
      const { t1, t2 } = matchPool.splice(foundMatchupIndex, 1)[0];
      const gameIdSuffix = `${Math.random().toString(36).substring(2, 7)}_${finalGames.length}`;
      
      finalGames.push({
        id: `lg_${Date.now()}_${gameIdSuffix}`,
        team1: t1.name,
        team2: t2.name,
        team1Id: t1.id,
        team2Id: t2.id,
        score1: 0,
        score2: 0,
        date: format(slot.date, 'yyyy-MM-dd'),
        time: format(slot.time, 'h:mm a'),
        location: slot.field,
        isCompleted: false,
        updatedAt: new Date().toISOString(),
      });

      teamGameCounts.set(t1.id, (teamGameCounts.get(t1.id) || 0) + 1);
      teamGameCounts.set(t2.id, (teamGameCounts.get(t2.id) || 0) + 1);
      todaysGames.push({ teamId: t1.id, field: slot.field, opponentId: t2.id, time: timeKey });
      todaysGames.push({ teamId: t2.id, field: slot.field, opponentId: t1.id, time: timeKey });
    }
  }

  return finalGames.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/**
 * Tournament specific schedule supporting Round Robin and Multi-Venue Resource Mapping
 */
export function generateTournamentSchedule(config: ScheduleConfig): TournamentGame[] {
  const { teams, fields, startDate, endDate, startTime, endTime, gameLength, breakLength, dailyWindows, tournamentType = 'round_robin' } = config;
  
  const teamList = teams.map((t, i) => typeof t === 'string' ? { id: `t_${i}`, name: t } : t);
  const games: TournamentGame[] = [];
  const startD = new Date(startDate);
  const endD = endDate ? new Date(endDate) : startD;
  
  const matchups: [TeamIdentity, TeamIdentity][] = [];
  if (tournamentType === 'round_robin') {
    for (let i = 0; i < teamList.length; i++) {
      for (let j = i + 1; j < teamList.length; j++) {
        matchups.push([teamList[i], teamList[j]]);
      }
    }
  } else {
    // Elimination logic (seeding first round)
    const shuffledTeams = shuffle([...teamList]);
    for (let i = 0; i < Math.floor(shuffledTeams.length / 2); i++) {
      matchups.push([shuffledTeams[i], shuffledTeams[shuffledTeams.length - 1 - i]]);
    }
  }
  
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

  // Balanced match assignment
  const totalMatches = Math.min(matchups.length, slots.length);
  for (let i = 0; i < totalMatches; i++) {
    games.push({
      id: `tg_${Date.now()}_${i}`,
      team1: matchups[i][0].name,
      team2: matchups[i][1].name,
      team1Id: matchups[i][0].id,
      team2Id: matchups[i][1].id,
      score1: 0,
      score2: 0,
      date: format(slots[i].date, 'yyyy-MM-dd'),
      time: format(slots[i].time, 'h:mm a'),
      location: slots[i].field,
      isCompleted: false,
      updatedAt: new Date().toISOString()
    });
  }
  
  return games;
}
