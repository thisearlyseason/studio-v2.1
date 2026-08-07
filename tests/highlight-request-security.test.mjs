import assert from 'node:assert/strict';
import test from 'node:test';
import * as highlightModule from '../src/lib/highlight-request-security.ts';
import * as guardModule from '../src/lib/server-request-guards.ts';

const {
  parseAllowedFrameUrl,
  parseHighlightAnalyzeBody,
  parseHighlightGenerateBody,
} = highlightModule;
const { getTrustedAppOrigin } = guardModule;

test('highlight frames accept only exact approved HTTPS image hosts', () => {
  assert.equal(
    parseAllowedFrameUrl('https://firebasestorage.googleapis.com/v0/b/example/o/frame.jpg?alt=media'),
    'https://firebasestorage.googleapis.com/v0/b/example/o/frame.jpg?alt=media',
  );
  assert.equal(parseAllowedFrameUrl('https://iili.io/example.jpg'), 'https://iili.io/example.jpg');

  assert.throws(() => parseAllowedFrameUrl('http://iili.io/example.jpg'), /approved image host/);
  assert.throws(() => parseAllowedFrameUrl('https://iili.io.evil.example/frame.jpg'), /approved image host/);
  assert.throws(() => parseAllowedFrameUrl('https://user:pass@iili.io/frame.jpg'), /approved image host/);
});

test('highlight analysis bounds frames, timestamps, prompts, and video duration', () => {
  const parsed = parseHighlightAnalyzeBody({
    frameUrls: [{ timestamp: 5, url: 'https://storage.googleapis.com/example/frame.jpg' }],
    prompt: 'Find the best play',
    videoDuration: 60,
  });
  assert.equal(parsed.frameUrls.length, 1);
  assert.equal(parsed.prompt, 'Find the best play');

  assert.throws(() => parseHighlightAnalyzeBody({
    frames: Array.from({ length: 25 }, (_, timestamp) => ({ timestamp })),
    prompt: 'Find plays',
    videoDuration: 60,
  }), /maximum of 24 frames/);
  assert.throws(() => parseHighlightAnalyzeBody({
    frames: [{ timestamp: 61 }],
    prompt: 'Find plays',
    videoDuration: 60,
  }), /within the video duration/);
});

test('URL-only highlight input rejects non-web URLs and embedded credentials', () => {
  assert.throws(() => parseHighlightGenerateBody({
    videoUrl: 'file:///etc/passwd',
    prompt: 'Find plays',
    videoDuration: 60,
  }), /HTTP or HTTPS/);
  assert.throws(() => parseHighlightGenerateBody({
    videoUrl: 'https://user:pass@example.com/video',
    prompt: 'Find plays',
    videoDuration: 60,
  }), /embedded credentials/);
});

test('Stripe return URLs ignore a forged request origin', () => {
  const prior = process.env.NEXT_PUBLIC_APP_URL;
  process.env.NEXT_PUBLIC_APP_URL = 'https://www.thesquad.pro';
  try {
    const forgedRequest = { headers: new Headers({ origin: 'https://evil.example' }) };
    assert.equal(getTrustedAppOrigin(forgedRequest), 'https://www.thesquad.pro');

    const realRequest = { headers: new Headers({ origin: 'https://www.thesquad.pro' }) };
    assert.equal(getTrustedAppOrigin(realRequest), 'https://www.thesquad.pro');
  } finally {
    if (prior === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
    else process.env.NEXT_PUBLIC_APP_URL = prior;
  }
});
