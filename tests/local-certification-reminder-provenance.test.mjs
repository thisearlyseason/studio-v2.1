import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {selectCaseOwnedOperationAssertions} from '../scripts/qa/certification/local/batches/operations.mjs';
import * as runtime from '../scripts/qa/certification/local/reminder-runtime.mjs';

test('Reminder runtime executes tracked source without reading a missing or stale generated lib', async () => {
  assert.equal(typeof runtime.loadReminderSchedulerCore, 'function');
  const root=mkdtempSync(path.join(tmpdir(),'reminder-source-'));
  try {
    mkdirSync(path.join(root,'functions/src'),{recursive:true});
    mkdirSync(path.join(root,'functions/lib'),{recursive:true});
    writeFileSync(path.join(root,'functions/package.json'),execFileSync('git',['show','HEAD:functions/package.json']));
    for(const file of ['event-reminder-runner.ts','event-reminders.ts','reminder-delivery.ts']) {
      writeFileSync(path.join(root,'functions/src',file),execFileSync('git',['show',`HEAD:functions/src/${file}`]));
    }
    writeFileSync(path.join(root,'functions/lib/event-reminder-runner.js'),'throw new Error("stale generated Reminder runtime executed");');
    const runCore=await runtime.loadReminderSchedulerCore(root);
    const ledgers=[];
    const result=await runCore({
      now:new Date('2026-03-08T15:00:00Z'),
      listEvents:async()=>[{teamId:'team-a',eventId:'eligible',event:{date:'2026-03-08',startTime:'11:00'}}],
      getTeam:async()=>({timeZone:'America/Edmonton'}),
      listMembers:async()=>[{userId:'parent',status:'active'}],
      getUser:async()=>({role:'parent',notificationsEnabled:true,upcomingEventNotificationsEnabled:true,fcmTokens:['local-safe']}),
      claim:async()=>true,
      markSent:async entry=>ledgers.push(entry),
      markFailed:async()=>assert.fail('eligible delivery failed'),
      deliver:async()=>({successCount:1,failureCount:0}),
    });
    assert.deepEqual(result,{sentCount:1,failedCount:0,claimedCount:1});
    assert.deepEqual(ledgers,[{teamId:'team-a',eventId:'eligible',userId:'parent',successCount:1,failureCount:0}]);
  } finally { rmSync(root,{recursive:true,force:true}); }
});

test('rem-eligible selection requires every exact role ledger and each FCM and Web Push observation',()=>{
  assert.ok(Array.isArray(runtime.REMINDER_ELIGIBLE_ASSERTION_PATTERNS));
  const labels=['Reminder scheduler core sends one same-day eligible FCM and Web Push delivery'];
  for(const alias of ['qa-parent-a','qa-adult-player-a','qa-youth-active']) {
    labels.push(`Reminder scheduler writes one same-day PA/AP/YP delivery ledger for ${alias}`);
    labels.push(`Reminder scheduler eligible FCM target for ${alias}`);
    labels.push(`Reminder scheduler eligible Web Push target for ${alias}`);
  }
  const assertions=labels.map((label,index)=>({id:`assertion-${index}`,label}));
  const selected=selectCaseOwnedOperationAssertions(assertions,runtime.REMINDER_ELIGIBLE_ASSERTION_PATTERNS);
  assert.deepEqual(new Set(selected.map(item=>item.id)),new Set(assertions.map(item=>item.id)));
  for(let omitted=1;omitted<assertions.length;omitted++) assert.throws(()=>selectCaseOwnedOperationAssertions(assertions.filter((_,i)=>i!==omitted),runtime.REMINDER_ELIGIBLE_ASSERTION_PATTERNS));
  assert.throws(()=>selectCaseOwnedOperationAssertions(assertions.slice(0,1),runtime.REMINDER_ELIGIBLE_ASSERTION_PATTERNS));
});
