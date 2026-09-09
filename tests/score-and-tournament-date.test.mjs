import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { transform } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { format } from 'date-fns';
import { calendarEventDate } from '../src/lib/calendar-event-date.ts';

// Execute the real page calculations and JSX; only hook inputs are supplied by
// the harness. This catches a consumer reverting to Date's UTC date-only parser.
const gamesPath = new URL('../src/app/(dashboard)/games/page.tsx', import.meta.url);
const tournamentPath = new URL('../src/app/register/tournament/[teamId]/[eventId]/page.tsx', import.meta.url);
const tree = ts.createSourceFile('page.tsx', await readFile(gamesPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function find(tree, predicate) {
  let found;
  function visit(node) { if (!found && predicate(node)) found = node; if (!found) ts.forEachChild(node, visit); }
  visit(tree);
  assert.ok(found, 'Production page expression must exist');
  return found;
}
const declarations = ['games', 'recordedEventIds', 'allScheduleItems', 'chartData'].map(name =>
  find(tree, node => ts.isVariableDeclaration(node) && node.name.getText(tree) === name).parent.parent.getText(tree)).join('\n');
const calculations = (await transform(`${declarations}\nreturn {games, allScheduleItems, chartData};`, {loader:'ts'})).code;
function model(rawGames, activeTeamEvents = []) {
  return new Function('rawGames', 'activeTeamEvents', 'activeTeam', 'useMemo', 'calendarEventDate', 'format', calculations)(
    rawGames, activeTeamEvents, {id:'squad',name:'Squad'}, fn => fn(), calendarEventDate, format);
}
const tournament = ts.createSourceFile('tournament.tsx', await readFile(tournamentPath, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const timelineLabel = find(tournament, node => ts.isJsxText(node) && node.text.trim() === 'Timeline');
const timeline = timelineLabel.parent.parent.getText(tournament);
const timelineCode = (await transform(`return (${timeline});`, {loader:'tsx',jsxFactory:'React.createElement'})).code;
function renderTimeline(event) {
  return renderToStaticMarkup(new Function('React', 'event', 'format', 'calendarEventDate', timelineCode)(React, event, format, calendarEventDate));
}

for (const zone of ['America/Edmonton', 'Pacific/Auckland']) {
  test(`score history/chart and public tournament dates retain calendar days in ${zone}`, () => {
    const prior = process.env.TZ;
    process.env.TZ = zone;
    try {
      const result = model([{id:'recorded',date:'2026-10-01',myScore:3,opponentScore:1}],
        [{id:'scheduled',date:'2026-10-02',eventType:'game',title:'Squad vs Tigers'}]);
      assert.equal(format(result.allScheduleItems[1].displayDate, 'yyyy-MM-dd'), '2026-10-01');
      assert.equal(format(result.allScheduleItems[0].displayDate, 'yyyy-MM-dd'), '2026-10-02');
      assert.equal(result.chartData[0].date, 'Oct 1');
      const markup = renderTimeline({date:'2026-10-01',endDate:'2026-10-02'});
      assert.match(markup, /Oct 1/);
      assert.match(markup, /Oct 2/);
      const instant = '2026-10-01T01:00:00.000Z';
      assert.equal(model([{date:instant}]).games[0].date.getTime(), Date.parse(instant));
    } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
  });
}

test('malformed historical dates do not crash score history or public registration', () => {
  const result = model([{id:'malformed',date:'not-a-date'}]);
  assert.equal(result.allScheduleItems.length, 1, 'Keep the record accessible for correction');
  assert.deepEqual(result.chartData, []);
  assert.match(renderTimeline({date:'not-a-date',endDate:'invalid'}), /TBA/);
});

test('related League ledger, calendar card and PDF export use the same local match day', async () => {
  const source = await readFile(new URL('../src/app/(dashboard)/leagues/leagues-page-content.tsx', import.meta.url), 'utf8');
  const league = ts.createSourceFile('league.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const expressions = [];
  let helper = '';
  function visit(node) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === 'formatLeagueScheduleDate') helper = node.getText(league);
    if (ts.isCallExpression(node) && ['format', 'formatLeagueScheduleDate'].includes(node.expression.getText(league))
      && /^(new Date\()?g(ame)?\.date\)?$/.test(node.arguments[0]?.getText(league) ?? '')) expressions.push(node.getText(league));
    ts.forEachChild(node, visit);
  }
  visit(league);
  assert.equal(expressions.length, 3);
  const code = (await transform(`${helper}\nreturn [${expressions.join(',')}];`, {loader:'ts'})).code;
  const prior = process.env.TZ;
  process.env.TZ = 'America/Edmonton';
  try {
    const evaluate = value => new Function('g', 'game', 'format', 'calendarEventDate', code)({date:value},{date:value},format,calendarEventDate);
    assert.deepEqual(evaluate('2026-10-01'), ['October 1, 2026', 'Oct 1, 2026', 'Oct 1, 2026']);
    assert.deepEqual(evaluate('invalid'), ['Date unavailable', 'Date unavailable', 'Date unavailable']);
  } finally { if (prior === undefined) delete process.env.TZ; else process.env.TZ = prior; }
});
