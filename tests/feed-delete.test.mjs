import assert from 'node:assert/strict';
import test from 'node:test';
import { deleteFeedPostOptimistically } from '../src/lib/feed-delete.ts';

test('feed deletion hides the post before the remote delete settles', async () => {
  const events = [];
  let finishDelete;
  const deletion = deleteFeedPostOptimistically({
    postId: 'post-a',
    hide: postId => events.push(`hide:${postId}`),
    restore: postId => events.push(`restore:${postId}`),
    deleteRemote: () => new Promise(resolve => { finishDelete = resolve; }),
  });

  assert.deepEqual(events, ['hide:post-a']);
  finishDelete();
  await deletion;
  assert.deepEqual(events, ['hide:post-a']);
});

test('feed deletion restores the post when the remote delete fails', async () => {
  const events = [];
  const failure = new Error('delete failed');

  await assert.rejects(
    deleteFeedPostOptimistically({
      postId: 'post-b',
      hide: postId => events.push(`hide:${postId}`),
      restore: postId => events.push(`restore:${postId}`),
      deleteRemote: async () => { throw failure; },
    }),
    failure,
  );
  assert.deepEqual(events, ['hide:post-b', 'restore:post-b']);
});

test('feed deletion keeps an already-absent post hidden', async () => {
  const events = [];
  const missing = Object.assign(new Error('Post not found.'), { status: 404 });

  await deleteFeedPostOptimistically({
    postId: 'post-c',
    hide: postId => events.push(`hide:${postId}`),
    restore: postId => events.push(`restore:${postId}`),
    deleteRemote: async () => { throw missing; },
  });
  assert.deepEqual(events, ['hide:post-c']);
});
