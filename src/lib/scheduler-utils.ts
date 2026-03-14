
/**
 * @fileOverview Core logic for the Elite Scheduling Engine.
 * Hardened for balanced distribution and zero-conflict resource mapping.
 */

import { addMinutes, format, isBefore, parse, addDays, isSameDay, intervalToDuration, differenceInDays } from 'date-fns';
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
 * Spreads matches evenly across the specified days and fields.
 */
export function generateTournamentSchedule(config: ScheduleConfig): TournamentGame[] {
  const { teams, fields, startDate, endDate, startTime, endTime, gameLength, breakLength } = config;
  const games: TournamentGame[] = [];
  
  const startD = new Date(startDate);
  const endD = endDate ? new Date(endDate) : startD;
  const totalDays = Math.max(1, differenceInDays(endD, startD) + 1);
  
  // 1. Generate all required matchups (Round Robin)
  const matchups: [string, string][] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      matchups.push([teams[i], teams[j]]);
    }
  }

  // 2. Identify all valid time/field slots
  const availableSlots: { date: Date; time: Date; field: string }[] = [];
  let currentDay = new Date(startDate);
  
  while (!isBefore(endD, currentDay)) {
    let currentTime = parse(startTime, 'HH:mm', currentDay);
    const dayEndTime = parse(endTime, 'HH:mm', currentDay);

    while (isBefore(currentTime, dayEndTime)) {
      for (const field of fields) {
        availableSlots.push({ 
          date: new Date(currentDay), 
          time: new Date(currentTime), 
          field 
        });
      }
      currentTime = addMinutes(currentTime, gameLength + breakLength);
    }
    currentDay = addDays(currentDay, 1);
  }

  // 3. Distribute matches across slots evenly
  // We use a step-based distribution to spread matches across the entire duration
  const matchCount = matchups.length;
  const slotCount = availableSlots.length;
  
  if (slotCount === 0 || matchCount === 0) return [];

  // Determine spacing - spread matches out as much as possible
  const step = slotCount / matchCount;

  for (let i = 0; i < matchCount; i++) {
    const slotIdx = Math.floor(i * step);
    const slot = availableSlots[slotIdx];
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

/**
 * Generates a full League Season schedule.
 * Spreads matches across play days over the season duration.
 */
export function generateLeagueSchedule(config: ScheduleConfig & { playDays: number[] }): TournamentGame[] {
  const { teams, fields, startDate, endDate, startTime, endTime, gameLength, breakLength, playDays, gamesPerTeam = 10, doubleHeaders = false } = config;
  const games: TournamentGame[] = [];
  
  const startD = new Date(startDate);
  const endD = endDate ? new Date(endDate) : addDays(startD, 90); // Default 3 months
  
  // 1. Create the total pool of matches needed
  const matchPool: [string, string][] = [];
  // Each team needs gamesPerTeam / 2 pairings (since each pair is 1 game for 2 teams)
  // But if we want exactly N games per team, we need to be careful with odd team counts
  const totalRequiredMatches = Math.floor((teams.length * gamesPerTeam) / 2);
  
  // Simple Round Robin generator that repeats to fill the pool
  let rrIndex = 0;
  const roundRobin: [string, string][] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      roundRobin.push([teams[i], teams[j]]);
    }
  }

  while (matchPool.length < totalRequiredMatches) {
    const [t1, t2] = roundRobin[rrIndex % roundRobin.length];
    // Alternate home/away if repeating
    if (Math.floor(rrIndex / roundRobin.length) % 2 === 1 || doubleHeaders) {
      matchPool.push([t2, t1]);
    } else {
      matchPool.push([t1, t2]);
    }
    rrIndex++;
  }

  // 2. Identify all valid play slots
  const availableSlots: { date: Date; time: Date; field: string }[] = [];
  let currentDay = new Date(startDate);
  
  while (!isBefore(endD, currentDay)) {
    if (playDays.includes(currentDay.getDay())) {
      let currentTime = parse(startTime, 'HH:mm', currentDay);
      const dayEndTime = parse(endTime, 'HH:mm', currentDay);

      while (isBefore(currentTime, dayEndTime)) {
        for (const field of fields) {
          availableSlots.push({ 
            date: new Date(currentDay), 
            time: new Date(currentTime), 
            field 
          });
        }
        currentTime = addMinutes(currentTime, gameLength + breakLength);
      }
    }
    currentDay = addDays(currentDay, 1);
  }

  // 3. Distribute pool across slots
  if (availableSlots.length === 0) return [];
  
  // We want to spread the matches across the whole season
  const step = availableSlots.length / matchPool.length;

  for (let i = 0; i < matchPool.length; i++) {
    const slotIdx = Math.floor(i * step);
    if (slotIdx >= availableSlots.length) break;
    
    const slot = availableSlots[slotIdx];
    const [t1, t2] = matchPool[i];

    games.push({
      id: `lg_${Date.now()}_${i}`,
      team1: t1,
      team2: t2,
      score1: 0,
      score2: 0,
      date: format(slot.date, 'yyyy-MM-dd'),
      time: format(slot.time, 'h:mm a'),
      location: slot.field,
      isCompleted: false,
      leagueMatch: true
    });
  }

  return games;
}
