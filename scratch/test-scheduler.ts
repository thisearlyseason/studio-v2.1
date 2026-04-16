import { generateTournamentSchedule } from '../src/lib/scheduler-utils';

const teams = [
  { id: 't1', name: 'Team A' },
  { id: 't2', name: 'Team B' },
  { id: 't3', name: 'Team C' },
  { id: 't4', name: 'Team D' }
];

const games = generateTournamentSchedule({
  teams,
  fields: ['Field 1'],
  startDate: new Date().toISOString(),
  startTime: '08:00',
  endTime: '12:00',
  gameLength: 60,
  breakLength: 15,
  tournamentType: 'single_elimination'
});

console.log(JSON.stringify(games, null, 2));
