import * as firebaseAdmin from 'firebase-admin';

const APP_NAME = 'qa-fixtures-staging';

function assertDocumentPath(path) {
  if (
    typeof path !== 'string'
    || path.length === 0
    || path.includes('\\')
    || path.split('/').length % 2 !== 0
    || path.split('/').some(segment => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Firestore adapter accepts only one exact document path.');
  }
}

function parseServiceAccount(value) {
  try {
    const account = JSON.parse(value);
    if (account && typeof account === 'object') return account;
  } catch {
    // Some deployment environments retain the established base64 convention.
  }

  try {
    const account = JSON.parse(Buffer.from(value, 'base64').toString('utf8'));
    if (account && typeof account === 'object') return account;
  } catch {
    // Do not expose credential content in errors or logs.
  }

  throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON must contain a valid service account.');
}

function existingNamedApp(adminSdk) {
  const apps = typeof adminSdk.getApps === 'function' ? adminSdk.getApps() : adminSdk.apps;
  return apps.find(app => app.name === APP_NAME) || null;
}

function initializeNamedApp(adminSdk, env) {
  const existing = existingNamedApp(adminSdk);
  if (existing) return {
    app: existing,
    credentialProjectId: null,
    credential: existing.options?.credential,
  };

  const externalServiceAccount = env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (externalServiceAccount) {
    const serviceAccount = parseServiceAccount(externalServiceAccount);
    const credentialProjectId = serviceAccount.project_id || serviceAccount.projectId || null;
    const options = {
      credential: adminSdk.credential.cert(serviceAccount),
      ...(credentialProjectId ? { projectId: credentialProjectId } : {}),
    };
    return {
      app: adminSdk.initializeApp(options, APP_NAME),
      credentialProjectId,
      credential: options.credential,
    };
  }

  const declaredProjectId = env.GOOGLE_CLOUD_PROJECT || env.GCLOUD_PROJECT || null;
  const credential = adminSdk.credential.applicationDefault();
  return {
    app: adminSdk.initializeApp({
      credential,
      ...(declaredProjectId ? { projectId: declaredProjectId } : {}),
    }, APP_NAME),
    credentialProjectId: declaredProjectId,
    credential,
  };
}

async function resolveProjectId(app, credentialProjectId, credential) {
  let projectId = app.options?.projectId || credentialProjectId;
  if (!projectId && typeof credential?.getProjectId === 'function') {
    projectId = await credential.getProjectId();
  }
  if (!projectId || typeof projectId !== 'string') {
    throw new Error('Firebase Admin must resolve an explicit project ID before fixture commands can run.');
  }
  return projectId;
}

/**
 * Build the intentionally small Firebase Admin surface consumed by lifecycle.
 * This function is the only place this feature initializes Firebase Admin.
 */
export async function createFirebaseAdapter({ env = process.env, adminSdk = firebaseAdmin } = {}) {
  const { app, credentialProjectId, credential } = initializeNamedApp(adminSdk, env);
  const projectId = await resolveProjectId(app, credentialProjectId, credential);
  const auth = app.auth();
  const firestore = app.firestore();

  return {
    projectId,
    auth: {
      getUser: uid => auth.getUser(uid),
      createUser: input => auth.createUser(input),
      updateUser: (uid, input) => auth.updateUser(uid, input),
      setCustomUserClaims: (uid, claims) => auth.setCustomUserClaims(uid, claims),
      revokeRefreshTokens: uid => auth.revokeRefreshTokens(uid),
      deleteUser: uid => auth.deleteUser(uid),
    },
    firestore: {
      get(path) {
        assertDocumentPath(path);
        return firestore.doc(path).get();
      },
      set(path, data) {
        assertDocumentPath(path);
        return firestore.doc(path).set(data);
      },
      delete(path) {
        assertDocumentPath(path);
        return firestore.doc(path).delete();
      },
    },
  };
}
