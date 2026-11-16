import { analytics } from '@heycatch/sdk';

// This repository serves both the website and the signed-in app, so the guide
// says to leave the landing-only site tag unset. Next runs this before hydration.
analytics.init({
  projectKey: 'hck_pk_APvOG4sebjLfK6k-1DXlNpFKJICaSF8m',
  install: { framework: 'nextjs', frameworkVersion: '15', agent: 'codex' },
});
