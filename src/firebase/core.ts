import { getOrInitializeFirebaseApp } from '@/firebase/config';
import { FirebaseApp } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  getAuth,
  indexedDBLocalPersistence,
  initializeAuth,
} from 'firebase/auth';
import { connectStorageEmulator, getStorage } from 'firebase/storage';
import { 
  connectFirestoreEmulator,
  getFirestore,
} from 'firebase/firestore'

let cachedSdks: any = null;

// Next.js HMR clears module state but preserves globalThis.
// Storing this globally ensures we don't re-initialize Firestore or Auth repeatedly.
const globalSdks = globalThis as any;

/**
 * Initializes Firebase in a way that is safe for both Client (Browser) and Server (Node.js/Next.js).
 */
export function initializeFirebase() {
  const isClient = typeof window !== 'undefined';
  if (isClient && globalSdks.firebaseSdks) return globalSdks.firebaseSdks;
  if (cachedSdks) return cachedSdks;

  const firebaseApp = getOrInitializeFirebaseApp();

  cachedSdks = getSdks(firebaseApp);
  if (isClient) {
    globalSdks.firebaseSdks = cachedSdks;
  }
  return cachedSdks;
}

export function getSdks(firebaseApp: FirebaseApp) {
  let firestore;
  let auth;
  
  // Initialize Firestore with settings to mitigate the 'ID: ca9' assertion bug
  if (typeof window !== 'undefined') {
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
      firestore = getFirestore(firebaseApp);
      console.log('[Firestore] Initialized fresh Firestore instance (Default Cache)');
    } catch (e: any) {
      if (e.message && e.message.includes('already been initialized')) {
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

  const storage = getStorage(firebaseApp);

  // Local QA can run against the Firebase Emulator Suite without reading or
  // writing production Auth, Firestore, or Storage data.
  if (typeof window !== 'undefined' &&
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === 'true' &&
      !globalSdks.firebaseEmulatorsConnected) {
    const emulatorHost = window.location.hostname || '127.0.0.1';
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(firestore, emulatorHost, 8080);
    connectStorageEmulator(storage, emulatorHost, 9199);
    globalSdks.firebaseEmulatorsConnected = true;
    console.info('[Firebase] Connected to local Auth, Firestore, and Storage emulators.');
  }

  return {
    firebaseApp,
    auth,
    firestore,
    storage
  };
}
