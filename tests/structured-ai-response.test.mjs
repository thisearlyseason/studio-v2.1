import assert from 'node:assert/strict';
import test from 'node:test';
import * as structuredResponse from '../src/lib/structured-ai-response.ts';

const { parseStructuredAiResponse } = structuredResponse;

test('structured AI responses accept plain and fenced JSON only', () => {
  assert.deepEqual(
    parseStructuredAiResponse('{"question":"Practice time?","options":["5 PM","6 PM"]}'),
    { question: 'Practice time?', options: ['5 PM', '6 PM'] },
  );
  assert.deepEqual(
    parseStructuredAiResponse('```json\n{"strengths":"Speed"}\n```'),
    { strengths: 'Speed' },
  );
});

test('structured AI responses extract one object without evaluating surrounding text', () => {
  assert.deepEqual(
    parseStructuredAiResponse('Here is the result: {"question":"Travel?","options":["Bus","Car"]}'),
    { question: 'Travel?', options: ['Bus', 'Car'] },
  );
  assert.throws(
    () => parseStructuredAiResponse('not valid JSON'),
    /invalid structured response/,
  );
});
