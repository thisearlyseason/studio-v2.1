import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { buildPublicRecruitingProfile } from '../src/lib/public-recruiting-profile.ts';

test('public recruiting payload excludes player, guardian, invite, contact, and evaluation data', () => {
  const payload = buildPublicRecruitingProfile({
    player: {
      firstName: 'Alex', lastName: 'Rivera', dateOfBirth: '2011-02-03',
      parentId: 'guardian-1', userId: 'player-1', pendingInviteEmail: 'private@example.test',
      inviteToken: 'secret-token', skills: ['Serving'], photoURL: 'https://cdn.example/player.jpg',
    },
    profile: {
      fullName: 'Alex Rivera', playerEmail: 'player@example.test', parentEmail: 'guardian@example.test',
      bio: 'Outside hitter', photos: ['https://cdn.example/photo.jpg'],
    },
    metrics: { verticalJump: 28, medicalNotes: 'private', customStats: [{ label: 'Reach', value: '9ft 8in' }] },
    stats: [{ season: '2026', gamesPlayed: 10, points: 40, assists: 8, privateNote: 'do not publish' }],
    videos: [{ id: 'video-1', url: 'https://cdn.example/video.mp4', title: 'Highlights', internalReview: 'private' }],
  });

  assert.deepEqual(payload.player, {
    firstName: 'Alex', lastName: 'Rivera', skills: ['Serving'], photoURL: 'https://cdn.example/player.jpg',
  });
  assert.deepEqual(payload.profile, {
    fullName: 'Alex Rivera', bio: 'Outside hitter', photos: ['https://cdn.example/photo.jpg'],
  });
  assert.deepEqual(payload.metrics, { verticalJump: 28, customStats: [{ label: 'Reach', value: '9ft 8in' }] });
  assert.deepEqual(payload.stats, [{ season: '2026', gamesPlayed: 10, points: 40, assists: 8 }]);
  assert.deepEqual(payload.videos, [{
    id: 'video-1', url: 'https://cdn.example/video.mp4', thumbnailUrl: undefined,
    title: 'Highlights', description: undefined, type: 'video', isTacticalClip: false,
    startAt: undefined, endAt: undefined, segments: undefined,
  }]);
});

test('public recruiting payload rejects non-HTTPS media URLs', () => {
  const payload = buildPublicRecruitingProfile({
    player: { photoURL: 'javascript:alert(1)' }, profile: { photos: ['http://unsafe.example/photo.jpg'] },
    metrics: {}, stats: [], videos: [{ id: 'bad', url: 'http://unsafe.example/video.mp4' }],
  });
  assert.deepEqual(payload.player, {});
  assert.deepEqual(payload.profile, {});
  assert.deepEqual(payload.videos, []);
});

test('private player documents are no longer the public recruiting transport', () => {
  const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const publicPage = fs.readFileSync(new URL('../src/app/recruit/player/[playerId]/page.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(rules, /allow read: if resource\.data\.get\('recruitingProfileEnabled'/);
  assert.match(publicPage, /\/api\/public\/recruiting\//);
  assert.doesNotMatch(publicPage, /recruitingContact/);
});

test('a guardian retains update access to their own child without making the record public', () => {
  const rules = fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /resource\.data\.get\('parentId', ''\) == request\.auth\.uid/);
  assert.match(rules, /documents\/players\/\$\(playerId\)\)\.data\.get\('parentId', ''\) == request\.auth\.uid/);
});
