import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import ts from 'typescript';
import {format} from 'date-fns';
import {calendarEventDate} from '../src/lib/calendar-event-date.ts';

// Execute the actual page's date expression: changing its parser must affect this test.
const text=readFileSync(new URL('../src/app/tournaments/[teamId]/waiver/[eventId]/page.tsx',import.meta.url),'utf8');
const source=ts.createSourceFile('page.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let expression;
function visit(node){
  if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(source)==='p'&&node.openingElement.attributes.properties.some(attr=>ts.isJsxAttribute(attr)&&attr.name.text==='className'&&attr.initializer?.text==='text-sm font-black uppercase')){
    expression=node.children.find(ts.isJsxExpression)?.expression?.getText(source);
  }
  ts.forEachChild(node,visit);
}
visit(source);
assert.ok(expression,'Tournament start-date expression must be present');
const javascript=ts.transpileModule(`return (${expression});`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
const label=new Function('event','format','calendarEventDate',javascript);

test('waiver start date preserves local calendar dates and safely handles legacy instants and invalid dates',()=>{
  const previous=process.env.TZ;process.env.TZ='America/Edmonton';
  try{
    assert.equal(label({date:'2026-10-12'},format,calendarEventDate),'Monday, Oct 12');
    assert.equal(label({date:'2026-10-12T01:00:00.000Z'},format,calendarEventDate),'Sunday, Oct 11');
    assert.equal(label({date:'not-a-date'},format,calendarEventDate),'TBD');
    assert.equal(label({date:''},format,calendarEventDate),'TBD');
  }finally{if(previous===undefined)delete process.env.TZ;else process.env.TZ=previous;}
});
