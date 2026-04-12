import { firebaseConfig } from '@/firebase/config';
import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
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
    if (process.env.VERCEL) {
      firebaseApp = initializeApp(firebaseConfig);
    } else {
      try {
        firebaseApp = initializeApp();
      } catch (e) {
        if (process.env.NODE_ENV === "production") {
          console.warn('Automatic initialization failed. Falling back to firebase config object.', e);
        }
        firebaseApp = initializeApp(firebaseConfig);
      }
    }
  } else {
    firebaseApp = getApp();
  }

  cachedSdks = getSdks(firebaseApp);
  return cachedSdks;
}

export function getSdks(firebaseApp: FirebaseApp) {
  let firestore;
  
  // Initialize Firestore with robust multi-tab persistence on the client
  if (typeof window !== 'undefined') {
    try {
      // Use memoryLocalCache to avoid IndexedDB lock and state assertion issues (ca9, b815)
      firestore = initializeFirestore(firebaseApp, {
        localCache: memoryLocalCache(),
        // Recommended for environments with unstable websockets or complex proxies
        experimentalForceLongPolling: true 
      });
    } catch (e) {
      // If already initialized, fallback to getFirestore
      firestore = getFirestore(firebaseApp);
    }
  } else {
    // On server, initialize without persistence
    firestore = getFirestore(firebaseApp);
  }

  return {
    firebaseApp,
    auth: getAuth(firebaseApp),
    firestore
  };
}
