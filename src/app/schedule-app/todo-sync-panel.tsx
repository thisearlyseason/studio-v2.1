'use client';
import React, { useEffect, useRef, useState } from 'react';
import styles from './todo-sync-panel.module.css';
import type { User } from 'firebase/auth';
import { watchScheduleUser } from './sync';
import { loadScopedTodos } from './storage';
import { createTodoOutbox } from '@/lib/schedule-todos/outbox';
import { contextPrefix, type CloudTodo } from '@/lib/schedule-todos/model';

type Box = ReturnType<typeof createTodoOutbox>;
const newId = () => crypto.randomUUID();
/** Separate cloud list: the device-only list is never silently uploaded/replaced. */
export function TodoSyncPanel({ onExitBlockedChange, dark = false }: { onExitBlockedChange?: (blocked: boolean) => void; dark?: boolean } = {}) {
  const epoch = useRef(0);
  const operation = useRef<symbol | null>(null);
  const actor = useRef<User | null>(null);
  const box = useRef<Box | null>(null);
  const [view, setView] = useState<ReturnType<Box['view']>>({ uid: null, remote: [], pending: [], context: null, locked: true, retainedCount: 0, storageError: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [date, setDate] = useState('');
  const [review, setReview] = useState<{ uid: string; items: ReturnType<typeof loadScopedTodos> } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    onExitBlockedChange?.(busy || Boolean(text) || Boolean(date));
  }, [busy, text, date, onExitBlockedChange]);
  useEffect(() => () => onExitBlockedChange?.(false), [onExitBlockedChange]);
  useEffect(() => {
    let active = true;
    try {
      const controller = createTodoOutbox({ storage: localStorage, getAccount: () => actor.current, fetch: (...args) => fetch(...args), changed: () => { if (active) { try { const next=controller.view(); setView(next); if(next.locked){setReview(null);setConfirmed(false);setText('');setDate('');setMessage('');} } catch {setView({uid:null,remote:[],pending:[],context:null,locked:true,retainedCount:0,storageError:''});setError('Browser storage is unavailable. Private tasks are hidden.');} } } });
      box.current = controller;
      const unsubscribe = watchScheduleUser(user => {
        epoch.current++; operation.current=null;
        actor.current = user;
        setView({uid:user?.uid??null,remote:[],pending:[],context:null,locked:true,retainedCount:0,storageError:''});
        setReview(null);setText('');setDate('');
        controller.setAccount(user?.uid ?? null);
        setReview(null); setConfirmed(false); setError(''); setMessage(''); setText(''); setDate(''); setBusy(false);
      });
      const onStorage = () => controller.notify();
      window.addEventListener('storage', onStorage);
      return () => { window.removeEventListener('storage', onStorage); active = false; epoch.current++; unsubscribe(); controller.dispose(); box.current = null; actor.current = null; };
    } catch { setError('Browser storage is unavailable. Cloud task changes cannot be retained safely.'); }
  }, []);
  async function run(action: (controller: Box) => unknown | Promise<unknown>, success = '') {
    const controller = box.current, uid = actor.current?.uid, generation = epoch.current;
    if (!controller || !uid || operation.current) return;
    const owned=Symbol();operation.current=owned;
    setBusy(true); setError(''); setMessage('');
    try { await action(controller); if (actor.current?.uid === uid && epoch.current === generation) setMessage(success); }
    catch (e) { if (actor.current?.uid === uid && epoch.current === generation) setError(e instanceof Error ? e.message : 'Task operation failed. Pending edits are retained.'); }
    finally { if (actor.current?.uid === uid && epoch.current === generation) { if(operation.current===owned)operation.current=null;setBusy(false);try{setView(controller.view())}catch{setError('Browser storage unavailable; private tasks remain hidden.');} } }
  }
  function change(record: CloudTodo, remove = false) {
    void run(controller => controller.queue({ id: record.id, requestId: newId(), kind: remove ? 'delete' : 'update', expectedVersion: record.version, ...(remove ? {} : { fields: { text: record.text, dueDate: record.dueDate, completed: !record.completed } }) }), 'Queued on this browser. Send pending to save to your account.');
  }
  return <section className={styles.panel} data-theme={dark ? 'dark' : 'light'} aria-label="Account cloud tasks" aria-busy={busy}>
    <h2>Account cloud tasks</h2>
    <p className={styles.intro}>Send changes here to share them across devices. Device-only tasks stay separate.</p>
    <p className={styles.privacy}>Unsent edits are unencrypted on this browser. Clearing storage can lose them.</p>
    {!view.uid ? <p>Sign in to manage account cloud tasks.</p> : <>
      <p className={styles.identity}>Current account: {actor.current?.email || view.uid}</p>
      {view.locked ? <div><p>{view.retainedCount} retained browser changes. Private task contents are hidden. Resuming reveals unencrypted browser data for this account.</p><button disabled={busy} onClick={() => void run(c => c.resume(true), 'Browser edits opened for this account session.')}>Confirm resume private browser tasks</button></div> : <>
      <p role="status" className={styles.summary}>{view.pending.length} pending · {view.remote.filter(r => !r.deletedAt).length} saved copies cached.</p>
      <p>{view.context ? 'Queued changes are not saved until sent.' : 'Refresh saved tasks before adding a cloud task.'}</p>
      <div className={styles.actions}>
      <button disabled={busy} onClick={() => void run(c => c.refresh(), 'Saved account tasks refreshed.')}>Refresh saved tasks</button>
      <button className={styles.primary} disabled={busy || !view.pending.some(e => e.status === 'queued')} onClick={() => void run(async c => { await c.flush(); }, 'Send finished. Review pending items and conflicts below.')}>Send pending</button>
      <button disabled={busy || !view.pending.some(e => e.status === 'blocked')} onClick={() => void run(c => c.retryBlocked(), 'Blocked items queued again; Send pending to retry.')}>Retry blocked items</button>
      </div>
      {busy && <p role="status" aria-live="polite">Working…</p>}
      <form className={styles.form} onSubmit={e => { e.preventDefault(); void run(async c => { if(!view.context)throw Error('Refresh saved account tasks first.');const generation=epoch.current;await c.queue({ id: contextPrefix(view.context)+newId(), requestId: newId(), kind: 'create', expectedVersion: 0, fields: { text, dueDate: date, completed: false } }); if(epoch.current===generation){setText('');setDate('');} }, 'New task queued on this browser.'); }}>
        <div className={styles.fields}>
        <label>New cloud task<input disabled={busy} maxLength={500} placeholder="e.g. QA Sync Test A" required value={text} onChange={e => setText(e.target.value)} /></label>
        <label>Due date<input disabled={busy} type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
        </div>
        <button className={styles.primary} disabled={busy || !view.context || !text.trim() || !date}>Queue new task</button>
      </form>
      <button disabled={busy} onClick={() => void run(() => { const uid = actor.current!.uid; const items = loadScopedTodos(localStorage, uid); setReview({ uid, items }); setConfirmed(false); })}>Review this account’s device tasks for import</button>
      {review?.uid === view.uid && <div aria-label="Import review">
        <p>Review {review.items.length} device tasks for this account. Existing different server copies become conflicts. Original device tasks will be kept. After server cleanup, prior imports may no longer be deduplicated. Compare the saved list before confirming another import.</p>
        <ul>{review.items.map(t => <li key={t.id}>{t.text} · {t.dueDate} · {t.completed ? 'Completed' : 'Pending'}</li>)}</ul>
        <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm importing these tasks to the current account.</label>
        <button disabled={busy || !confirmed || !review.items.length} onClick={() => void run(async c => { if (review.uid !== actor.current?.uid) throw Error('Account changed. Review import again.'); await c.importLegacy(review.items, confirmed); setReview(null); setConfirmed(false); }, 'Import queued. Original device tasks kept. Send pending to save.')}>Queue confirmed import</button>
        <button onClick={() => { setReview(null); setConfirmed(false); }}>Cancel import</button>
      </div>}
      <h3>Saved cloud tasks</h3>
      {!view.remote.some(r => !r.deletedAt) && <p>{view.context ? 'No saved cloud tasks.' : 'Refresh to load saved tasks.'}</p>}
      <ul aria-label="Saved cloud tasks">{view.remote.filter(r => !r.deletedAt).map(r => <li key={r.id}><span className={styles.state}>Saved · {r.completed ? 'Completed' : 'Not completed'}</span>{r.text} · {r.dueDate}
        <button disabled={busy || view.pending.some(e => e.intent.id === r.id)} onClick={() => change(r)}>Queue completion change</button>
        <button disabled={busy || view.pending.some(e => e.intent.id === r.id)} onClick={() => change(r, true)}>Queue deletion</button>
      </li>)}</ul>
      {view.pending.length > 0 && <h3>Pending changes</h3>}
      <ul aria-label="Pending task changes">{view.pending.map(e => <li key={e.intent.requestId}>
        <p>{e.status}: {e.intent.fields?.text || 'Delete task'} {e.error}</p>
        {e.status === 'review' && <><p>Refresh saved tasks and compare them with this retained edit. An earlier send may already have saved. A new copy can duplicate a prior create. Imports must be previewed again.</p><button disabled={busy} onClick={() => { if(window.confirm('Discard this retained browser edit?'))void run(c=>c.reviewStale(e.intent.requestId,'discard',true)); }}>Discard retained edit</button><button disabled={busy || e.intent.kind==='import'} onClick={() => { if(window.confirm('I compared the saved list and understand this explicit resubmission may create a duplicate if an earlier send succeeded.'))void run(c=>c.reviewStale(e.intent.requestId,'resubmit',true),'Reviewed change queued; Send pending to save.'); }}>Confirm explicit resubmission</button></>}
        {e.status === 'conflict' && <><p>Local: {e.intent.fields?.text || 'Deletion'} · {e.intent.fields?.dueDate} · {String(e.intent.fields?.completed)}</p><p>Server: {e.current?.deletedAt ? 'Deleted' : e.current ? `${e.current.text} · ${e.current.dueDate} · ${e.current.completed}` : 'No current task returned'}</p>
          <button disabled={busy} onClick={() => void run(c => c.resolve(e.intent.requestId, 'server'), 'Pending change discarded. Refresh saved tasks to see the current server list.')}>Discard this pending change</button>
          <button disabled={busy || !e.current || !!e.current.deletedAt || !e.intent.fields} onClick={() => void run(c => c.resolve(e.intent.requestId, 'local', newId()), 'Local choice queued against the shown version; later changes can conflict again.')}>Queue local version against shown server version</button>
        </>}
      </li>)}</ul>
      </>}
    </>}
    {view.storageError && <p role="alert">{view.storageError}</p>}
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
