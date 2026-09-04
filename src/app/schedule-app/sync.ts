import { getAuth, onAuthStateChanged, type User } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { getOrInitializeFirebaseApp } from '@/firebase/config';
import { loadScopedEvents, saveScopedEvents, scopedLastTeamKey } from './storage';

export interface SyncEvent {
  id: string;
  title: string;
  date: string;
  endDate?: string;
  startTime?: string;
  location?: string;
  description?: string;
  eventType: string;
  opponent?: string;
  isHome?: boolean;
  isTournament?: boolean;
  leagueName?: string;
  division?: string;
  contactEmail?: string;
  contactPhone?: string;
  registrationCost?: string;
  ages?: string;
}

export interface SyncResult {
  events: SyncEvent[];
  source: 'firestore' | 'cache' | 'none';
  teamName?: string;
  teamId?: string;
  userId?: string;
  error?: string;
}

const TEAM_KEY   = 'sf_session_team_id';

function normaliseDate(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw) {
    return (raw as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  if (typeof raw === 'string') return raw.slice(0, 10);
  return '';
}

export function watchScheduleUser(callback: (user: User | null) => void): () => void {
  const app = getOrInitializeFirebaseApp();
  return onAuthStateChanged(getAuth(app), callback);
}

function waitForScheduleUser(): Promise<User | null> {
  const app = getOrInitializeFirebaseApp();
  const auth = getAuth(app);
  return new Promise(resolve => {
    let settled = false;
    let unsubscribe = () => {};
    const finish = (user: User | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      unsubscribe();
      resolve(user);
    };
    const timeout = setTimeout(() => finish(null), 6000);
    unsubscribe = onAuthStateChanged(auth, finish);
  });
}

export async function syncFromFirestore(): Promise<SyncResult> {
  let userId = '';
  try {
    const app = getOrInitializeFirebaseApp();
    const db   = getFirestore(app);
    const user = await waitForScheduleUser();

    if (!user) {
      return { events: [], source: 'none', error: 'Not signed in' };
    }
    userId = user.uid;

    const selectedTeamId = localStorage.getItem(TEAM_KEY) || '';
    let targetTeamId = '';
    let teamName = '';

    try {
      const membershipsSnap = await getDocs(collection(db, 'users', user.uid, 'teamMemberships'));
      if (membershipsSnap.empty) {
        localStorage.removeItem(scopedLastTeamKey(user.uid));
        return { events: [], source: 'none', userId: user.uid, error: 'No team memberships found' };
      }
      const membershipIds = membershipsSnap.docs.map(membership => membership.id);
      targetTeamId = membershipIds.includes(selectedTeamId) ? selectedTeamId : membershipIds[0];
      localStorage.setItem(scopedLastTeamKey(user.uid), targetTeamId);
    } catch (membershipError: any) {
      targetTeamId = localStorage.getItem(scopedLastTeamKey(user.uid)) || '';
      const cached = loadScopedEvents(localStorage, user.uid, targetTeamId);
      return {
        events: cached,
        source: cached.length ? 'cache' : 'none',
        teamId: targetTeamId || undefined,
        userId: user.uid,
        error: membershipError?.message || 'Offline — membership could not be verified',
      };
    }

    try {
      const teamDoc = await getDoc(doc(db, 'teams', targetTeamId));
      if (teamDoc.exists()) {
        const data = teamDoc.data();
        teamName = data.name || data.teamName || '';
      }
    } catch { /* non-fatal */ }

    const eventsSnap = await getDocs(collection(db, 'teams', targetTeamId, 'events'));

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const max = new Date(now);
    max.setDate(max.getDate() + 90);

    const events: SyncEvent[] = [];
    eventsSnap.forEach(d => {
      const data = d.data();
      const dateStr = normaliseDate(data.date);
      if (!dateStr) return;
      const eventDate = new Date(dateStr + 'T00:00:00');
      if (eventDate >= now && eventDate <= max) {
        events.push({
          id: d.id,
          title: data.title || 'Event',
          date: dateStr,
          endDate: normaliseDate(data.endDate) || undefined,
          startTime: data.startTime || '',
          location: data.location || '',
          description: data.description || '',
          eventType: data.eventType || 'other',
          opponent: data.opponent || '',
          isHome: data.isHome,
          isTournament: data.isTournament,
          leagueName: data.leagueName || '',
          division: data.division || '',
          contactEmail: data.contactEmail || '',
          contactPhone: data.contactPhone || '',
          registrationCost: data.registrationCost || '',
          ages: data.ages || '',
        });
      }
    });

    events.sort((a, b) => a.date.localeCompare(b.date));
    try { saveScopedEvents(localStorage, user.uid, targetTeamId, events); } catch {}

    return { events, source: 'firestore', teamName, teamId: targetTeamId, userId: user.uid };
  } catch (err: any) {
    console.error('[ScheduleSync] Firestore error:', err?.message || err);
    const targetTeamId = userId ? localStorage.getItem(scopedLastTeamKey(userId)) || '' : '';
    const cached = userId ? loadScopedEvents(localStorage, userId, targetTeamId) : [];
    return {
      events: cached,
      source: cached.length ? 'cache' : 'none',
      teamId: targetTeamId || undefined,
      userId: userId || undefined,
      error: err?.message || 'Sync failed',
    };
  }
}
