'use client';

import { useEffect, useState, useCallback } from 'react';
import { useFirestore } from '@/firebase';
import { collection, query, orderBy, limit, onSnapshot, Timestamp } from 'firebase/firestore';
import { useTeam } from '@/components/providers/team-provider';
import { useUser } from '@/firebase';
import { ChevronDown, ChevronUp, X, Zap } from 'lucide-react';

interface BetaNotif {
  id: string;
  title: string;
  body: string;
  sentAt: Timestamp | string;
  type?: string;
}

const DISMISSED_KEY = 'squad_dismissed_beta_notifs';

function getDismissed(): Set<string> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveDismissed(ids: Set<string>) {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(ids).slice(-50)));
  } catch {}
}

function formatDate(ts: Timestamp | string) {
  try {
    const d = ts instanceof Timestamp ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return '';
  }
}

export function BetaNotificationBanner() {
  const db = useFirestore();
  const { user: firebaseUser } = useUser();
  const { user: userProfile } = useTeam();
  const [notifs, setNotifs] = useState<BetaNotif[]>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [isExpanded, setIsExpanded] = useState(false);
  const [mounted, setMounted] = useState(false);

  const isBeta = userProfile?.isBetaTester === true;

  // Resolve best display name — prefer Firebase Auth over Firestore profile
  // so the beta user's real identity always shows, never the seeded "Guest" name
  const rawDisplayName =
    firebaseUser?.displayName ||
    userProfile?.name ||
    firebaseUser?.email ||
    '';

  // Extract first name (before space, before @)
  const firstName = rawDisplayName.split(' ')[0].split('@')[0] || 'Beta Tester';
  // If it looks like a generic "Guest *" value from the seeder, fall back to email prefix
  const greetingName =
    firstName.toLowerCase().startsWith('guest')
      ? (firebaseUser?.email?.split('@')[0] || 'Beta Tester')
      : firstName;

  useEffect(() => {
    setMounted(true);
    setDismissed(getDismissed());
  }, []);

  useEffect(() => {
    if (!db || !isBeta) return;
    const q = query(collection(db, 'beta_notifications'), orderBy('sentAt', 'desc'), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() } as BetaNotif)));
    }, (err) => {
      console.warn('[BetaNotifications]', err.message);
    });
    return unsub;
  }, [db, isBeta]);

  const dismiss = useCallback((id: string) => {
    setDismissed(prev => {
      const next = new Set(prev);
      next.add(id);
      saveDismissed(next);
      return next;
    });
    setIsExpanded(false);
  }, []);

  if (!mounted || !isBeta) return null;

  // Show only the single latest un-dismissed notification
  const latest = notifs.find(n => !dismissed.has(n.id));
  if (!latest) return null;

  return (
    <div
      style={{
        width: '100%',
        flexShrink: 0,
        position: 'relative',
        zIndex: 20,
        overflow: 'hidden',
        background: 'linear-gradient(135deg, #0a0000 0%, #120000 60%, #0d0000 100%)',
        borderBottom: '1px solid rgba(220,38,38,0.3)',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
    >
      {/* Top accent pinstripe */}
      <div
        style={{
          width: '100%',
          height: '2px',
          background: 'linear-gradient(90deg, hsl(0,100%,40%) 0%, hsl(0,80%,30%) 55%, transparent 100%)',
        }}
      />

      {/* ── Main Row ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          minHeight: '52px',
          padding: '12px 28px',
          boxSizing: 'border-box',
          width: '100%',
        }}
      >

        {/* Left cluster: pulse + badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
          {/* Animated live dot */}
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span
              className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-60"
              style={{ background: 'hsl(0,100%,55%)' }}
            />
            <span
              className="relative inline-flex rounded-full h-2.5 w-2.5"
              style={{ background: 'hsl(0,100%,45%)' }}
            />
          </span>

          {/* BETA pill */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              fontSize: '9px',
              fontWeight: 900,
              textTransform: 'uppercase',
              letterSpacing: '0.2em',
              padding: '4px 10px',
              borderRadius: '4px',
              background: 'hsl(0,100%,40%)',
              color: '#fff',
              boxShadow: '0 0 10px rgba(220,38,38,0.4), inset 0 1px 0 rgba(255,255,255,0.08)',
              flexShrink: 0,
            }}
          >
            <Zap style={{ width: '10px', height: '10px', fill: 'currentColor' }} />
            Beta
          </span>
        </div>

        {/* Vertical divider */}
        <div
          className="hidden sm:block"
          style={{
            width: '1px',
            alignSelf: 'stretch',
            background: 'rgba(220,38,38,0.25)',
            margin: '6px 0',
            flexShrink: 0,
          }}
        />

        {/* Personalized greeting — md+ only */}
        <span
          className="hidden md:block"
          style={{
            fontSize: '10px',
            fontWeight: 700,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.3)',
            letterSpacing: '0.14em',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
        >
          Hey {greetingName} —
        </span>

        {/* Notification title */}
        <p
          style={{
            flex: '1 1 0%',
            minWidth: 0,
            fontSize: '13px',
            fontWeight: 600,
            color: 'rgba(255,255,255,0.88)',
            letterSpacing: '0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            margin: 0,
          }}
        >
          {latest.title}
        </p>

        {/* Right cluster: date + attribution + controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0, marginLeft: '8px' }}>
          {/* Date — large screens only */}
          <span
            className="hidden lg:block"
            style={{
              fontSize: '10px',
              fontWeight: 500,
              color: 'rgba(255,255,255,0.22)',
              whiteSpace: 'nowrap',
            }}
          >
            {formatDate(latest.sentAt)}
          </span>

          {/* Attribution */}
          <span
            className="hidden sm:block"
            style={{
              fontSize: '9px',
              fontWeight: 900,
              textTransform: 'uppercase',
              color: 'rgba(220,38,38,0.5)',
              letterSpacing: '0.16em',
              whiteSpace: 'nowrap',
            }}
          >
            The Squad
          </span>

          {/* Vertical divider before controls */}
          <div
            style={{
              width: '1px',
              alignSelf: 'stretch',
              background: 'rgba(255,255,255,0.08)',
              margin: '6px 0',
              flexShrink: 0,
            }}
          />

          {/* Expand button */}
          <button
            onClick={() => setIsExpanded(v => !v)}
            aria-label={isExpanded ? 'Collapse' : 'Read more'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
              transition: 'background 150ms ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.12)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.06)')}
          >
            {isExpanded
              ? <ChevronUp style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.55)' }} />
              : <ChevronDown style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.55)' }} />
            }
          </button>

          {/* Dismiss button */}
          <button
            onClick={() => dismiss(latest.id)}
            aria-label="Dismiss"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer',
              transition: 'background 150ms ease, border-color 150ms ease',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(220,38,38,0.25)';
              e.currentTarget.style.borderColor = 'rgba(220,38,38,0.4)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';
            }}
          >
            <X style={{ width: '14px', height: '14px', color: 'rgba(255,255,255,0.45)' }} />
          </button>
        </div>
      </div>

      {/* ── Expanded Body ── */}
      {isExpanded && (
        <div
          style={{
            borderTop: '1px solid rgba(220,38,38,0.15)',
            background: 'rgba(0,0,0,0.25)',
            padding: '16px 28px 20px 28px',
            boxSizing: 'border-box',
            width: '100%',
          }}
        >
          {/* Mobile: show date + source */}
          <div className="lg:hidden" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span
              style={{ color: 'rgba(220,38,38,0.55)', letterSpacing: '0.16em', fontSize: '9px', fontWeight: 900, textTransform: 'uppercase' }}
            >
              The Squad
            </span>
            <span style={{ color: 'rgba(255,255,255,0.15)' }}>·</span>
            <span
              style={{ color: 'rgba(255,255,255,0.25)', fontSize: '10px', fontWeight: 500 }}
            >
              {formatDate(latest.sentAt)}
            </span>
          </div>
          <p
            style={{
              color: 'rgba(255,255,255,0.65)',
              fontSize: '13px',
              fontWeight: 400,
              lineHeight: '1.7',
              whiteSpace: 'pre-wrap',
              maxWidth: '680px',
              margin: 0,
            }}
          >
            {latest.body}
          </p>
        </div>
      )}

      {/* Bottom subtle shadow line */}
      <div
        style={{
          width: '100%',
          height: '1px',
          background: 'linear-gradient(90deg, rgba(220,38,38,0.12) 0%, transparent 60%)',
        }}
      />
    </div>
  );
}
