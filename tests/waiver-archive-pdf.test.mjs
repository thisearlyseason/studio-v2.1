import test from 'node:test';
import assert from 'node:assert/strict';
import { createWaiverArchivePdf } from '../src/lib/waiver-archive-pdf.ts';
test('long waiver archives retain every clause across branded, numbered pages', () => {
 const clauses=Array.from({length:90},(_,i)=>`CLAUSE-${i+1}: The participant acknowledges all organizer instructions for this event.`);
 const pdf=createWaiverArchivePdf('League QA',[{id:'record-1',signer:'QA Signer',signedAt:'2026-09-21T12:00:00Z',type:'Squad',waiverText:clauses.join('\n\n')}]);
 const raw=pdf.output();
 assert.ok(pdf.getNumberOfPages()>3);
 for(let i=1;i<=90;i++)assert.ok(raw.includes(`CLAUSE-${i}:`),`missing clause ${i}`);
 for(let page=1;page<=pdf.getNumberOfPages();page++)assert.ok(raw.includes(`(${page} / ${pdf.getNumberOfPages()})`));
 assert.ok(raw.includes('Electronic signature record'.toUpperCase()));
 assert.ok(!raw.includes('cryptographically timestamped'));
});
