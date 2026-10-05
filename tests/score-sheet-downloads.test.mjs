import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { SCORE_SHEET_RESOURCES } from '../src/lib/sports-hub-score-sheets.ts';

test('every score sheet offers distinct, correctly oriented printable PDF downloads', async () => {
  for (const sheet of SCORE_SHEET_RESOURCES) {
    assert.ok(sheet.portraitDownloadUrl, `${sheet.id} must offer portrait`);
    assert.notEqual(sheet.downloadUrl, sheet.portraitDownloadUrl);
    for (const [url, portrait] of [[sheet.downloadUrl, false], [sheet.portraitDownloadUrl, true]]) {
      const pdf = await readFile(new URL(`../public${url}`, import.meta.url), 'latin1');
      assert.ok(pdf.startsWith('%PDF-'), `${url} must be a PDF`);
      const boxes = [...pdf.matchAll(/\/MediaBox\s*\[0 0 ([\d.]+) ([\d.]+)\]/g)];
      assert.ok(boxes.length > 1, `${url} includes scoring and guide pages`);
      for (const [, width, height] of boxes) {
        assert.equal(Math.round(Number(width)), portrait ? 612 : 792, url);
        assert.equal(Math.round(Number(height)), portrait ? 792 : 612, url);
      }
    }
  }
});
