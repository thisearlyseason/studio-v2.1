import { getApp, getApps, initializeApp } from 'firebase/app';
import type { FirebaseApp, FirebaseOptions } from 'firebase/app';

// Local development fallback. Firebase App Hosting injects the correct
// project-specific web configuration at build time, so hosted environments
// must attempt no-argument initialization before using this production value.
export const firebaseConfig = {
  "projectId": "studio-6850142148-fe343",
  "appId": "1:61782012212:web:8913d2b40fd9843148f561",
  "apiKey": "AIzaSyA8G2_7gu0WK8efQ9sl7UJG6tsrC7iOCdU",
  "authDomain": "studio-6850142148-fe343.firebaseapp.com",
  "storageBucket": "studio-6850142148-fe343.firebasestorage.app",
  "measurementId": "",
  "messagingSenderId": "61782012212"
};

function getHostedFirebaseConfig(): FirebaseOptions | null {
  const rawConfig = process.env.NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG;
  if (!rawConfig) return null;

  try {
    const config = JSON.parse(rawConfig) as FirebaseOptions;
    return config.projectId && config.apiKey && config.appId ? config : null;
  } catch {
    return null;
  }
}

export function getOrInitializeFirebaseApp(): FirebaseApp {
  if (getApps().length > 0) return getApp();

  const environmentConfig = getHostedFirebaseConfig();
  if (process.env.NODE_ENV !== 'production' && !environmentConfig) {
    throw new Error(
      'Local Firebase configuration is missing. Set NEXT_PUBLIC_FIREBASE_WEBAPP_CONFIG to an isolated preview project.'
    );
  }

  // App Hosting supplies a project-specific public web configuration during
  // its build. The production fallback remains for legacy hosted deployments;
  // development must always provide an explicit isolated project above.
  return initializeApp(environmentConfig ?? firebaseConfig);
}
