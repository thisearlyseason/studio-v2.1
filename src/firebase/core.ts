import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getStorage } from 'firebase/storage';
import { 
  initializeFirestore, 
  getFirestore, 
  memoryLocalCache 
} from 'firebase/firestore'

let cachedSdks: any = null;

/**
 * Initializes Firebase in a way that is safe for both Client (Browser) and Server (Node.js/Next.js).
 */
export function initializeFirebase() {
  // If we already have the SDKs cached for this session, return them immediately
  if (cachedSdks) return cachedSdks;

  const apps = getApps();
  let firebaseApp;

  if (!apps.length) {
    firebaseApp = initializeApp(firebaseConfig);
  } else {
    firebaseApp = getApp();
  }

  cachedSdks = getSdks(firebaseApp);
  return cachedSdks;
}

export function getSdks(firebaseApp: FirebaseApp) {
  let firestore;
  
  // Initialize Firestore with settings to mitigate the 'ID: ca9' assertion bug
  if (typeof window !== 'undefined') {
    try {
      // Check if Firestore is already initialized to avoid "Firestore has already been initialized" errors
      firestore = getFirestore(firebaseApp);
      console.log('[Firestore] Re-using existing instance');
    } catch (e) {
      console.log('[Firestore] Initializing with memory cache and long-polling workaround');
      firestore = initializeFirestore(firebaseApp, {
        localCache: memoryLocalCache(),
        experimentalForceLongPolling: true, // Force long-polling to bypass buggy WebSocket state machine in v11
        experimentalAutoDetectLongPolling: true, // Additional stability for v11 streams
        host: 'firestore.googleapis.com',
        ssl: true
      });
    }
  } else {
    // On server, initialize without persistence
    firestore = getFirestore(firebaseApp);
  }

  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore,
    storage: getStorage(firebaseApp)
  };
}
