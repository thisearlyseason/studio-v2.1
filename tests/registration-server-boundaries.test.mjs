import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('public league and tournament submissions bind idempotency schema entitlement and payment in transactions',async()=>{
  const source=await readFile(new URL('../src/app/api/public/portals/action/route.ts',import.meta.url),'utf8');
  assert.match(source,/requestId = String\(body\.requestId/);
  assert.match(source,/submittedHash = String\(body\.formHash/);
  assert.match(source,/payload_hash: payloadHash/);
  assert.match(source,/existingEntry\.data\(\)\?\.payload_hash\s*!==\s*payloadHash/);
  assert.match(source,/transaction\.get\(configRef\)/);
  assert.match(source,/transaction\.get\(parentRef\)/);
  assert.match(source,/registrationPaymentSnapshot\(config\)/);
  assert.match(source,/protocolId}:\$\{registrantEmail}/);
  assert.match(source,/Linked squad authority changed/);
  assert.match(source,/registrationArchiveMatches\(existingArchive\.data\(\),expectedArchive\)/);
  assert.match(source,/formVersion:stored\.form_version,configHash:stored\.config_hash,payloadHash:stored\.payload_hash/);
  assert.match(source,/effectiveLeagueRegistrationConfig/);
  assert.match(source,/hasStaffRole\(memberData\)/);
  assert.doesNotMatch(source,/\.limit\(capacity\)/);
  assert.match(source,/registrationEntryCount/);
});

test('tournament waiver is actor squad and immutable version bound in one transaction',async()=>{
  const source=await readFile(new URL('../src/app/api/public/portals/action/route.ts',import.meta.url),'utf8');
  const waiver=source.slice(source.indexOf("      if (action === 'waiver')"),source.indexOf("    if (kind === 'league')",source.indexOf("      if (action === 'waiver')")));
  assert.match(waiver,/runTransaction/);
  assert.match(waiver,/transaction\.get\(codeRef\)/);
  assert.match(waiver,/transaction\.get\(teamAuthority\.teamRef\)/);
  assert.match(waiver,/sourceTeamId/);
  assert.match(waiver,/waiverHash/);
  assert.match(waiver,/configHash:configData\.config_hash/);
  assert.match(waiver,/transaction\.create\(archiveRef/);
  assert.match(waiver,/Number\(configData\.form_version\)!==expectedVersion/);
  assert.match(waiver,/receiptHash === receiptHash/);
  assert.match(waiver,/registrationArchiveMatches/);
  assert.match(waiver,/signedAt/);
  assert.match(waiver,/receiptHash/);
});

test('event registration rechecks fresh team event schema and request collision transactionally',async()=>{
  const source=await readFile(new URL('../src/app/api/public/event-registration/route.ts',import.meta.url),'utf8');
  assert.match(source,/formHash:/);
  assert.match(source,/transaction\.get\(registration\.team\.ref\)/);
  assert.match(source,/freshVersion !== submittedVersion \|\| freshHash !== submittedHash/);
  assert.match(source,/existing\.data\(\)\?\.payloadHash === payloadHash/);
  assert.match(source,/: 'collision'/);
  assert.match(source,/registrationOpen !== true/);
  assert.match(source,/Number\.isInteger\(Number\(rawCapacity\)\)/);
  assert.doesNotMatch(source,/\.limit\(capacity\)/);
  assert.match(source,/registrationCount:nextCount\.count/);
});

test('registration deletion reconciles entries waiver receipts and roster projections transactionally',async()=>{
  const source=await readFile(new URL('../src/app/api/public/portals/action/route.ts',import.meta.url),'utf8');
  const deletion=source.slice(source.indexOf("    if (action === 'delete-registration'"),source.indexOf("    if (action === 'lookup-team')"));
  assert.match(deletion,/runTransaction/);
  assert.match(deletion,/transaction\.delete\(entryRef\)/);
  assert.match(deletion,/archived_waivers/);
  assert.match(deletion,/tournamentTeamsData:/);
  assert.match(deletion,/individualRecruits/);
  assert.match(deletion,/Registration cannot be deleted after the bracket is published/);
  assert.match(deletion,/teamAgreements/);
  assert.match(deletion,/arch_tournament_/);
  assert.match(deletion,/agreement\.archiveId/);
  assert.match(deletion,/registrationArchiveMatches/);
  assert.match(deletion,/receiptHash/);
  assert.match(deletion,/LEGACY_REGISTRATION_SCAN_LIMIT/);
});

test('legacy counters are migrated from a bounded exact transaction query before create or delete',async()=>{
  const event=await readFile(new URL('../src/app/api/public/event-registration/route.ts',import.meta.url),'utf8');
  const portal=await readFile(new URL('../src/app/api/public/portals/action/route.ts',import.meta.url),'utf8');
  for(const source of[event,portal]){
    assert.match(source,/LEGACY_REGISTRATION_SCAN_LIMIT\s*=\s*100001/);
    assert.match(source,/registrationCountFromLegacy/);
    assert.match(source,/\.limit\(LEGACY_REGISTRATION_SCAN_LIMIT\)/);
  }
});

test('builders retain server versions and protected ledger writes do not use direct client mutation',async()=>{
  const league=await readFile(new URL('../src/app/(dashboard)/leagues/registration/[leagueId]/page.tsx',import.meta.url),'utf8');
  const tournament=await readFile(new URL('../src/app/(dashboard)/manage-tournaments/registration/[teamId]/[eventId]/page.tsx',import.meta.url),'utf8');
  const provider=await readFile(new URL('../src/components/providers/team-provider.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(league,/form_version: \(localConfig\?\.form_version \|\| 0\) \+ 1/);
  assert.match(league,/setLocalConfig\(saved\)/);
  assert.match(tournament,/setLocalConfig\(\{ \.\.\.updated, \.\.\.payload\.config/);
  assert.doesNotMatch(provider,/addDoc\(collection\(entryParentRef, 'registrationEntries'/);
  assert.match(provider,/api\/public\/portals\/action/);
  assert.doesNotMatch(provider,/registrationEntries', entryId\), \{ payment_received/);
});
