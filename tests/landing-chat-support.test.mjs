import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldUseNativeChatFallback } from '../src/lib/landing-chat-support.ts';

test('uses the native support fallback for Safari and iOS WebKit browsers', () => {
  assert.equal(
    shouldUseNativeChatFallback(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.6 Safari/605.1.15'
    ),
    true
  );
  assert.equal(
    shouldUseNativeChatFallback(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 CriOS/138.0 Mobile/15E148 Safari/604.1'
    ),
    true
  );
});

test('keeps the Elfsight chatbot on supported Chromium and Firefox engines', () => {
  assert.equal(
    shouldUseNativeChatFallback(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/138.0 Safari/537.36'
    ),
    false
  );
  assert.equal(
    shouldUseNativeChatFallback(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.7; rv:141.0) Gecko/20100101 Firefox/141.0'
    ),
    false
  );
});
