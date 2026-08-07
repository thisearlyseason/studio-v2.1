/**
 * Firebase Admin SDK initializer — server-side only.
 *
 * Use this module in all API routes and server functions instead of the client
 * SDK (`firebase/firestore`). The Admin SDK uses standard HTTP rather than
 * gRPC/WebSockets and works correctly in serverless environments (Vercel, etc.)
 *
 * Initialization is LAZY — the Admin app is only created on the first actual
 * API request, not at build/module-load time. This prevents build failures
 * caused by missing environment variables during the Vercel build phase.
 *
 * Initialization order:
 *   1. FIREBASE_SERVICE_ACCOUNT_JSON env var (full service-account JSON string OR base64)
 *   2. Application Default Credentials (GOOGLE_APPLICATION_CREDENTIALS / GCP metadata)
 */
import {
  cert,
  getApps,
  initializeApp,
  type App,
  type ServiceAccount,
} from 'firebase-admin/app';
import { getAuth, type Auth } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';

let _app: App | null = null;
let _db: Firestore | null = null;

function initAdminApp(): App {
  if (_app) return _app;

  // Return existing app if already initialized by another module
  const apps = getApps();
  if (apps.length > 0) {
    _app = apps[0]!;
    return _app;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (serviceAccountJson) {
    let serviceAccount: object | undefined;

    // Attempt 1: parse as-is (the happy path — raw JSON pasted into Vercel)
    try {
      serviceAccount = JSON.parse(serviceAccountJson);
    } catch (_) { /* fall through */ }

    // Attempt 2: base64-encoded JSON
    if (!serviceAccount) {
      try {
        const decoded = Buffer.from(serviceAccountJson, 'base64').toString('utf8');
        serviceAccount = JSON.parse(decoded);
      } catch (_) { /* fall through */ }
    }

    // Attempt 3: Vercel sometimes converts \n escape sequences to literal newlines
    // inside the private_key value, breaking the outer JSON. Re-escape them.
    if (!serviceAccount) {
      try {
        const reescaped = serviceAccountJson.replace(/\\n/g, '\\n').replace(/\n/g, '\\n');
        serviceAccount = JSON.parse(reescaped);
      } catch (_) { /* fall through */ }
    }

    if (!serviceAccount) {
      console.error(
        '[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON is set but FAILED TO PARSE.',
        'Length:', serviceAccountJson.length,
        'First 40 chars:', serviceAccountJson.slice(0, 40)
      );
      throw new Error(
        '[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON could not be parsed. ' +
        'Paste the raw serviceAccountKey.json contents directly into the Vercel env var.'
      );
    }

    _app = initializeApp({
      credential: cert(serviceAccount as ServiceAccount),
    });
    console.info('[firebase-admin] Initialized with service account credentials.');
  } else {
    // Fallback: Application Default Credentials (GCP/Firebase App Hosting)
    console.warn(
      '[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON not set — using Application Default Credentials.',
      'This will FAIL on Vercel unless you set the env var.'
    );
    _app = initializeApp();
  }

  return _app;
}

function getDb(): Firestore {
  if (_db) return _db;
  _db = getFirestore(initAdminApp());
  return _db;
}

/**
 * Explicitly initializes the Firebase Admin SDK.
 * Call this before using an Admin service in code that does not touch adminDb first.
 */
export function ensureAdminInit(): void {
  initAdminApp();
}

export function getAdminAuth(): Auth {
  return getAuth(initAdminApp());
}

export function getAdminMessaging(): Messaging {
  return getMessaging(initAdminApp());
}

/**
 * Lazily-initialized Firestore Admin instance.
 * Accessing any property triggers initialization on first use, not at build time.
 */
export const adminDb = new Proxy({} as Firestore, {
  get(_target, prop: PropertyKey) {
    const db = getDb();
    const value = (db as any)[prop];
    return typeof value === 'function' ? (value as Function).bind(db) : value;
  },
});
