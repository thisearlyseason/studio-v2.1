import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isSafeRichTextUrl,
  renderSafeRichTextInline,
  richTextMarkdownToEditorHtml,
} from '../src/lib/rich-text.ts';

test('visual editor HTML renders supported rich text and inline images', () => {
  const html = richTextMarkdownToEditorHtml(
    '## Weekly update\n\nA **bold** and *visual* update.\n\n- First\n- Second\n\n![Team](https://example.com/team.jpg)',
  );
  assert.match(html, /<h2>Weekly update<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /<em>visual<\/em>/);
  assert.match(html, /<ul><li>First<\/li><li>Second<\/li><\/ul>/);
  assert.match(html, /<img src="https:\/\/example\.com\/team\.jpg"/);
});

test('rich text escapes markup and rejects unsafe URLs', () => {
  const html = renderSafeRichTextInline('<script>alert(1)</script> ![x](javascript:alert(1))');
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img/);
  assert.equal(isSafeRichTextUrl('javascript:alert(1)'), false);
  assert.equal(isSafeRichTextUrl('http://example.com'), false);
  assert.equal(isSafeRichTextUrl('https://example.com'), true);
});
