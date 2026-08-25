export const STAGING_PROJECT_ID = 'the-squad-v2-staging';
export const MANAGED_PREFIX = 'qa-phase7-';
export const STAGING_ORIGIN = 'https://studio--the-squad-v2-staging.us-east4.hosted.app';

const EMULATOR_VARIABLES = [
  'FIRESTORE_EMULATOR_HOST',
  'FIREBASE_AUTH_EMULATOR_HOST',
  'FIREBASE_STORAGE_EMULATOR_HOST',
];

function argumentValue(argv, flag) {
  if (!Array.isArray(argv) || argv.some(value => typeof value !== 'string')) {
    throw new Error('argv must be an array of strings.');
  }

  const positions = argv.flatMap((value, index) => value === flag ? [index] : []);
  if (positions.length !== 1) {
    throw new Error(`${flag} must appear exactly once with a value.`);
  }

  const position = positions[0];
  const value = argv[position + 1];
  if (!value || value.startsWith('--')) {
    throw new Error(`${flag} must appear exactly once with a value.`);
  }
  return value;
}

/** Verify only caller-supplied hosted-staging intent before Admin initialization. */
export function assertRequestedHostedStagingIntent({ argv, env } = {}) {
  const project = argumentValue(argv, '--project');
  const confirmation = argumentValue(argv, '--confirm-project');

  if (project !== STAGING_PROJECT_ID || confirmation !== STAGING_PROJECT_ID) {
    throw new Error('Both project confirmations must name the isolated staging project.');
  }

  if (!env || env.ALLOW_STAGING_QA_FIXTURES !== 'true') {
    throw new Error('ALLOW_STAGING_QA_FIXTURES must equal true.');
  }

  for (const variable of EMULATOR_VARIABLES) {
    if (env[variable]) {
      throw new Error(`Hosted staging fixture commands reject emulator configuration (${variable}).`);
    }
  }

  return { projectId: STAGING_PROJECT_ID };
}

/** Require the one canonical hosted-staging application origin. */
export function assertStagingOrigin(argv) {
  const origin = argumentValue(argv, '--origin');
  if (origin !== STAGING_ORIGIN) {
    throw new Error('Origin must equal the canonical hosted staging origin.');
  }
  return origin;
}

/**
 * Verify that a command explicitly targets the isolated hosted staging project.
 * The requested-intent portion is pure and may run before Firebase initialization.
 */
export function assertHostedStagingIntent({ argv, env, resolvedProjectId } = {}) {
  const intent = assertRequestedHostedStagingIntent({ argv, env });

  if (resolvedProjectId !== STAGING_PROJECT_ID) {
    throw new Error('Firebase Admin resolved project does not match staging.');
  }

  return intent;
}
