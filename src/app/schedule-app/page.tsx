'use client';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { syncFromFirestore, SyncEvent, SyncResult } from './sync';

const TODO_KEY = 'squad_schedule_todos';
const THEME_KEY = 'squad_schedule_theme';

interface TodoItem { id: string; text: string; dueDate: string; completed: boolean; createdAt: string; }
type Tab = 'schedule' | 'todos';
type Theme = 'dark' | 'light';

const RED = '#C41230';
const EVENT_COLORS: Record<string, string> = {
  game: RED, practice: '#7c3aed', tournament: '#f59e0b', meeting: '#3b82f6', other: '#6b7280',
};
const EVENT_LABELS: Record<string, string> = {
  game: 'Game', practice: 'Practice', tournament: 'Tournament', meeting: 'Meeting', other: 'Other',
};

function fmt(d: string) {
  try { return new Date(d + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); } catch { return d; }
}
function fmtTime(t?: string) {
  if (!t) return '';
  // Already in 12h format e.g. "08:00 PM"
  if (/[ap]m/i.test(t)) return t.trim();
  // 24h format e.g. "20:00" or "20:00:00"
  try {
    const parts = t.split(':');
    const h = Number(parts[0]);
    const m = Number(parts[1]);
    if (isNaN(h) || isNaN(m)) return t;
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
  } catch { return t; }
}
function todayStr() { return new Date().toISOString().slice(0, 10); }
function genId() { return Math.random().toString(36).slice(2, 10); }

export default function ScheduleApp() {
  const [tab, setTab] = useState<Tab>('schedule');
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [syncSource, setSyncSource] = useState<string>('');
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncTeamId, setSyncTeamId] = useState<string>('');
  const [teamName, setTeamName] = useState<string>('');
  const [theme, setTheme] = useState<Theme>('light');
  const [showInstall, setShowInstall] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<SyncEvent | null>(null);
  const [newText, setNewText] = useState('');
  const [newDue, setNewDue] = useState(todayStr());
  const [addOpen, setAddOpen] = useState(false);
  const textRef = useRef<HTMLInputElement>(null);
  const isIOS = typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent);

  const doSync = useCallback(async () => {
    setSyncing(true);
    setSyncError(null);
    try {
      const result: SyncResult = await syncFromFirestore();
      setEvents(result.events);
      setSyncSource(result.source);
      if (result.teamName) setTeamName(result.teamName);
      if (result.teamId) setSyncTeamId(result.teamId);
      if (result.error) setSyncError(result.error);
      setLastSync(new Date().toLocaleTimeString());
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    try {
      const t = localStorage.getItem(THEME_KEY) as Theme;
      if (t === 'light' || t === 'dark') setTheme(t);
      const saved = localStorage.getItem(TODO_KEY);
      if (saved) setTodos(JSON.parse(saved));
    } catch {}
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    const h = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', h);
    window.addEventListener('appinstalled', () => setInstalled(true));
    if (window.matchMedia('(display-mode: standalone)').matches) setInstalled(true);
    doSync();
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, [doSync]);

  useEffect(() => {
    if (!mounted) return;
    try { localStorage.setItem(TODO_KEY, JSON.stringify(todos)); } catch {}
  }, [todos, mounted]);

  const toggleTheme = () => {
    const next: Theme = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { localStorage.setItem(THEME_KEY, next); } catch {}
  };

  const dark = theme === 'dark';
  const bg = dark ? '#09090b' : '#f4f4f5';
  const surface = dark ? '#18181b' : '#ffffff';
  const border = dark ? '#27272a' : '#e4e4e7';
  const text = dark ? '#fafafa' : '#09090b';
  const muted = dark ? '#71717a' : '#71717a';
  const cardBg = dark ? '#18181b' : '#ffffff';

  const upcoming = events
    .filter(e => { const d = new Date(e.date + 'T00:00:00'); const now = new Date(); const max = new Date(); max.setDate(now.getDate() + 90); return d >= new Date(now.toDateString()) && d <= max; })
    .sort((a, b) => a.date.localeCompare(b.date));

  const pending = todos.filter(t => !t.completed).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const done = todos.filter(t => t.completed);

  const addTodo = () => {
    if (!newText.trim()) return;
    setTodos(p => [...p, { id: genId(), text: newText.trim(), dueDate: newDue || todayStr(), completed: false, createdAt: new Date().toISOString() }]);
    setNewText(''); setNewDue(todayStr()); setAddOpen(false);
  };

  const S = {
    root: { minHeight: '100dvh', background: bg, color: text, fontFamily: 'Inter, system-ui, sans-serif', transition: 'background 0.3s, color 0.3s' } as React.CSSProperties,
    header: { background: dark ? 'rgba(9,9,11,0.97)' : 'rgba(255,255,255,0.97)', backdropFilter: 'blur(12px)', borderBottom: `2px solid ${RED}`, position: 'sticky' as const, top: 0, zIndex: 50, padding: '12px 16px' },
    btn: (accent?: string) => ({ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 20, border: `1px solid ${accent || border}`, background: accent ? accent + '22' : 'transparent', color: accent || text, cursor: 'pointer', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: '0.08em' }),
    card: { background: cardBg, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderLeftWidth: 1, borderStyle: 'solid', borderColor: border, borderRadius: 16, padding: '14px 16px', marginBottom: 10, cursor: 'pointer' } as React.CSSProperties,
    input: { width: '100%', background: dark ? '#09090b' : '#f4f4f5', border: `1px solid ${border}`, borderRadius: 10, padding: '10px 12px', color: text, fontSize: 14, boxSizing: 'border-box' as const },
  };

  if (!mounted) return null;

  return (
    <div style={S.root}>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}} @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
      <div style={{ height: 'env(safe-area-inset-top)' }} />

      {/* Header */}
      <header style={S.header}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: 600, margin: '0 auto' }}>
          <div>
            <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.15em', textTransform: 'uppercase', color: RED, margin: 0 }}>{teamName || 'Squad'}</p>
            <h1 style={{ fontSize: 20, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', margin: 0 }}>My Schedule</h1>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Theme toggle */}
            <button onClick={toggleTheme} style={{ ...S.btn(), padding: '8px 12px', fontSize: 16 }} title="Toggle theme">
              {dark ? '☀️' : '🌙'}
            </button>

            {/* Sync */}
            <button onClick={doSync} disabled={syncing} style={{ ...S.btn(RED), opacity: syncing ? 0.7 : 1 }}>
              <span style={{ display: 'inline-block', animation: syncing ? 'spin 1s linear infinite' : 'none', fontSize: 13 }}>🔄</span>
              <span>{syncing ? 'Syncing…' : 'Sync'}</span>
            </button>

            {/* Install */}
            {!installed && (
              <button onClick={installPrompt ? async () => { installPrompt.prompt(); const { outcome } = await installPrompt.userChoice; if (outcome === 'accepted') setInstalled(true); } : () => setShowInstall(true)} style={S.btn('#22c55e')}>
                <span style={{ fontSize: 13 }}>📲</span><span>Install</span>
              </button>
            )}
          </div>
        </div>

        {/* Sync status bar */}
        <div style={{ maxWidth: 600, margin: '6px auto 0' }}>
          {syncing ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#7c3aed' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#7c3aed', animation: 'pulse 1s ease infinite' }} />
              Fetching events from Firestore…
            </div>
          ) : lastSync ? (
            <div style={{ fontSize: 11, color: syncSource === 'firestore' ? '#22c55e' : '#f59e0b' }}>
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'currentColor', marginRight: 6, verticalAlign: 'middle' }} />
              {syncSource === 'firestore'
                ? `✓ Live · ${events.length} event${events.length !== 1 ? 's' : ''} · synced ${lastSync}`
                : syncSource === 'cache'
                ? `Offline cache · ${events.length} event${events.length !== 1 ? 's' : ''}`
                : 'No data — sign in first'}
              {syncError && <span style={{ color: '#ef4444', marginLeft: 8 }}>⚠ {syncError}</span>}
              {syncTeamId && <span style={{ color: muted, marginLeft: 8, fontFamily: 'monospace' }}>team:{syncTeamId.slice(0, 8)}…</span>}
            </div>
          ) : null}
        </div>
      </header>

      {/* Tabs */}
      <div style={{ maxWidth: 600, margin: '0 auto', padding: '12px 16px 0' }}>
        <div style={{ display: 'flex', gap: 8, background: dark ? '#27272a' : '#e4e4e7', borderRadius: 14, padding: 4 }}>
          {([['schedule', '📅', 'My Schedule'], ['todos', '✅', 'To-Do List']] as [Tab, string, string][]).map(([t, icon, label]) => (
            <button key={t} onClick={() => setTab(t)} style={{
              flex: 1, padding: '10px 12px', borderRadius: 10, border: 'none',
              background: tab === t ? (dark ? '#09090b' : '#fff') : 'transparent',
              color: tab === t ? (dark ? '#fff' : '#09090b') : muted,
              fontWeight: 800, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em',
              cursor: 'pointer', transition: 'all 0.18s',
              boxShadow: tab === t ? '0 1px 6px rgba(0,0,0,0.15)' : 'none',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}>
              <span style={{ fontSize: 14 }}>{icon}</span>
              <span>{label}</span>
              {t === 'todos' && pending.length > 0 && (
                <span style={{ background: RED, color: '#fff', borderRadius: 10, padding: '1px 7px', fontSize: 10, fontWeight: 900 }}>{pending.length}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <main style={{ maxWidth: 600, margin: '0 auto', padding: '16px 16px 100px' }}>

        {/* SCHEDULE TAB */}
        {tab === 'schedule' && (
          <div>
            {syncing && upcoming.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: muted }}>
                <div style={{ width: 40, height: 40, border: '3px solid #7c3aed', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
                <p style={{ fontSize: 14, fontWeight: 700 }}>Fetching your events…</p>
              </div>
            )}
            {!syncing && upcoming.length === 0 && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: muted }}>
                <p style={{ fontSize: 48, margin: '0 0 12px' }}>📅</p>
                <p style={{ fontSize: 18, fontWeight: 900, textTransform: 'uppercase', color: text, margin: '0 0 8px' }}>No Upcoming Events</p>
                <p style={{ fontSize: 13, lineHeight: 1.6, margin: '0 0 20px' }}>
                  {syncSource === 'none' ? 'Sign into the app to sync your schedule.' : 'No events in the next 90 days.'}
                </p>
                <button onClick={doSync} style={{ ...S.btn('#7c3aed'), margin: '0 auto', padding: '12px 24px' }}>
                  <span style={{ animation: syncing ? 'spin 1s linear infinite' : 'none', display: 'inline-block' }}>🔄</span> Try Syncing
                </button>
              </div>
            )}
            {upcoming.map(ev => {
              const color = EVENT_COLORS[ev.eventType] || EVENT_COLORS.other;
              const isToday = ev.date === todayStr();
              return (
                <div key={ev.id} onClick={() => setSelectedEvent(ev)}
                  style={{ ...S.card, borderLeftWidth: 4, borderLeftColor: color, background: isToday ? (dark ? '#1a0a0a' : '#fff5f5') : cardBg }}>
                  {isToday && <div style={{ fontSize: 10, fontWeight: 900, color: RED, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 4 }}>● TODAY</div>}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 15, fontWeight: 800, margin: '0 0 4px', color: text }}>{ev.title}</p>
                      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 11, color: muted }}>📅 {fmt(ev.date)}</span>
                        {ev.startTime && <span style={{ fontSize: 11, color: muted }}>🕐 {fmtTime(ev.startTime)}</span>}
                        {ev.location && <span style={{ fontSize: 11, color: muted }}>📍 {ev.location}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', background: color + '22', color, borderRadius: 6, padding: '3px 8px', flexShrink: 0 }}>{EVENT_LABELS[ev.eventType] || ev.eventType}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* TODOS TAB */}
        {tab === 'todos' && (
          <div>
            {!addOpen && (
              <button onClick={() => { setAddOpen(true); setTimeout(() => textRef.current?.focus(), 100); }} style={{ width: '100%', padding: '14px', background: '#7c3aed', border: 'none', borderRadius: 14, color: '#fff', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                <span style={{ fontSize: 18 }}>＋</span> Add Task
              </button>
            )}
            {addOpen && (
              <div style={{ ...S.card, marginBottom: 16 }}>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted, margin: '0 0 8px' }}>New Task</p>
                <input ref={textRef} value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addTodo(); if (e.key === 'Escape') setAddOpen(false); }} placeholder="What needs to get done?" style={{ ...S.input, marginBottom: 10 }} />
                <input type="date" value={newDue} onChange={e => setNewDue(e.target.value)} style={{ ...S.input, marginBottom: 10 }} min={todayStr()} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={addTodo} style={{ flex: 1, padding: '10px', background: '#7c3aed', border: 'none', borderRadius: 10, color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>Add</button>
                  <button onClick={() => setAddOpen(false)} style={{ flex: 1, padding: '10px', background: 'transparent', border: `1px solid ${border}`, borderRadius: 10, color: muted, fontWeight: 800, cursor: 'pointer', fontSize: 13 }}>Cancel</button>
                </div>
              </div>
            )}
            {pending.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted, margin: '0 0 10px' }}>Pending · {pending.length}</p>
                {pending.map(item => {
                  const overdue = new Date(item.dueDate + 'T23:59:59') < new Date();
                  return (
                    <div key={item.id} style={{ ...S.card, borderColor: overdue ? '#ef444460' : border }}>
                      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <input type="checkbox" checked={false} onChange={() => setTodos(p => p.map(t => t.id === item.id ? { ...t, completed: true } : t))} style={{ marginTop: 2, accentColor: '#7c3aed', width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <p style={{ fontSize: 14, fontWeight: 600, margin: '0 0 2px', color: text }}>{item.text}</p>
                          <p style={{ fontSize: 11, color: overdue ? '#ef4444' : muted, margin: 0 }}>{overdue ? '⚠ Overdue · ' : '📅 '}{item.dueDate}</p>
                        </div>
                        <button onClick={() => setTodos(p => p.filter(t => t.id !== item.id))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 16, padding: '0 4px' }}>×</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {done.length > 0 && (
              <div>
                <p style={{ fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted, margin: '0 0 10px' }}>Completed · {done.length}</p>
                {done.map(item => (
                  <div key={item.id} style={{ ...S.card, opacity: 0.5 }}>
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                      <input type="checkbox" checked={true} onChange={() => setTodos(p => p.map(t => t.id === item.id ? { ...t, completed: false } : t))} style={{ accentColor: '#22c55e', width: 16, height: 16, cursor: 'pointer', flexShrink: 0 }} />
                      <p style={{ fontSize: 14, textDecoration: 'line-through', margin: 0, flex: 1, color: muted }}>{item.text}</p>
                      <button onClick={() => setTodos(p => p.filter(t => t.id !== item.id))} style={{ background: 'none', border: 'none', color: muted, cursor: 'pointer', fontSize: 16 }}>×</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {pending.length === 0 && done.length === 0 && (
              <div style={{ textAlign: 'center', padding: '40px 0', color: muted }}>
                <p style={{ fontSize: 36, margin: '0 0 12px' }}>✅</p>
                <p style={{ fontSize: 16, fontWeight: 800, color: text, margin: '0 0 6px' }}>All Clear</p>
                <p style={{ fontSize: 13 }}>No tasks yet. Add one above.</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Event Detail Modal */}
      {selectedEvent && (() => {
        const ev = selectedEvent;
        const color = EVENT_COLORS[ev.eventType] || EVENT_COLORS.other;
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }} onClick={() => setSelectedEvent(null)}>
            <div style={{ width: '100%', maxWidth: 480, background: dark ? '#111' : '#fff', borderRadius: 24, overflow: 'hidden', maxHeight: '88dvh', overflowY: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.6)' }} onClick={e => e.stopPropagation()}>
              {/* Modal top bar */}
              <div style={{ background: '#09090b', borderBottom: `3px solid ${RED}`, padding: '16px 20px 14px', position: 'sticky', top: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 9, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.15em', background: color + '22', color, borderRadius: 6, padding: '3px 10px' }}>{EVENT_LABELS[ev.eventType] || ev.eventType}</span>
                  <button onClick={() => setSelectedEvent(null)} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                </div>
                <h2 style={{ color: '#fff', fontSize: 20, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.01em', margin: '10px 0 0' }}>{ev.title}</h2>
              </div>
              {/* Modal body */}
              <div style={{ padding: '20px 20px 28px' }}>
                {/* Key details */}
                <div style={{ background: dark ? '#1a1a1a' : '#f4f4f5', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
                  <div style={{ display: 'grid', gap: 12 }}>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      <span style={{ fontSize: 18 }}>📅</span>
                      <div>
                        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted }}>Date</p>
                        <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: text }}>
                          {fmt(ev.date)}{ev.endDate && ev.endDate !== ev.date ? ` – ${fmt(ev.endDate)}` : ''}
                        </p>
                      </div>
                    </div>
                    {ev.startTime && (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 18 }}>🕐</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted }}>Time</p>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: text }}>{fmtTime(ev.startTime)}</p>
                        </div>
                      </div>
                    )}
                    {ev.location && (
                      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                        <span style={{ fontSize: 18 }}>📍</span>
                        <div>
                          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted }}>Location</p>
                          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: text }}>{ev.location}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Match info */}
                {(ev.opponent || ev.isHome !== undefined || ev.leagueName) && (
                  <div style={{ background: dark ? '#1a1a1a' : '#f4f4f5', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
                    <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: RED }}>Match Details</p>
                    {ev.opponent && <p style={{ margin: '0 0 6px', fontSize: 14, color: text }}>⚔️ <strong>vs {ev.opponent}</strong></p>}
                    {ev.isHome !== undefined && <p style={{ margin: '0 0 6px', fontSize: 13, color: muted }}>{ev.isHome ? '🏠 Home Game' : '✈️ Away Game'}</p>}
                    {ev.leagueName && <p style={{ margin: 0, fontSize: 13, color: muted }}>🏆 {ev.leagueName}{ev.division ? ` · ${ev.division}` : ''}</p>}
                  </div>
                )}
                {/* Description */}
                {ev.description && (
                  <div style={{ background: dark ? '#1a1a1a' : '#f4f4f5', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
                    <p style={{ margin: '0 0 6px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted }}>Notes</p>
                    <p style={{ margin: 0, fontSize: 14, color: text, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{ev.description}</p>
                  </div>
                )}
                {/* Extra details */}
                {(ev.ages || ev.registrationCost || ev.contactEmail || ev.contactPhone) && (
                  <div style={{ background: dark ? '#1a1a1a' : '#f4f4f5', borderRadius: 14, padding: '14px 16px', marginBottom: 16 }}>
                    <p style={{ margin: '0 0 10px', fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: muted }}>Info</p>
                    {ev.ages && <p style={{ margin: '0 0 6px', fontSize: 13, color: text }}>👥 Ages: {ev.ages}</p>}
                    {ev.registrationCost && <p style={{ margin: '0 0 6px', fontSize: 13, color: text }}>💰 Cost: {ev.registrationCost}</p>}
                    {ev.contactEmail && <p style={{ margin: '0 0 6px', fontSize: 13, color: text }}>✉️ {ev.contactEmail}</p>}
                    {ev.contactPhone && <p style={{ margin: 0, fontSize: 13, color: text }}>📞 {ev.contactPhone}</p>}
                  </div>
                )}
                <button onClick={() => setSelectedEvent(null)} style={{ width: '100%', padding: '14px', background: RED, border: 'none', borderRadius: 14, color: '#fff', fontSize: 13, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>Close</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* iOS Install Sheet */}
      {showInstall && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 999, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }} onClick={() => setShowInstall(false)}>
          <div style={{ width: '100%', maxWidth: 480, background: surface, borderRadius: '28px 28px 0 0', padding: '28px 24px 40px', border: `1px solid ${border}` }} onClick={e => e.stopPropagation()}>
            <div style={{ width: 40, height: 4, background: border, borderRadius: 2, margin: '0 auto 24px' }} />
            <p style={{ fontSize: 18, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '-0.02em', margin: '0 0 6px', textAlign: 'center', color: text }}>Add to Home Screen</p>
            <p style={{ fontSize: 12, color: muted, textAlign: 'center', margin: '0 0 24px' }}>Install for offline access</p>
            {isIOS ? (
              [{ n: '1', i: '⬆️', t: 'Tap the Share button in Safari' }, { n: '2', i: '➕', t: 'Tap "Add to Home Screen"' }, { n: '3', i: '✅', t: 'Tap "Add"' }].map(s => (
                <div key={s.n} style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 16 }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: RED, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, color: '#fff', flexShrink: 0 }}>{s.n}</div>
                  <p style={{ margin: 0, fontSize: 13, color: text }}><span style={{ marginRight: 6 }}>{s.i}</span>{s.t}</p>
                </div>
              ))
            ) : (
              <p style={{ textAlign: 'center', color: muted, fontSize: 13 }}>Open in Chrome and tap the browser menu → "Add to Home Screen"</p>
            )}
            <button onClick={() => setShowInstall(false)} style={{ width: '100%', marginTop: 20, background: 'transparent', border: `1px solid ${border}`, borderRadius: 14, height: 44, color: muted, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
