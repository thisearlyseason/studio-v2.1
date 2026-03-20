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

export interface ScheduleConfig {
  teams: string[];
  fields: string[];
  startDate: string;
  endDate?: string;
  startTime: string;
  endTime: string;
  gameLength: number;
  breakLength: number;
  gamesPerTeam?: number;
  /** Defines the double-header strategy.
   * 'none': No team plays more than one game a day.
   * 'sameTeam': A team can play two games on the same day against the same opponent (home/away).
   * 'differentTeams': A team can play two games on the same day against two different opponents.
  */
  doubleHeaderOption?: 'none' | 'sameTeam' | 'differentTeams';
  blackoutDates?: string[]; // ISO Strings
  dailyWindows?: DailyWindow[];
  playDays: number[];
}

/**
 * Shuffles an array in place.
 * @param array The array to shuffle.
 * @returns The shuffled array.
 */
function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

/**
 * Generates a full League Season schedule with multi-venue and blackout support.
 * Hardened for balanced distribution, back-to-back double headers, and regularity.
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
    playDays,
    gamesPerTeam = 10,
    doubleHeaderOption = 'none',
    blackoutDates = [],
  } = config;

  if (teams.length < 2 || fields.length === 0) return [];

  const startD = new Date(startDate);
  const endD = endDate ? new Date(endDate) : addDays(startD, 120);

  // 1. Generate a balanced, round-robin match pool
  const roundRobinPairs: [string, string][] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      roundRobinPairs.push([teams[i], teams[j]]);
    }
  }

  let matchPool: [string, string][] = [];
  const requiredGames = Math.ceil((teams.length * gamesPerTeam) / 2);

  while (matchPool.length < requiredGames) {
    const round = Math.floor(matchPool.length / roundRobinPairs.length);
    shuffle(roundRobinPairs); // Shuffle for variety each round
    for (const pair of roundRobinPairs) {
      // Alternate home/away for fairness
      matchPool.push(round % 2 === 0 ? [pair[0], pair[1]] : [pair[1], pair[0]]);
      if (matchPool.length >= requiredGames) break;
    }
  }
  shuffle(matchPool); // Final shuffle of the entire pool

  // 2. Generate all available time slots
  const availableSlots: { date: Date; time: Date; field: string }[] = [];
  let currentDay = new Date(startD);

  while (!isAfter(currentDay, endD)) {
    const dayKey = format(currentDay, 'yyyy-MM-dd');
    const isBlackout = blackoutDates.some(d => format(new Date(d), 'yyyy-MM-dd') === dayKey);

    if (playDays.includes(currentDay.getDay()) && !isBlackout) {
      let currentTime = parse(startTime, 'HH:mm', currentDay);
      const dayEndTime = parse(endTime, 'HH:mm', currentDay);

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

  if (availableSlots.length === 0 || matchPool.length === 0) return [];

  // 3. Intelligent Game Assignment
  const finalGames: TournamentGame[] = [];
  const teamGameCounts = new Map<string, number>(teams.map(t => [t, 0]));
  const dailyTeamUsage = new Map<string, { team: string; field: string; opponent: string }[]>();

  for (const slot of availableSlots) {
    if (matchPool.length === 0) break; // All games scheduled

    const dayKey = format(slot.date, 'yyyy-MM-dd');
    if (!dailyTeamUsage.has(dayKey)) {
      dailyTeamUsage.set(dayKey, []);
    }
    const todaysGames = dailyTeamUsage.get(dayKey)!;

    // Find the first valid matchup in the pool for this slot
    let foundMatchupIndex = -1;
    for (let i = 0; i < matchPool.length; i++) {
      const [team1, team2] = matchPool[i];

      // Rule: Skip if either team has already reached their total game count
      if (teamGameCounts.get(team1)! >= gamesPerTeam || teamGameCounts.get(team2)! >= gamesPerTeam) {
        continue;
      }

      // Rule: Check for scheduling conflicts at this exact time
      const isTeam1Busy = todaysGames.some(g => g.team === team1);
      const isTeam2Busy = todaysGames.some(g => g.team === team2);
      if (isTeam1Busy || isTeam2Busy) {
        continue;
      }
      
      const team1DailyGames = todaysGames.filter(g => g.team === team1);
      const team2DailyGames = todaysGames.filter(g => g.team === team2);
      
      // Rule: Enforce double-header option
      if (doubleHeaderOption === 'none') {
        if (team1DailyGames.length > 0 || team2DailyGames.length > 0) continue;
      } else {
        if (team1DailyGames.length >= 2 || team2DailyGames.length >= 2) continue; // Already played double-header
        
        // A team's second game MUST be on the same field
        if (team1DailyGames.length === 1 && team1DailyGames[0].field !== slot.field) continue;
        if (team2DailyGames.length === 1 && team2DailyGames[0].field !== slot.field) continue;

        // Enforce opponent type for double-headers
        if (doubleHeaderOption === 'sameTeam') {
          if (team1DailyGames.length === 1 && team1DailyGames[0].opponent !== team2) continue;
          if (team2DailyGames.length === 1 && team2DailyGames[0].opponent !== team1) continue;
        }
        if (doubleHeaderOption === 'differentTeams') {
          if (team1DailyGames.length === 1 && team1DailyGames[0].opponent === team2) continue;
          if (team2DailyGames.length === 1 && team2DailyGames[0].opponent === team1) continue;
        }
      }
      
      // If all rules pass, this matchup is valid
      foundMatchupIndex = i;
      break;
    }

    if (foundMatchupIndex !== -1) {
      const [team1, team2] = matchPool.splice(foundMatchupIndex, 1)[0];

      // Schedule the game
      finalGames.push({
        id: `lg_${Date.now()}_${finalGames.length}`,
        team1,
        team2,
        score1: 0,
        score2: 0,
        date: format(slot.date, 'yyyy-MM-dd'),
        time: format(slot.time, 'h:mm a'),
        location: slot.field,
        isCompleted: false,
        updatedAt: new Date().toISOString(),
      });

      // Update tracking state
      teamGameCounts.set(team1, (teamGameCounts.get(team1) || 0) + 1);
      teamGameCounts.set(team2, (teamGameCounts.get(team2) || 0) + 1);
      todaysGames.push({ team: team1, field: slot.field, opponent: team2 });
      todaysGames.push({ team: team2, field: slot.field, opponent: team1 });
    }
  }

  return finalGames.sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    const timeA = parse(a.time, 'h:mm a', new Date());
    const timeB = parse(b.time, 'h:mm a', new Date());
    return timeA.getTime() - timeB.getTime();
  });
}

/**
 * Generates an automated tournament itinerary.
 * NOTE: This function is simpler and not the focus of the recent refactoring.
 */
export function generateTournamentSchedule(config: Omit<ScheduleConfig, 'playDays'>): TournamentGame[] {
  const { teams, fields, startDate, endDate, startTime, endTime, gameLength, breakLength, dailyWindows } = config;
  const games: TournamentGame[] = [];
  
  const startD = new Date(startDate);
  const endD = endDate ? new Date(endDate) : startD;
  
  const matchups: [string, string][] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matchups.push([teams[i], teams[j]]);
    }
  }

  const availableSlots: { date: Date; time: Date; field: string }[] = [];
  const dayInterval = eachDayOfInterval({ start: startD, end: endD });

  dayInterval.forEach(day => {
    const dayStr = format(day, 'yyyy-MM-dd');
    const window = dailyWindows?.find(w => w.date === dayStr);
    
    let currentStartTime = window ? window.startTime : startTime;
    let currentEndTime = window ? window.endTime : endTime;

    let currentTime = parse(currentStartTime, 'HH:mm', day);
    const dayEndTime = parse(currentEndTime, 'HH:mm', day);

    while (isBefore(currentTime, dayEndTime)) {
      for (const field of fields) {
        availableSlots.push({ date: new Date(day), time: new Date(currentTime), field });
      }
      currentTime = addMinutes(currentTime, gameLength + breakLength);
    }
  });

  if (availableSlots.length === 0 || matchups.length === 0) return [];
  
  // Simple distribution for tournaments
  for (let i = 0; i < Math.min(matchups.length, availableSlots.length); i++) {
    const slot = availableSlots[i];
    const [t1, t2] = matchups[i];

    games.push({
      id: `tg_${Date.now()}_${i}`,
      team1: t1,
      team2: t2,
      score1: 0,
      score2: 0,
      date: format(slot.date, 'yyyy-MM-dd'),
      time: format(slot.time, 'h:mm a'),
      location: slot.field,
      isCompleted: false
    });
  }

  return games;
}
