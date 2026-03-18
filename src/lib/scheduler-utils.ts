
/**
 * @fileOverview Core logic for the Elite Scheduling Engine.
 * Hardened for balanced distribution and multi-venue resource mapping.
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
  doubleHeaders?: boolean;
  blackoutDates?: string[]; // ISO Strings
  dailyWindows?: DailyWindow[];
}

/**
 * Generates an automated tournament itinerary.
 */
export function generateTournamentSchedule(config: ScheduleConfig): TournamentGame[] {
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
  
  // Distribute matchups across available slots
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

/**
 * Generates a full League Season schedule with multi-venue and blackout support.
 * Hardened for balanced distribution and regularity.
 */
export function generateLeagueSchedule(config: ScheduleConfig & { playDays: number[] }): TournamentGame[] {
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
    doubleHeaders = false, 
    blackoutDates = [] 
  } = config;

  if (teams.length < 2 || fields.length === 0) return [];

  const games: TournamentGame[] = [];
  const startD = new Date(startDate);
  const endD = endDate ? new Date(endDate) : addDays(startD, 120); // Default 4 month window if not provided
  
  // 1. Generate Match Pool (Balanced Round-Robin)
  const roundRobin: [string, string][] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      roundRobin.push([teams[i], teams[j]]);
    }
  }

  const totalRequiredMatches = Math.floor((teams.length * gamesPerTeam) / 2);
  const matchPool: [string, string][] = [];
  
  let rrIdx = 0;
  while (matchPool.length < totalRequiredMatches) {
    const baseMatch = roundRobin[rrIdx % roundRobin.length];
    const isReverseMatch = Math.floor(rrIdx / roundRobin.length) % 2 === 1;
    
    // Switch home/visitor logic
    if (doubleHeaders || isReverseMatch) {
      matchPool.push([baseMatch[1], baseMatch[0]]);
    } else {
      matchPool.push([baseMatch[0], baseMatch[1]]);
    }
    rrIdx++;
  }

  // 2. Identify Available Time Slots (Respecting regularity and fields)
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
            field 
          });
        }
        currentTime = addMinutes(currentTime, gameLength + breakLength);
      }
    }
    currentDay = addDays(currentDay, 1);
  }

  if (availableSlots.length === 0 || matchPool.length === 0) return [];

  // 3. Distribution Strategy (Spreading games regularly across the season)
  // We use a step to ensure we don't bunch all games at the start of the season
  const step = Math.max(1, Math.floor(availableSlots.length / matchPool.length));

  for (let i = 0; i < matchPool.length; i++) {
    const slotIdx = i * step;
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
      updatedAt: new Date().toISOString()
    });
  }

  // Final Sort by Date/Time
  return games.sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    return a.time.localeCompare(b.time);
  });
}
