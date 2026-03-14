
/**
 * @fileOverview Core logic for the Elite Scheduling Engine.
 */

import { addMinutes, format, isBefore, parse, addDays, isSameDay } from 'date-fns';
import { TournamentGame } from '@/components/providers/team-provider';

export interface ScheduleConfig {
  teams: string[];
  fields: string[];
  startDate: string;
  endDate?: string;
  startTime: string; // e.g. "08:00"
  endTime: string;   // e.g. "20:00"
  gameLength: number; // minutes
  breakLength: number; // minutes
  gamesPerTeam?: number;
  doubleHeaders?: boolean;
}

/**
 * Generates an automated tournament itinerary.
 */
export function generateTournamentSchedule(config: ScheduleConfig): TournamentGame[] {
  const { teams, fields, startDate, endDate, startTime, endTime, gameLength, breakLength } = config;
  const games: TournamentGame[] = [];
  const teamGameCounts: Record<string, number> = teams.reduce((acc, t) => ({ ...acc, [t]: 0 }), {});
  
  let currentDay = new Date(startDate);
  const lastDay = endDate ? new Date(endDate) : currentDay;
  
  // Create all possible unique matchups (Round Robin)
  const matchups: [string, string][] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matchups.push([teams[i], teams[j]]);
    }
  }

  // Iterate days
  while (!isBefore(lastDay, currentDay)) {
    let currentTime = parse(startTime, 'HH:mm', currentDay);
    const dayEndTime = parse(endTime, 'HH:mm', currentDay);

    while (isBefore(currentTime, dayEndTime) && matchups.length > 0) {
      // For each field at this time slot
      for (const field of fields) {
        if (matchups.length === 0) break;

        // Pick a matchup where neither team has played too much today (simplification)
        const matchIdx = matchups.findIndex(m => true); // In a real engine, we'd check daily limits
        if (matchIdx === -1) break;

        const [t1, t2] = matchups.splice(matchIdx, 1)[0];
        
        games.push({
          id: `tg_${Date.now()}_${games.length}`,
          team1: t1,
          team2: t2,
          score1: 0,
          score2: 0,
          date: format(currentDay, 'yyyy-MM-dd'),
          time: format(currentTime, 'h:mm a'),
          location: field,
          isCompleted: false
        });
      }
      
      currentTime = addMinutes(currentTime, gameLength + breakLength);
    }
    
    currentDay = addDays(currentDay, 1);
  }

  return games;
}

/**
 * Generates a full League Season schedule.
 */
export function generateLeagueSchedule(config: ScheduleConfig & { playDays: number[] }): TournamentGame[] {
  const { teams, fields, startDate, endDate, startTime, endTime, gameLength, breakLength, playDays, gamesPerTeam = 10, doubleHeaders = false } = config;
  const games: TournamentGame[] = [];
  const teamMatchups: Record<string, string[]> = teams.reduce((acc, t) => ({ ...acc, [t]: [] }), {});
  
  let currentDay = new Date(startDate);
  const lastDay = endDate ? new Date(endDate) : addDays(currentDay, 90); // default 3 months
  
  // Create matchups pool
  const pool: [string, string][] = [];
  for (let i = 0; i < (gamesPerTeam / 2); i++) {
    for (let j = 0; j < teams.length; j++) {
      for (let k = j + 1; k < teams.length; k++) {
        pool.push([teams[j], teams[k]]);
        if (doubleHeaders) {
          pool.push([teams[k], teams[j]]); // Reverse home/away
        }
      }
    }
  }

  // Filter pool to exact limit
  const finalPool = pool.slice(0, (teams.length * gamesPerTeam) / 2);

  while (!isBefore(lastDay, currentDay) && finalPool.length > 0) {
    if (playDays.includes(currentDay.getDay())) {
      let currentTime = parse(startTime, 'HH:mm', currentDay);
      const dayEndTime = parse(endTime, 'HH:mm', currentDay);

      while (isBefore(currentTime, dayEndTime) && finalPool.length > 0) {
        for (const field of fields) {
          if (finalPool.length === 0) break;
          
          const [t1, t2] = finalPool.shift()!;
          
          games.push({
            id: `lg_${Date.now()}_${games.length}`,
            team1: t1,
            team2: t2,
            score1: 0,
            score2: 0,
            date: format(currentDay, 'yyyy-MM-dd'),
            time: format(currentTime, 'h:mm a'),
            location: field,
            isCompleted: false,
            leagueMatch: true
          });
        }
        currentTime = addMinutes(currentTime, gameLength + breakLength);
      }
    }
    currentDay = addDays(currentDay, 1);
  }

  return games;
}
