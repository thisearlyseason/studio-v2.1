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
 * Hardened for balanced distribution, back-to-back double headers, and regularity.
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

  const startD = new Date(startDate);
  const endD = endDate ? new Date(endDate) : addDays(startD, 120); 
  
  // 1. Match Pool Generation
  const roundRobin: [string, string][] = [];
  for (let i = 0; i < teams.length; i++) {
    for (let j = i + 1; j < teams.length; j++) {
      roundRobin.push([teams[i], teams[j]]);
    }
  }

  const matchPool: [string, string][] = [];
  let rrIdx = 0;
  
  if (doubleHeaders) {
    const totalPairsPerTeam = Math.floor(gamesPerTeam / 2);
    const totalPairsNeeded = Math.floor((teams.length * totalPairsPerTeam) / 2);
    
    while (matchPool.length < totalPairsNeeded * 2) {
      const base = roundRobin[rrIdx % roundRobin.length];
      matchPool.push([base[0], base[1]]);
      matchPool.push([base[1], base[0]]);
      rrIdx++;
    }
  } else {
    const totalMatchesNeeded = Math.floor((teams.length * gamesPerTeam) / 2);
    while (matchPool.length < totalMatchesNeeded) {
      const base = roundRobin[rrIdx % roundRobin.length];
      const isReverse = Math.floor(rrIdx / roundRobin.length) % 2 === 1;
      if (isReverse) matchPool.push([base[1], base[0]]);
      else matchPool.push([base[0], base[1]]);
      rrIdx++;
    }
  }

  // 2. Slot Mapping - TACTICAL FIX: Field loop outside time loop for consecutive field slots
  const availableSlots: { date: Date; time: Date; field: string }[] = [];
  let currentDay = new Date(startD);
  
  while (!isAfter(currentDay, endD)) {
    const dayKey = format(currentDay, 'yyyy-MM-dd');
    const isBlackout = blackoutDates.some(d => format(new Date(d), 'yyyy-MM-dd') === dayKey);
    
    if (playDays.includes(currentDay.getDay()) && !isBlackout) {
      for (const field of fields) {
        let currentTime = parse(startTime, 'HH:mm', currentDay);
        const dayEndTime = parse(endTime, 'HH:mm', currentDay);

        while (isBefore(currentTime, dayEndTime)) {
          availableSlots.push({ 
            date: new Date(currentDay), 
            time: new Date(currentTime), 
            field 
          });
          currentTime = addMinutes(currentTime, gameLength + breakLength);
        }
      }
    }
    currentDay = addDays(currentDay, 1);
  }

  if (availableSlots.length === 0 || matchPool.length === 0) return [];

  const finalGames: TournamentGame[] = [];
  
  if (doubleHeaders) {
    let slotIdx = 0;
    for (let i = 0; i < matchPool.length; i += 2) {
      if (slotIdx + 1 >= availableSlots.length) break;
      
      const s1 = availableSlots[slotIdx];
      const s2 = availableSlots[slotIdx + 1];
      
      // Verified consecutive slots at same field
      if (s1.field === s2.field && format(s1.date, 'yyyy-MM-dd') === format(s2.date, 'yyyy-MM-dd')) {
        const matchup1 = matchPool[i];
        const matchup2 = matchPool[i+1];
        
        finalGames.push({
          id: `lg_${Date.now()}_${i}`,
          team1: matchup1[0], team2: matchup1[1], score1: 0, score2: 0,
          date: format(s1.date, 'yyyy-MM-dd'), time: format(s1.time, 'h:mm a'),
          location: s1.field, isCompleted: false, updatedAt: new Date().toISOString()
        });
        
        finalGames.push({
          id: `lg_${Date.now()}_${i+1}`,
          team1: matchup2[0], team2: matchup2[1], score1: 0, score2: 0,
          date: format(s2.date, 'yyyy-MM-dd'), time: format(s2.time, 'h:mm a'),
          location: s2.field, isCompleted: false, updatedAt: new Date().toISOString()
        });
        
        slotIdx += 2;
      } else {
        slotIdx++;
        i -= 2; // Retry
      }
    }
  } else {
    const step = Math.max(1, Math.floor(availableSlots.length / matchPool.length));
    for (let i = 0; i < matchPool.length; i++) {
      const slotIdx = i * step;
      if (slotIdx >= availableSlots.length) break;
      
      const slot = availableSlots[slotIdx];
      const [t1, t2] = matchPool[i];

      finalGames.push({
        id: `lg_${Date.now()}_${i}`,
        team1: t1, team2: t2, score1: 0, score2: 0,
        date: format(slot.date, 'yyyy-MM-dd'), time: format(slot.time, 'h:mm a'),
        location: slot.field, isCompleted: false, updatedAt: new Date().toISOString()
      });
    }
  }

  return finalGames.sort((a, b) => {
    const dateComp = a.date.localeCompare(b.date);
    if (dateComp !== 0) return dateComp;
    return a.time.localeCompare(b.time);
  });
}