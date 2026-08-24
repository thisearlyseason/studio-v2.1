import assert from 'node:assert/strict';
import test from 'node:test';

import {buildContentSecurityPolicy} from '../src/lib/content-security-policy.ts';

const productionPolicy = "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com js.stripe.com connect-js.stripe.com *.stripe.com elfsightcdn.com *.elfsightcdn.com; style-src 'self' 'unsafe-inline' fonts.googleapis.com; font-src 'self' fonts.gstatic.com; img-src 'self' data: blob: https: storage.googleapis.com *.firebasestorage.app placehold.co images.unsplash.com picsum.photos api.dicebear.com freeimage.host; media-src 'self' blob: data: https: storage.googleapis.com *.firebasestorage.app; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.firebase.com https://*.firebaseapp.com https://api.stripe.com https://*.stripe.com https://freeimage.host wss://*.firebaseio.com elfsight.com *.elfsight.com elfsightcdn.com *.elfsightcdn.com https://wttr.in https://nominatim.openstreetmap.org; frame-src 'self' https://*.firebaseapp.com js.stripe.com connect-js.stripe.com *.stripe.com checkout.stripe.com hooks.stripe.com elfsight.com *.elfsight.com elfsightcdn.com *.elfsightcdn.com youtube.com *.youtube.com youtu.be *.youtu.be www.youtube-nocookie.com; worker-src 'self' blob:; child-src 'self' blob:";

const emulatorConnectSources = 'http://localhost:9099 http://127.0.0.1:9099 http://localhost:8080 http://127.0.0.1:8080 http://localhost:9199 http://127.0.0.1:9199 ws://localhost:8080 ws://127.0.0.1:8080';
const developmentPolicy = productionPolicy.replace(
  "connect-src 'self' ",
  `connect-src 'self' ${emulatorConnectSources} `,
);

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

test('CSP production isolation rejects the mutation that leaks local emulator sources', () => {
  const productionWithEmulatorFlag = buildContentSecurityPolicy({
    environment: 'production',
    firebaseEmulatorsEnabled: true,
  });

  assert.equal(productionWithEmulatorFlag, productionPolicy);
  assert.doesNotMatch(productionWithEmulatorFlag, /(?:localhost|127\.0\.0\.1|ws:\/\/|:(?:8080|9099|9199))/);
});
