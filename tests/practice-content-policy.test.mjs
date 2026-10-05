import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_PRACTICE_DESCRIPTION_LENGTH,
  MAX_PRACTICE_TITLE_LENGTH,
  MAX_PRACTICE_URL_LENGTH,
  MAX_PRACTICE_VIDEO_BYTES,
  parsePracticeTimestamp,
  validatePracticeDrill,
  validatePracticeFilmFile,
  validatePracticeTemplate,
  validatePracticeUrl,
} from '../src/lib/practice-content-policy.ts';

test('practice templates reject empty blocks, invalid durations, and oversized text', () => {
  assert.match(validatePracticeTemplate({ title: '', description: '', drillIds: [] }, []), /title/i);
  assert.match(validatePracticeTemplate({ title: 'Plan', description: '', drillIds: [] }, []), /drill/i);
  assert.match(validatePracticeTemplate({ title: 'x'.repeat(MAX_PRACTICE_TITLE_LENGTH + 1), description: '', drillIds: ['d1'] }, [{ id: 'd1', estimatedTime: '10 min' }]), /title/i);
  assert.match(validatePracticeTemplate({ title: 'Plan', description: 'x'.repeat(MAX_PRACTICE_DESCRIPTION_LENGTH + 1), drillIds: ['d1'] }, [{ id: 'd1', estimatedTime: '10 min' }]), /description/i);
  assert.match(validatePracticeTemplate({ title: 'Plan', description: '', drillIds: ['d1'] }, [{ id: 'd1', estimatedTime: '-2 min' }]), /duration/i);
  assert.equal(validatePracticeTemplate({ title: 'Plan', description: 'Safe', drillIds: ['d1'] }, [{ id: 'd1', estimatedTime: '10 min' }]), null);
});

test('drills reject empty and duplicate submissions and invalid durations', () => {
  assert.match(validatePracticeDrill({ title: '', description: 'Steps', estimatedTime: '10 min' }, []), /title/i);
  assert.match(validatePracticeDrill({ title: 'Drill', description: '', estimatedTime: '10 min' }, []), /instructions/i);
  assert.match(validatePracticeDrill({ title: ' Drill ', description: 'Steps', estimatedTime: '10 min' }, [{ id: 'other', title: 'drill' }]), /already exists/i);
  assert.match(validatePracticeDrill({ title: 'New', description: 'Steps', estimatedTime: 'abc' }, []), /duration/i);
  assert.equal(validatePracticeDrill({ title: 'New', description: 'Steps', estimatedTime: '15 mins' }, []), null);
});

test('practice links allow public HTTPS and reject javascript, credentials, private hosts, malformed and overlong values', () => {
  assert.equal(validatePracticeUrl('https://www.youtube.com/watch?v=abcdefghijk'), null);
  for (const value of [
    'javascript:alert(1)',
    'https://user:password@example.com/video',
    'https://127.0.0.1/video',
    'https://10.1.2.3/video',
    'https://192.168.1.2/video',
    'https://172.16.2.3/video',
    'https://localhost/video',
    'not a url',
    `https://example.com/${'x'.repeat(MAX_PRACTICE_URL_LENGTH)}`,
  ]) assert.ok(validatePracticeUrl(value), value);
});

test('film files enforce the exact video MIME and size boundary', () => {
  assert.equal(validatePracticeFilmFile({ type: 'video/mp4', size: MAX_PRACTICE_VIDEO_BYTES }), null);
  assert.match(validatePracticeFilmFile({ type: 'application/octet-stream', size: 2 }), /MP4|WebM|QuickTime/i);
  assert.match(validatePracticeFilmFile({ type: 'video/mp4', size: MAX_PRACTICE_VIDEO_BYTES + 1 }), /500 MB/i);
});

test('coach mark timestamps reject negative, NaN, invalid seconds and beyond-duration values', () => {
  assert.equal(parsePracticeTimestamp('1:24', 120), 84);
  for (const value of ['-1:00', 'NaN', '1:60', '1:x', '']) assert.throws(() => parsePracticeTimestamp(value, 120), /timestamp/i);
  assert.throws(() => parsePracticeTimestamp('2:01', 120), /duration/i);
});
