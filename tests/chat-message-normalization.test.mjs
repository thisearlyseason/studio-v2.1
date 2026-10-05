import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeChatMessage } from '../src/lib/chat-message-normalization.ts';

test('legacy chat messages normalize sender, text, type, and Firestore timestamp', () => {
  assert.deepEqual(normalizeChatMessage({
    id: 'legacy-1',
    senderId: 'user-1',
    senderName: 'Legacy Player',
    text: 'Legacy update',
    createdAt: { seconds: 1_700_000_000, nanoseconds: 0 },
  }), {
    id: 'legacy-1',
    senderId: 'user-1',
    senderName: 'Legacy Player',
    text: 'Legacy update',
    createdAt: '2023-11-14T22:13:20.000Z',
    authorId: 'user-1',
    author: 'Legacy Player',
    content: 'Legacy update',
    type: 'text',
  });
});

test('modern chat message fields are preserved', () => {
  const message = {
    id: 'modern-1', authorId: 'user-2', author: 'Coach', content: 'Ready',
    type: 'text', createdAt: '2026-09-04T12:00:00.000Z',
  };
  assert.deepEqual(normalizeChatMessage(message), message);
});

test('missing legacy display fields receive safe renderable fallbacks', () => {
  const result = normalizeChatMessage({ id: 'legacy-2', createdAt: null });
  assert.equal(result.author, 'Squad Member');
  assert.equal(result.authorId, 'unknown');
  assert.equal(result.content, '');
  assert.equal(result.type, 'text');
  assert.equal(Number.isNaN(Date.parse(result.createdAt)), false);
});
