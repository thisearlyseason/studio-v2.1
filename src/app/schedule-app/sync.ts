import { initializeApp, getApps } from 'firebase/app';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';
import { firebaseConfig } from '@/firebase/config';

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
  error?: string;
}

const EVENTS_KEY = 'squad_schedule_events';
const TEAM_KEY   = 'sf_session_team_id';

function getApp() {
  return getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
}

function normaliseDate(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'object' && raw !== null && 'toDate' in raw) {
    return (raw as { toDate: () => Date }).toDate().toISOString().slice(0, 10);
  }
  if (typeof raw === 'string') return raw.slice(0, 10);
  return '';
}

function getCached(): SyncEvent[] {
  try { return JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]'); } catch { return []; }
}

export async function syncFromFirestore(): Promise<SyncResult> {
  try {
    const app = getApp();
    const auth = getAuth(app);
    const db   = getFirestore(app);

    const user = await new Promise<any>((resolve) => {
      const unsub = onAuthStateChanged(auth, (u) => { unsub(); resolve(u); });
      setTimeout(() => resolve(null), 6000);
    });

    if (!user) {
      const cached = getCached();
      return { events: cached, source: cached.length ? 'cache' : 'none', error: 'Not signed in' };
    }

    let targetTeamId = localStorage.getItem(TEAM_KEY) || '';
    let teamName = '';

    if (!targetTeamId) {
      const membershipsSnap = await getDocs(collection(db, 'users', user.uid, 'teamMemberships'));
      if (membershipsSnap.empty) {
        const cached = getCached();
        return { events: cached, source: cached.length ? 'cache' : 'none', error: 'No team memberships found' };
      }
      targetTeamId = membershipsSnap.docs[0].id;
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
    try { localStorage.setItem(EVENTS_KEY, JSON.stringify(events)); } catch {}

    return { events, source: 'firestore', teamName, teamId: targetTeamId };
  } catch (err: any) {
    console.error('[ScheduleSync] Firestore error:', err?.message || err);
    const cached = getCached();
    return { events: cached, source: cached.length ? 'cache' : 'none', error: err?.message || 'Sync failed' };
  }
}
