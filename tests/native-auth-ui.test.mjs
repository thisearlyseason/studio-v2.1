import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NativeFreeOnboarding } from '../src/components/native-auth/NativeFreeOnboarding.tsx';

test('native free onboarding has explicit consent and no nested form or payment choice', () => {
  const html = renderToStaticMarkup(React.createElement(NativeFreeOnboarding, { initialJoinCode: 'QA_CODE', onSubmit() {} }));
  assert.match(html, /Create your free account/);
  assert.match(html, /QA_CODE/);
  assert.match(html, /18 or older/);
  assert.match(html, /signup\/youth/);
  assert.doesNotMatch(html, /<form|checked=""|href="\/pricing|href="\/checkout/);
  for (const role of ['Adult athlete', 'Parent', 'Coach', 'School administrator', 'League organizer']) assert.ok(html.includes(role));
});
