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

// Next.js HMR clears module state but preserves globalThis.
// Storing this globally ensures we don't re-initialize Firestore or Auth repeatedly.
const globalSdks = globalThis as any;

/**
 * Initializes Firebase in a way that is safe for both Client (Browser) and Server (Node.js/Next.js).
 */
export function initializeFirebase() {
  if (globalSdks.firebaseSdks) return globalSdks.firebaseSdks;
  if (cachedSdks) return cachedSdks;

  const apps = getApps();
  let firebaseApp;

  if (!apps.length) {
    firebaseApp = initializeApp(firebaseConfig);
  } else {
    firebaseApp = getApp();
  }

  cachedSdks = getSdks(firebaseApp);
  globalSdks.firebaseSdks = cachedSdks;
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
      const { getFirestore } = require('firebase/firestore');
      firestore = getFirestore(firebaseApp);
      console.log('[Firestore] Initialized fresh Firestore instance (Default Cache)');
    } catch (e: any) {
      if (e.message && e.message.includes('already been initialized')) {
        const { getFirestore } = require('firebase/firestore');
        firestore = getFirestore(firebaseApp);
      } else {
        throw e;
      }
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
