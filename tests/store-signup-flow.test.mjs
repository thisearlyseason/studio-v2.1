import assert from 'node:assert/strict';
import test from 'node:test';

import {
  onboardingDestinationForRole,
  signupBackStep,
  signupNextState,
  signupPostVerificationPath,
  signupSteps,
} from '../src/lib/store-signup-policy.ts';

test('store signup sends every role through the existing free path', () => {
  const cases = [
    ['self', { step: 'join_team', planChoice: 'starter' }],
    ['child', { step: 'join_team', planChoice: 'starter' }],
    ['coach', { step: 'account', planChoice: 'starter' }],
    ['school_ad', { step: 'account', planChoice: 'starter' }],
    ['league_creator', { step: 'account', planChoice: 'starter' }],
  ];

  for (const [target, expected] of cases) {
    assert.deepEqual(signupNextState(target, 'store'), expected, target);
  }
});

test('store signup progress and back navigation agree with the skipped plan step', () => {
  assert.deepEqual(signupSteps('coach', 'store'), ['target', 'account']);
  assert.deepEqual(signupSteps('school_ad', 'store'), ['target', 'account']);
  assert.deepEqual(signupSteps('league_creator', 'store'), ['target', 'account']);
  assert.deepEqual(signupSteps('self', 'store'), ['target', 'join_team', 'account']);
  assert.equal(signupBackStep('coach', 'store'), 'target');
  assert.equal(signupBackStep('school_ad', 'store'), 'target');
  assert.equal(signupBackStep('child', 'store'), 'join_team');

  assert.deepEqual(signupSteps('coach', 'web'), ['target', 'plan', 'account']);
  assert.equal(signupBackStep('coach', 'web'), 'plan');
});

test('store post-verification destinations preserve joins and never return to purchase', () => {
  const cases = [
    [{ target: 'self', joinCode: 'demo_c', planChoice: 'starter' }, '/teams/join?code=DEMO_C'],
    [
      { target: 'child', joinCode: 'demo_c', planChoice: 'starter' },
      '/family?addChild=1&returnTo=%2Fteams%2Fjoin%3Fcode%3DDEMO_C',
    ],
    [{ target: 'child', joinCode: '', planChoice: 'starter' }, '/dashboard'],
    [{ target: 'coach', joinCode: '', planChoice: 'starter' }, '/dashboard'],
    [{ target: 'school_ad', joinCode: '', planChoice: 'school' }, '/dashboard'],
    [{ target: 'league_creator', joinCode: '', planChoice: 'elite_league' }, '/dashboard'],
  ];

  for (const [input, expected] of cases) {
    assert.equal(signupPostVerificationPath(input, 'store'), expected, input.target);
  }

  assert.equal(
    signupPostVerificationPath({ target: 'coach', joinCode: '', planChoice: 'pro_team' }, 'web'),
    '/pricing',
  );
});

test('new free profiles land on the dashboard on both distributions', () => {
  for (const distribution of ['web', 'store']) {
    for (const role of ['adult_player', 'parent', 'coach', 'admin', 'league_creator']) {
      assert.equal(onboardingDestinationForRole(role, distribution), '/dashboard');
    }
    for (const target of ['self', 'child', 'coach', 'school_ad', 'league_creator']) {
      assert.equal(signupPostVerificationPath({ target, joinCode: '', planChoice: 'starter' }, distribution), '/dashboard');
    }
  }
});
