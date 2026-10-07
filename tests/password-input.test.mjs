import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PasswordInput } from '../src/components/ui/password-input.tsx';

test('password control starts masked and preserves form and autofill attributes', () => {
  const html = renderToStaticMarkup(React.createElement(PasswordInput, { id: 'test-password', name: 'password', autoComplete: 'new-password', required: true, minLength: 8 }));
  for (const expected of ['type="password"', 'name="password"', 'autoComplete="new-password"', 'required=""', 'minLength="8"', 'type="button"', 'aria-controls="test-password"', 'aria-label="Show password"', 'aria-pressed="false"']) assert.ok(html.includes(expected), expected);
});

test('disabled password input also disables visibility control', () => {
  const html = renderToStaticMarkup(React.createElement(PasswordInput, { disabled: true }));
  assert.equal((html.match(/disabled=""/g) || []).length, 2);
});

test('generated field identities connect each visibility control to its input', () => {
  const html = renderToStaticMarkup(React.createElement('div', null, React.createElement(PasswordInput), React.createElement(PasswordInput)));
  const ids = [...html.matchAll(/<input[^>]*id="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, 2);
  for (const id of ids) assert.ok(html.includes(`aria-controls="${id}"`));
});
