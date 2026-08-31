import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import test from 'node:test';

import {buildContentSecurityPolicy} from '../src/lib/content-security-policy.ts';

const productionPolicy = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com js.stripe.com connect-js.stripe.com *.stripe.com elfsightcdn.com *.elfsightcdn.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com; img-src 'self' data: blob: https: storage.googleapis.com *.firebasestorage.app placehold.co images.unsplash.com picsum.photos api.dicebear.com freeimage.host; media-src 'self' blob: data: https: storage.googleapis.com *.firebasestorage.app; connect-src 'self' https://apis.google.com https://*.googleapis.com https://*.firebaseio.com https://*.firebase.com https://*.firebaseapp.com https://api.stripe.com https://*.stripe.com https://freeimage.host wss://*.firebaseio.com elfsight.com *.elfsight.com elfsightcdn.com *.elfsightcdn.com https://wttr.in https://nominatim.openstreetmap.org; frame-src 'self' https://*.firebaseapp.com js.stripe.com connect-js.stripe.com *.stripe.com checkout.stripe.com hooks.stripe.com elfsight.com *.elfsight.com elfsightcdn.com *.elfsightcdn.com youtube.com *.youtube.com youtu.be *.youtu.be www.youtube-nocookie.com; worker-src 'self' blob:; child-src 'self' blob:";

const emulatorConnectSources = 'http://localhost:9099 http://127.0.0.1:9099 http://localhost:8080 http://127.0.0.1:8080 http://localhost:9199 http://127.0.0.1:9199 ws://localhost:8080 ws://127.0.0.1:8080';
const developmentPolicy = productionPolicy.replace(
  "connect-src 'self' ",
  `connect-src 'self' ${emulatorConnectSources} `,
);

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localEmulatorSourcePattern = /(?:localhost|127\.0\.0\.1|ws:\/\/|:(?:8080|9099|9199))/;

function readNextConfigPolicies(environment, firebaseEmulatorsEnabled) {
  const childEnvironment = {
    ...process.env,
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS: firebaseEmulatorsEnabled ? 'true' : 'false',
  };

  if (environment === undefined) {
    delete childEnvironment.NODE_ENV;
  } else {
    childEnvironment.NODE_ENV = environment;
  }

  const script = `
    import nextConfig from './next.config.ts';
    const rules = await nextConfig.headers();
    const policies = rules.map(rule =>
      rule.headers.find(header => header.key === 'Content-Security-Policy')?.value,
    );
    process.stdout.write(JSON.stringify(policies));
  `;
  const result = spawnSync(
    process.execPath,
    ['--import', 'tsx', '--input-type=module', '--eval', script],
    {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: childEnvironment,
    },
  );

  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test('CSP permits only exact local Firebase emulator transports during development', () => {
  assert.equal(
    buildContentSecurityPolicy({environment: 'development', firebaseEmulatorsEnabled: true}),
    developmentPolicy,
  );
  assert.equal(
    buildContentSecurityPolicy({environment: 'development', firebaseEmulatorsEnabled: false}),
    productionPolicy,
  );
});

test('CSP excludes local emulator transports outside explicit development', () => {
  for (const environment of ['production', 'test', 'staging', undefined]) {
    const policy = buildContentSecurityPolicy({
      environment,
      firebaseEmulatorsEnabled: true,
    });

    assert.equal(policy, productionPolicy, `unexpected policy for ${String(environment)}`);
    assert.doesNotMatch(policy, localEmulatorSourcePattern);
  }
});

test('CSP permits the exact Google API host used by the authenticated gapi iframe', () => {
  const policy = buildContentSecurityPolicy({
    environment: 'production',
    firebaseEmulatorsEnabled: false,
  });
  const connectDirective = policy
    .split('; ')
    .find(directive => directive.startsWith('connect-src '));

  assert.ok(connectDirective, 'connect-src directive is required');
  const sources = connectDirective.split(' ').slice(1);
  assert.equal(
    sources.filter(source => source === 'https://apis.google.com').length,
    1,
    'the exact gapi host must be admitted once without broadening to another wildcard',
  );
});

test('Next.js headers expose emulator transports only for explicit development with the flag', () => {
  for (const environment of ['production', 'test', 'staging', undefined]) {
    const policies = readNextConfigPolicies(environment, true);

    assert.deepEqual(
      policies,
      [
        `${productionPolicy}; frame-ancestors *`,
        productionPolicy,
      ],
      `unexpected Next.js policies for ${String(environment)}`,
    );
    for (const policy of policies) {
      assert.doesNotMatch(policy, localEmulatorSourcePattern);
    }
  }

  assert.deepEqual(
    readNextConfigPolicies('development', true),
    [
      `${developmentPolicy}; frame-ancestors *`,
      developmentPolicy,
    ],
  );
});
