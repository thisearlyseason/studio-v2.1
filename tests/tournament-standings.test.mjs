import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateTournamentStandings } from '../src/lib/tournament-standings.ts';

const teams = ['A', 'B', 'C', 'D'].map(name => ({ id: name.toLowerCase(), name }));

function game(id, team1Id, team2Id, score1, score2, pool = 0, isCompleted = true) {
  return {
    id,
    team1Id,
    team2Id,
    team1: team1Id.toUpperCase(),
    team2: team2Id.toUpperCase(),
    score1,
    score2,
    pool,
    date: '2026-09-01',
    time: '8:00 AM',
    location: 'Field 1',
    isCompleted,
    updatedAt: '2026-09-01T00:00:00.000Z',
  };
}

test('pool standings contain only teams assigned to that pool', () => {
  const standings = calculateTournamentStandings(teams, [
    game('g1', 'a', 'b', 2, 1, 0),
    game('g2', 'c', 'd', 3, 0, 1),
  ], 0);
  assert.deepEqual(standings.map(team => team.id).sort(), ['a', 'b']);
});

test('head-to-head mini-table resolves equal points before score differential', () => {
  const standings = calculateTournamentStandings(teams, [
    game('g1', 'a', 'b', 1, 0),
    game('g2', 'c', 'a', 5, 0),
    game('g3', 'a', 'd', 1, 0),
    game('g4', 'b', 'c', 10, 0),
    game('g5', 'b', 'd', 10, 0),
    game('g6', 'd', 'c', 1, 0),
  ]);
  assert.equal(standings.find(team => team.id === 'a').points, 6);
  assert.equal(standings.find(team => team.id === 'b').points, 6);
  assert.ok(standings.findIndex(team => team.id === 'a') < standings.findIndex(team => team.id === 'b'));
});

test('uncompleted games do not affect rankings', () => {
  const standings = calculateTournamentStandings(teams.slice(0, 2), [
    game('g1', 'a', 'b', 0, 50, 0, false),
  ]);
  assert.ok(standings.every(team => team.points === 0 && team.netScore === 0));
});

test('persisted tiebreak winner overrides a tied displayed score', () => {
  const decided = { ...game('g1', 'a', 'b', 2, 2), winnerId: 'a', explicitWinner: 'team1' };
  const standings = calculateTournamentStandings(teams.slice(0, 2), [decided]);
  assert.deepEqual(
    standings.map(team => ({ id: team.id, wins: team.wins, losses: team.losses, ties: team.ties, points: team.points })),
    [
      { id: 'a', wins: 1, losses: 0, ties: 0, points: 3 },
      { id: 'b', wins: 0, losses: 1, ties: 0, points: 0 },
    ]
  );
});
