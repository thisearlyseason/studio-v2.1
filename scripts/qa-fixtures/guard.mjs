export const STAGING_PROJECT_ID = 'the-squad-v2-staging';
export const MANAGED_PREFIX = 'qa-phase7-';

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

/**
 * Verify that a command explicitly targets the isolated hosted staging project.
 * This function is intentionally pure: Firebase initialization and all adapter
 * operations must happen only after it returns successfully.
 */
export function assertHostedStagingIntent({ argv, env, resolvedProjectId } = {}) {
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

  if (resolvedProjectId !== STAGING_PROJECT_ID) {
    throw new Error('Firebase Admin resolved project does not match staging.');
  }

  return { projectId: STAGING_PROJECT_ID };
}
