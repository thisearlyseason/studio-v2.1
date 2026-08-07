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
import * as admin from 'firebase-admin';

let _app: admin.app.App | null = null;
let _db: admin.firestore.Firestore | null = null;
let _projectId: string | null = null;

function initAdminApp(): admin.app.App {
  if (_app) return _app;

  // Return existing app if already initialized by another module
  if (admin.apps.length > 0) {
    _app = admin.apps[0]!;
    _projectId = _app.options.projectId || null;
    return _app;
  }

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const isEmulator = Boolean(process.env.FIRESTORE_EMULATOR_HOST || process.env.FIREBASE_AUTH_EMULATOR_HOST);

  if (isEmulator) {
    _app = admin.initializeApp({
      projectId: process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'demo-the-squad-audit',
    });
    console.info('[firebase-admin] Initialized for the local Firebase emulators.');
  } else if (serviceAccountJson) {
    let serviceAccount: (object & { project_id?: string; projectId?: string }) | undefined;

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

    _projectId = serviceAccount.project_id || serviceAccount.projectId || null;
    _app = admin.initializeApp({
      credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
      ...(_projectId ? { projectId: _projectId } : {}),
    });
    console.info('[firebase-admin] Initialized with service account credentials.');
  } else {
    // Fallback: Application Default Credentials (GCP/Firebase App Hosting)
    const projectId = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
    _projectId = projectId || null;
    console.warn(
      '[firebase-admin] FIREBASE_SERVICE_ACCOUNT_JSON not set — using Application Default Credentials.',
      'This will FAIL on Vercel unless you set the env var.'
    );
    // ADC can belong to a different default project than the environment being
    // served (for example, local QA credentials with an isolated preview app).
    // Pin the Admin app to the declared runtime project so Auth token
    // verification and Firestore writes always target the same Firebase tenant
    // as the browser client.
    _app = admin.initializeApp(projectId ? { projectId } : undefined);
  }

  return _app;
}

function getDb(): admin.firestore.Firestore {
  if (_db) return _db;
  _db = initAdminApp().firestore();
  return _db;
}

/**
 * Explicitly initializes the Firebase Admin SDK.
 * Call this before using admin.auth() in API routes that don't touch adminDb first.
 */
export function ensureAdminInit(): void {
  initAdminApp();
}

export function getAdminProjectId(): string | null {
  const app = initAdminApp();
  return _projectId || app.options.projectId || null;
}

export function getAdminAuth(): admin.auth.Auth {
  return initAdminApp().auth();
}

/**
 * Lazily-initialized Firestore Admin instance.
 * Accessing any property triggers initialization on first use, not at build time.
 */
export const adminDb = new Proxy({} as admin.firestore.Firestore, {
  get(_target, prop: PropertyKey) {
    const db = getDb();
    const value = (db as any)[prop];
    return typeof value === 'function' ? value.bind(db) : value;
  },
});
