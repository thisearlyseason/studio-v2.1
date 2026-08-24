export type ContentSecurityPolicyInput = {
  environment: string | undefined;
  firebaseEmulatorsEnabled: boolean;
};

const firebaseEmulatorConnectSources = [
  'http://localhost:9099',
  'http://127.0.0.1:9099',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://localhost:9199',
  'http://127.0.0.1:9199',
  'ws://localhost:8080',
  'ws://127.0.0.1:8080',
];

export function buildContentSecurityPolicy({
  environment,
  firebaseEmulatorsEnabled,
}: ContentSecurityPolicyInput): string {
  const useFirebaseEmulatorSources =
    environment !== 'production' && firebaseEmulatorsEnabled === true;
  const connectSources = [
    "'self'",
    ...(useFirebaseEmulatorSources ? firebaseEmulatorConnectSources : []),
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'https://*.firebase.com',
    'https://*.firebaseapp.com',
    'https://api.stripe.com',
    'https://*.stripe.com',
    'https://freeimage.host',
    'wss://*.firebaseio.com',
    'elfsight.com',
    '*.elfsight.com',
    'elfsightcdn.com',
    '*.elfsightcdn.com',
    'https://wttr.in',
    'https://nominatim.openstreetmap.org',
  ];

  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com js.stripe.com connect-js.stripe.com *.stripe.com elfsightcdn.com *.elfsightcdn.com",
    "style-src 'self' 'unsafe-inline' fonts.googleapis.com",
    "font-src 'self' fonts.gstatic.com",
    "img-src 'self' data: blob: https: storage.googleapis.com *.firebasestorage.app placehold.co images.unsplash.com picsum.photos api.dicebear.com freeimage.host",
    "media-src 'self' blob: data: https: storage.googleapis.com *.firebasestorage.app",
    `connect-src ${connectSources.join(' ')}`,
    "frame-src 'self' https://*.firebaseapp.com js.stripe.com connect-js.stripe.com *.stripe.com checkout.stripe.com hooks.stripe.com elfsight.com *.elfsight.com elfsightcdn.com *.elfsightcdn.com youtube.com *.youtube.com youtu.be *.youtu.be www.youtube-nocookie.com",
    "worker-src 'self' blob:",
    "child-src 'self' blob:",
  ].join('; ');
}
