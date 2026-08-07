import assert from 'node:assert/strict';
import test from 'node:test';
import * as policyModule from '../src/lib/storage-upload-policy.ts';

const { MAX_IMAGE_UPLOAD_BYTES, validateRasterImage } = policyModule;

test('client image validation matches Storage raster and size restrictions', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/gif']) {
    assert.equal(validateRasterImage({ type, size: 1024 }), null);
  }
  assert.match(validateRasterImage({ type: 'image/svg+xml', size: 1024 }), /JPEG/);
  assert.match(validateRasterImage({ type: 'text/plain', size: 1024 }), /JPEG/);
  assert.match(validateRasterImage({ type: 'image/jpeg', size: MAX_IMAGE_UPLOAD_BYTES + 1 }), /5 MB/);
});
