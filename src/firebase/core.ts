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
  let auth;
  
  // Initialize Firestore with settings to mitigate the 'ID: ca9' assertion bug
  if (typeof window !== 'undefined') {
    const { initializeAuth, browserLocalPersistence, getAuth, indexedDBLocalPersistence } = require('firebase/auth');
    
    // Auth Hardening: Explicitly manage persistence to avoid 'network-request-failed' hangs in restricted environments
    try {
      auth = getAuth(firebaseApp);
    } catch (e) {
      // If default initialization fails (e.g. HMR race), use a robust initialization
      auth = initializeAuth(firebaseApp, {
        persistence: [browserLocalPersistence, indexedDBLocalPersistence]
      });
    }

    try {
      // Check if Firestore is already initialized to avoid "Firestore has already been initialized" errors
      firestore = getFirestore(firebaseApp);
      console.log('[Firestore] Re-using existing instance');
    } catch (e) {
      console.log('[Firestore] Initializing fresh Firestore instance');
      firestore = initializeFirestore(firebaseApp, {
        localCache: memoryLocalCache(),
        // Auto-detect picks the best transport (WebSocket vs long-poll).
        // Do NOT combine with experimentalForceLongPolling — they conflict.
        experimentalAutoDetectLongPolling: true,
      });
    }
  } else {
    // On server, initialize without persistence
    firestore = getFirestore(firebaseApp);
    auth = getAuth(firebaseApp);
  }

  return {
    firebaseApp,
    auth,
    firestore,
    storage: getStorage(firebaseApp)
  };
}
