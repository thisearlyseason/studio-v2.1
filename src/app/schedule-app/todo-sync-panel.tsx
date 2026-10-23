'use client';
import React, { useEffect, useRef, useState } from 'react';
import styles from './todo-sync-panel.module.css';
import type { User } from 'firebase/auth';
import { freshTodoId, cloudTaskCapabilityError } from '@/lib/schedule-todos/compat';
import { createAutomaticTasks } from '@/lib/schedule-todos/automatic';
import { watchScheduleUser } from './sync';
import { loadScopedTodos } from './storage';
import { createTodoOutbox, type Entry } from '@/lib/schedule-todos/outbox';
import { contextPrefix, type CloudTodo, type TodoFields } from '@/lib/schedule-todos/model';

type Box = ReturnType<typeof createTodoOutbox>;
type View = ReturnType<Box['view']>;
const hidden = (uid: string | null = null): View => ({ uid, remote: [], pending: [], context: null, locked: true, retainedCount: 0, storageError: '' });
const completion = (value: boolean) => value ? 'Completed' : 'Not completed';
export function TodoSyncPanel({ onExitBlockedChange, dark = false }: { onExitBlockedChange?: (blocked: boolean) => void; dark?: boolean } = {}) {
  const epoch = useRef(0), actor = useRef<User | null>(null), box = useRef<Box | null>(null);
  const pump = useRef<ReturnType<typeof createAutomaticTasks> | null>(null);
  const [view, setView] = useState<View>(hidden());
  const [error, setError] = useState(''), [unsupported, setUnsupported] = useState('');
  const [busy, setBusy] = useState(false), [saving, setSaving] = useState(false), [online, setOnline] = useState(true);
  const [text, setText] = useState(''), [date, setDate] = useState('');
  const [editing, setEditing] = useState<CloudTodo | null>(null);
  const [review, setReview] = useState<{ uid: string; items: ReturnType<typeof loadScopedTodos> } | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const localAction = useRef(false);
  const renderedEpoch = epoch.current;
  useEffect(() => { onExitBlockedChange?.(busy || Boolean(text) || Boolean(date)); }, [busy, text, date, onExitBlockedChange]);
  useEffect(() => () => onExitBlockedChange?.(false), [onExitBlockedChange]);
  useEffect(() => {
    let active = true;
    const unavailable = cloudTaskCapabilityError();
    if (unavailable) { setUnsupported(unavailable); return; }
    function publish(controller: Box) {
      if (!active) return;
      const next = controller.view(); setView(next);
      if (next.locked) { setReview(null); setConfirmed(false); setText(''); setDate(''); setEditing(null); }
    }
    try {
      const controller = createTodoOutbox({ storage: localStorage, getAccount: () => actor.current, fetch: (...args) => fetch(...args), changed: () => {
        if (!active) return;
        publish(controller); pump.current?.wake();
      } });
      box.current = controller;
      const automatic = createAutomaticTasks({
        eligible: () => Boolean(active && actor.current?.uid && controller.view().uid === actor.current.uid && !controller.view().locked && !localAction.current),
        online: () => navigator.onLine,
        pending: () => controller.view().pending.some(e => e.status === 'queued' && e.delivery === 'automatic'),
        synchronize: async refresh => {
          const accountEpoch = epoch.current; setSaving(true);
          try {
            // Save with the original version first. Refresh must never rebase an edit.
            const hadPending = controller.view().pending.some(e => e.status === 'queued' && e.delivery === 'automatic');
            await controller.flush({ automaticOnly: true });
            if ((refresh || hadPending) && active && accountEpoch === epoch.current) await controller.refresh();
            if (active && accountEpoch === epoch.current) setError('');
          } catch (error) { if (active && accountEpoch === epoch.current) throw error; } finally { if (active && accountEpoch === epoch.current) setSaving(false); }
        },
        failed: () => { if (active) setError('Could not connect. Your changes stay on this device and will try again.'); },
      });
      pump.current = automatic;
      const unsubscribe = watchScheduleUser(user => {
        epoch.current++; actor.current = user; localAction.current = false;
        setView(hidden(user?.uid ?? null)); setReview(null); setText(''); setDate(''); setEditing(null);
        setConfirmed(false); setError(''); setBusy(false); setSaving(false);
        controller.setAccount(user?.uid ?? null); automatic.wake(true);
      });
      const onStorage = () => { controller.notify(); automatic.wake(); };
      const onOnline = () => { setOnline(navigator.onLine); if (navigator.onLine) automatic.wake(true); };
      const onFocus = () => { if (document.visibilityState === 'visible') automatic.wake(true); };
      setOnline(navigator.onLine);
      window.addEventListener('storage', onStorage); window.addEventListener('online', onOnline); window.addEventListener('offline', onOnline);
      window.addEventListener('focus', onFocus); document.addEventListener('visibilitychange', onFocus);
      const interval = window.setInterval(onFocus, 30000);
      return () => {
        active = false; epoch.current++; automatic.stop(); pump.current = null; unsubscribe();
        window.clearInterval(interval); window.removeEventListener('storage', onStorage);
        window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOnline);
        window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus);
        controller.dispose(); box.current = null; actor.current = null;
      };
    } catch { setError('This browser cannot safely save task changes. Existing tasks have not been removed.'); }
  }, []);
  async function run(action: (controller: Box) => unknown | Promise<unknown>) {
    const controller = box.current, uid = actor.current?.uid, generation = epoch.current;
    if (!controller || !uid || uid !== view.uid || epoch.current !== renderedEpoch || localAction.current) return;
    localAction.current = true; setBusy(true); setError('');
    try { await action(controller); }
    catch (e) { if (actor.current?.uid === uid && epoch.current === generation) setError(e instanceof Error ? e.message : 'Could not save. Your edit is still here.'); }
    finally { if (actor.current?.uid === uid && epoch.current === generation) { localAction.current = false; setBusy(false); setView(controller.view()); pump.current?.wake(); } }
  }
  function save(record: CloudTodo, fields: TodoFields) {
    void run(c => c.queue({ id: record.id, requestId: freshTodoId(), kind: 'update', expectedVersion: record.version, fields }, { automatic: true }));
  }
  function describe(entry: Entry) {
    const f = entry.intent.fields;
    return f ? `${f.text} · ${f.dueDate} · ${completion(f.completed)}` : `Delete ${view.remote.find(r => r.id === entry.intent.id)?.text || entry.current?.text || 'this task'}`;
  }
  const unreadable = Math.max(0, view.retainedCount - view.pending.length);
  const unresolved = view.pending.filter(e => e.status !== 'queued' || e.delivery !== 'automatic');
  const rows = new Map(view.remote.filter(r => !r.deletedAt).map(r => [r.id, r]));
  for (const e of view.pending) {
    if (e.intent.kind === 'delete') continue;
    if (e.intent.fields && (e.status === 'queued' || !rows.has(e.intent.id))) rows.set(e.intent.id, { ...e.intent.fields, id: e.intent.id, version: e.intent.expectedVersion, deletedAt: null, updatedAt: '', createdAt: '' } as CloudTodo);
  }
  const sorted = [...rows.values()].sort((a, b) => Number(a.completed) - Number(b.completed) || a.dueDate.localeCompare(b.dueDate) || a.text.localeCompare(b.text));
  const status = text || date ? 'Unsaved changes' : !online ? (view.pending.length ? 'Offline · changes saved on this device' : 'Offline · showing saved tasks') : saving ? 'Saving…' : unresolved.length || unreadable ? 'A change needs your attention' : view.pending.length ? 'Waiting to save…' : view.context ? 'All changes saved' : 'Loading tasks…';
  if (unsupported) return <section className={styles.panel} aria-label="My tasks"><h2>My tasks</h2><p role="alert">Task syncing is not available in this browser. Use an updated browser to share tasks across devices. Your existing tasks are unchanged.</p></section>;
  return <section className={styles.panel} data-theme={dark ? 'dark' : 'light'} aria-label="My tasks">
    <header className={styles.heading}><h2>My tasks</h2>{view.uid && !view.locked && <span role="status" aria-live="polite" className={styles.summary}>{status}</span>}</header>
    {!view.uid ? <p><a href="/login?returnTo=%2Fschedule-app">Sign in to see your tasks</a></p> : <>
      <p className={styles.identity}>{actor.current?.email || 'Your account'} · shared across your devices</p>
      {view.locked ? <div className={styles.notice}><p>Tasks were kept on this device for your account. They are stored without encryption. Open them only if this is your account.</p><p>Opening resumes automatic saving for edits made with automatic sync. Older unsent edits still need your review.</p><button disabled={busy} onClick={() => void run(c => { c.resume(true); pump.current?.wake(true); })}>Open my saved tasks</button></div> : <>
        {unreadable > 0 && <p role="alert">{unreadable} saved {unreadable === 1 ? 'edit could' : 'edits could'} not be opened. They remain on this device and will not be sent automatically. Their online save status could not be verified. Do not clear browser storage.</p>}
        <form className={styles.form} onSubmit={e => { e.preventDefault(); void run(async c => {
          if (!view.context) throw Error('Connect once to load your tasks before adding one.');
          const generation = epoch.current;
          if (editing) await c.queue({ id: editing.id, requestId: freshTodoId(), kind: 'update', expectedVersion: editing.version, fields: { text: text.trim(), dueDate: date, completed: editing.completed } }, { automatic: true });
          else await c.queue({ id: contextPrefix(view.context) + freshTodoId(), requestId: freshTodoId(), kind: 'create', expectedVersion: 0, fields: { text: text.trim(), dueDate: date, completed: false } }, { automatic: true });
          if (epoch.current === generation) { setText(''); setDate(''); setEditing(null); }
        }); }}>
          <div className={styles.fields}><label>Task name<input disabled={busy} maxLength={500} placeholder="What needs to get done?" required value={text} onChange={e => setText(e.target.value)} /></label><label>Due date<input disabled={busy} type="date" required value={date} onChange={e => setDate(e.target.value)} /></label></div>
          <button className={styles.primary} disabled={busy || !view.context || !text.trim() || !date}>{editing ? 'Save changes' : 'Add task'}</button>
          {editing && <button type="button" onClick={() => { setEditing(null); setText(''); setDate(''); }}>Cancel edit</button>}
          {editing && <button className={styles.danger} type="button" disabled={busy} onClick={() => {
            if (!window.confirm(`Delete “${editing.text}”? It will be removed from all your devices when this change saves.`)) return;
            void run(async c => {
              const generation = epoch.current;
              await c.queue({ id: editing.id, requestId: freshTodoId(), kind: 'delete', expectedVersion: editing.version }, { automatic: true });
              if (generation === epoch.current) { setEditing(null); setText(''); setDate(''); }
            });
          }}>Delete task</button>}
        </form>
        {!sorted.length && view.context && <p className={styles.empty}>Nothing to do yet. Add a task above.</p>}
        <ul aria-label="Tasks" className={styles.tasks}>{sorted.map(r => {
          const pending = view.pending.find(e => e.intent.id === r.id);
          return <li key={r.id} className={styles.task}>
            <label className={styles.check}><input aria-label={`Complete ${r.text}`} type="checkbox" checked={r.completed} disabled={busy || Boolean(pending)} onChange={() => save(r, { text: r.text, dueDate: r.dueDate, completed: !r.completed })} /><span className={r.completed ? styles.completed : ''}>{r.text}</span></label>
            <span className={styles.due}><time dateTime={r.dueDate}>{r.dueDate}</time>{pending && <small>{pending.status === 'queued' && pending.delivery === 'automatic' ? pending.intent.kind === 'delete' ? online ? 'Deleting…' : 'Will delete when online' : 'Not saved online yet' : 'Needs review'}</small>}</span>
            <button disabled={busy || Boolean(pending) || Boolean(editing)} aria-label={`Edit ${r.text}`} onClick={() => { setEditing(r); setText(r.text); setDate(r.dueDate); }}>Edit</button>
          </li>;
        })}</ul>
        {unresolved.length > 0 && <section className={styles.notice} aria-label="Changes to review"><h3>Review your changes</h3><ul>{unresolved.map(e => <li key={e.intent.requestId}>
          <p>Your change: {describe(e)}</p>
          {e.status === 'queued' && e.delivery !== 'automatic' && <><p>This edit was saved before automatic syncing. It will not be sent automatically; review it before saving.</p><button disabled={busy} onClick={() => void run(c => c.approveAutomatic(e.intent.requestId))}>Save this change online</button></>}
          {e.status === 'blocked' && <><p>We could not verify permission to save this edit. It stays on this device.</p><button disabled={busy} onClick={() => void run(c => c.retryBlocked())}>Try saving again</button></>}
          {e.status === 'review' && <><p>{e.intent.kind === 'delete' ? 'This older deletion will not be reapplied. Remove the unsent deletion, review the current task, and choose Delete again if wanted.' : 'This older edit needs comparing with your saved tasks. It may already have saved on another device.'}</p>{e.intent.kind !== 'delete' && <button disabled={busy || !view.context || e.intent.kind === 'import'} onClick={() => { if (window.confirm('I compared this edit with my saved tasks. Save it again? A previously saved task may appear twice.')) void run(async c => { await c.reviewStale(e.intent.requestId, 'resubmit', true, { automatic: true, shownContext: view.context!, shownTask: view.remote.find(r => r.id === e.intent.id) ?? null }); pump.current?.wake(true); }); }}>Save reviewed change</button>}<button disabled={busy} onClick={() => { if (window.confirm('Remove only this unsent edit? Saved tasks will be kept.')) void run(c => c.reviewStale(e.intent.requestId, 'discard', true)); }}>Remove unsent edit</button></>}
          {e.status === 'conflict' && <><p>This task changed on another device. Your edit is safe here.</p><p>Saved version: {e.current?.deletedAt ? 'Task removed' : e.current ? `${e.current.text} · ${e.current.dueDate} · ${completion(e.current.completed)}` : 'Connect to check the saved task'}</p>
            <button disabled={busy} onClick={() => void run(async c => { await c.resolve(e.intent.requestId, 'server'); await c.refresh(); })}>Use saved version</button>
            <button disabled={busy || !e.current || !!e.current.deletedAt || (!e.intent.fields && e.intent.kind !== 'delete')} onClick={() => {
              if (e.intent.kind === 'delete' && !window.confirm('Delete the updated task from all your devices?')) return;
              void run(async c => { await c.resolve(e.intent.requestId, 'local', freshTodoId(), { automatic: true, shownCurrent: e.current!, shownContext: view.context! }); });
            }}>{e.intent.kind === 'delete' ? 'Delete updated task' : 'Save my version instead'}</button>
          </>}
        </li>)}</ul></section>}
        <details className={styles.options}><summary>Task options</summary><p>Changes save automatically while online. Offline edits stay on this device and save when you reconnect. Copies on this device are not encrypted.</p><button disabled={busy || saving || !online} onClick={() => pump.current?.wake(true)}>Check for updates</button>
          <button disabled={busy} onClick={() => void run(() => { const uid = actor.current!.uid; setReview({ uid, items: loadScopedTodos(localStorage, uid) }); setConfirmed(false); })}>Bring in older device tasks</button>
          {review?.uid === view.uid && <div aria-label="Import review"><p>Bring these {review.items.length} older tasks into your account? The originals stay on this device. Compare them with your saved list first to avoid duplicates.</p><ul>{review.items.map(t => <li key={t.id}>{t.text} · {t.dueDate} · {completion(t.completed)}</li>)}</ul><label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />These are my tasks and I want to add them to this account.</label><button disabled={busy || !confirmed || !review.items.length} onClick={() => void run(async c => { if (review.uid !== actor.current?.uid) throw Error('Account changed. Review your tasks again.'); await c.importLegacy(review.items, confirmed, { automatic: true }); setReview(null); setConfirmed(false); })}>Add reviewed tasks</button><button onClick={() => { setReview(null); setConfirmed(false); }}>Cancel</button></div>}
        </details>
      </>}
    </>}
    {view.storageError && <p role="alert">{view.storageError}</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
