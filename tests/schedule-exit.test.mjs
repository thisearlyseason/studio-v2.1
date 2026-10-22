import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyTasksBeforeExit} from '../src/app/schedule-app/exit.ts';
import {todosStorageKey} from '../src/app/schedule-app/storage.ts';
const tasks=[{id:'fixture-1',text:'Offline fixture',dueDate:'2026-10-22',completed:false,createdAt:'2026-10-21'}];
function fixture(){const values=new Map([[todosStorageKey('A'),JSON.stringify(tasks)],['other-account','private'],['queued-outbox','unchanged']]);return{values,getItem:k=>values.get(k)??null}}
test('exit verifies saved account tasks without writing queues or other accounts',()=>{const s=fixture(),before=[...s.values];verifyTasksBeforeExit(s,'A',tasks);assert.deepEqual([...s.values],before)});
test('missing, different, or inaccessible saved copy blocks exit without overwrite',()=>{for(const value of [null,'[]',JSON.stringify([{...tasks[0],text:'Newer peer edit'}])]){const s=fixture();if(value===null)s.values.delete(todosStorageKey('A'));else s.values.set(todosStorageKey('A'),value);const before=[...s.values];assert.throws(()=>verifyTasksBeforeExit(s,'A',tasks));assert.deepEqual([...s.values],before)}assert.throws(()=>verifyTasksBeforeExit({getItem(){throw Error('blocked')}},'A',tasks))});
test('signed-out exit never accesses account storage',()=>{verifyTasksBeforeExit({getItem(){throw Error('must not read')}},'',tasks)});
