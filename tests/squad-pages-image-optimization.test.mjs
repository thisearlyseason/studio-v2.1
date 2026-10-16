import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { crc32 } from 'node:zlib';
import { build } from 'esbuild';
import sharp from 'sharp';
import { optimizePageUpload, pageImageVariant, PAGE_IMAGE_MAX_BYTES } from '../src/lib/squad-pages/image-optimization.ts';

const root = new URL('../', import.meta.url).pathname;
const photoSource = await readFile(new URL('../public/images/sports/football.webp', import.meta.url));
const photo = await sharp(photoSource).resize(2800, 1700, { fit: 'cover' }).jpeg({ quality: 96, chromaSubsampling: '4:4:4' }).toBuffer();
const logo = await sharp(Buffer.from('<svg width="600" height="240"><rect x="20" y="20" width="560" height="200" rx="24" fill="#009cde" fill-opacity=".65"/><path d="M50 170L120 50L190 170Z" fill="#fb3948"/><text x="210" y="145" font-size="64" fill="white">SQUAD</text></svg>')).png().toBuffer();
function chunk(type, data) { const name = Buffer.from(type), length = Buffer.alloc(4), crc = Buffer.alloc(4); length.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([name, data]))); return Buffer.concat([length, name, data, crc]); }
function pngText(input) { return Buffer.concat([input.subarray(0, -12), chunk('tEXt', Buffer.from('Comment\0PRIVATE LOCATION / CAMERA OWNER')), input.subarray(-12)]); }
async function pixels(input, width, height) { return sharp(input).rotate().resize({ width, height, fit: 'inside', withoutEnlargement: true }).toColourspace('srgb').ensureAlpha().raw().toBuffer({ resolveWithObject: true }); }
async function compare(a, b) {
  const x = await sharp(a).ensureAlpha().raw().toBuffer({ resolveWithObject: true }), y = await sharp(b).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(x.info.width, y.info.width); assert.equal(x.info.height, y.info.height);
  let mse = 0, maxVisibleDelta = 0, alphaDelta = 0;
  for (let i = 0; i < x.data.length; i += 4) {
    alphaDelta = Math.max(alphaDelta, Math.abs(x.data[i + 3] - y.data[i + 3]));
    for (let c = 0; c < 3; c++) {
      const delta = x.data[i + c] * x.data[i + 3] / 255 - y.data[i + c] * y.data[i + 3] / 255;
      mse += delta ** 2; maxVisibleDelta = Math.max(maxVisibleDelta, Math.abs(delta));
    }
  }
  mse /= x.info.width * x.info.height * 3;
  return { psnr: mse ? 10 * Math.log10(255 ** 2 / mse) : Infinity, maxVisibleDelta, alphaDelta };
}

test('large actual photograph saves bytes with proportional bounded dimensions and high visual fidelity', async () => {
  const result = await optimizePageUpload(photo, 'image/jpeg');
  const meta = await sharp(result.bytes).metadata();
  assert(result.bytes.length < photo.length * .8); assert(meta.width <= 2048 && meta.height <= 2048);
  assert(Math.abs(meta.width / meta.height - 2800 / 1700) < .002);
  const reference = await sharp(photo).rotate().resize({ width: 2048, height: 2048, fit: 'inside' }).png().toBuffer();
  assert((await compare(reference, result.bytes)).psnr > 34);
  assert(!meta.exif && !meta.iptc && !meta.xmp); assert.equal(result.optimization.storedBytes, result.bytes.length);
});
test('transparent logo preserves every visible colour and alpha sample without enlargement', async () => {
  const result = await optimizePageUpload(pngText(logo), 'image/png', 'logo');
  const meta = await sharp(result.bytes).metadata(), quality = await compare(logo, result.bytes);
  assert.deepEqual([meta.width, meta.height], [600, 240]); assert(meta.hasAlpha);
  assert.equal(quality.alphaDelta, 0); assert(quality.maxVisibleDelta < .01);
  assert.equal(result.optimization.losslessEncoding, true); assert(result.bytes.length <= logo.length);
  assert(!result.bytes.includes(Buffer.from('PRIVATE LOCATION')));
});
test('transparency is protected even when a transparent raster is uploaded as a photo', async () => {
  const result = await optimizePageUpload(logo, 'image/png', 'photo');
  assert.equal(result.optimization.losslessEncoding, true); assert.equal((await compare(logo, result.bytes)).alphaDelta, 0);
});
test('all eight EXIF orientations preserve appearance and remove private EXIF', async () => {
  for (let orientation = 1; orientation <= 8; orientation++) {
    const input = await sharp(logo).withMetadata({ orientation }).withExifMerge({ IFD0: { Artist: 'PRIVATE PERSON', ImageDescription: 'PRIVATE LOCATION' } }).png().toBuffer();
    const result = await optimizePageUpload(input, 'image/png', 'logo'), meta = await sharp(result.bytes).metadata();
    const expected = await sharp(input).rotate().png().toBuffer();
    assert.equal((await compare(expected, result.bytes)).alphaDelta, 0); assert((await compare(expected, result.bytes)).maxVisibleDelta < .01);
    assert(!meta.exif && !meta.xmp && !meta.iptc); assert(!result.bytes.includes(Buffer.from('PRIVATE PERSON')));
    assert.equal(meta.width, orientation >= 5 ? 240 : 600); assert.equal(meta.height, orientation >= 5 ? 600 : 240);
  }
});
test('already compact image keeps safe original encoding rather than storing a larger conversion', async () => {
  const input = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#ff0000' } }).webp({ lossless: true }).toBuffer();
  const result = await optimizePageUpload(input, 'image/webp', 'logo');
  assert(result.bytes.length <= input.length); assert.equal(result.optimization.savedBytes, 0);
  assert.equal(result.optimization.originalEncodingRetained, true); assert.deepEqual(result.bytes, input);
});
test('progressive compact JPEG removes camera metadata without recompression or colour loss when it wins', async () => {
  const input = await sharp(photoSource).resize(500, 300).jpeg({ quality: 8, progressive: true }).withExif({ IFD0: { Artist: 'PRIVATE PERSON' } }).toBuffer();
  const result = await optimizePageUpload(input, 'image/jpeg', 'logo');
  assert.equal(result.optimization.originalEncodingRetained, true); assert.equal(result.mime, 'image/jpeg');
  assert(!result.bytes.includes(Buffer.from('PRIVATE PERSON'))); assert(!(await sharp(result.bytes).metadata()).exif);
  assert.equal((await compare(input, result.bytes)).maxVisibleDelta, 0);
});
test('static GIF remains supported; GIF and WebP animation are explicitly rejected instead of flattened', async () => {
  const still = await sharp(logo).gif().toBuffer();
  assert((await optimizePageUpload(still, 'image/gif', 'logo')).bytes.length <= still.length);
  const frames = Buffer.alloc(40 * 80 * 4, 255); frames.fill(0, 40 * 40 * 4);
  for (const format of ['gif', 'webp']) {
    const input = await sharp(frames, { raw: { width: 40, height: 80, channels: 4, pageHeight: 40 } })[format]({ loop: 0, delay: [100, 200] }).toBuffer();
    assert.equal((await sharp(input, { animated: true }).metadata()).pages, 2);
    await assert.rejects(optimizePageUpload(input, 'image/' + format), { status: 415 });
    const variant = await pageImageVariant(input, 'image/' + format, 'photo', 1);
    assert.deepEqual(variant.bytes, input); // Legacy reads do not drop frames.
  }
});
test('APNG is detected at the container level even if the decoder would report only the first frame', async () => {
  const control = Buffer.alloc(8); control.writeUInt32BE(2); const input = Buffer.concat([logo.subarray(0, 33), chunk('acTL', control), logo.subarray(33)]);
  await assert.rejects(optimizePageUpload(input, 'image/png'), { status: 415 });
});
test('byte, pixel, signature and full decode limits reject unsafe or corrupt input', async () => {
  await assert.rejects(optimizePageUpload(Buffer.alloc(PAGE_IMAGE_MAX_BYTES + 1), 'image/png'), { status: 413 });
  await assert.rejects(optimizePageUpload(logo, 'image/jpeg'));
  await assert.rejects(optimizePageUpload(logo.subarray(0, Math.floor(logo.length / 2)), 'image/png'));
  const header = Buffer.from(logo.subarray(16, 29)); header.writeUInt32BE(5001, 0); header.writeUInt32BE(5001, 4);
  const bomb = Buffer.concat([logo.subarray(0, 8), chunk('IHDR', header), logo.subarray(33)]);
  await assert.rejects(optimizePageUpload(bomb, 'image/png'));
});
test('logo derivatives preserve alpha, aspect ratio and colour; small images are not re-encoded/upscaled', async () => {
  const original = await optimizePageUpload(logo, 'image/png', 'logo');
  const variant = await pageImageVariant(original.bytes, original.mime, 'logo', 480);
  const meta = await sharp(variant.bytes).metadata(); assert(meta.width <= 600); assert.equal(meta.width / meta.height, 2.5); assert(variant.bytes.length <= original.bytes.length);
  const raw = await pixels(original.bytes, meta.width); const reference = await sharp(raw.data, { raw: raw.info }).png().toBuffer();
  const quality = await compare(reference, variant.bytes); assert.equal(quality.alphaDelta, 0); assert(quality.maxVisibleDelta < .01);
  const small = await pageImageVariant(original.bytes, original.mime, 'logo', 1440); assert.deepEqual(small.bytes, original.bytes); assert.equal(small.mime, original.mime);
});

const globalKey = '__squadActualImageUpload';
globalThis[globalKey] = { sharp };
const stubs = {
  '@/lib/firebase-admin': 'export const adminDb={};',
  'next/server': 'export class NextResponse extends Response { static json(x,o={}) { return new NextResponse(JSON.stringify(x),o); } }',
  '@/lib/squad-pages/http': `export const assertEnabled=()=>{};export const entityParameter=r=>JSON.parse(r.nextUrl.searchParams.get('entity'));export const pageActor=async()=>({uid:'demo-owner'});export const pageJSON=x=>new Response(JSON.stringify(x));export const pageFailure=e=>new Response(JSON.stringify({error:e.message}),{status:e.status||500});`,
  '@/lib/squad-pages/store': `export const localPreview=()=>true;export const pageStore=async()=>globalThis.${globalKey}.store;`,
  '@/lib/squad-pages/media': `export const writePageImage=async(k,id,b,m)=>globalThis.${globalKey}.objects.set(k+'/'+id,{bytes:b,mime:m});export const readPageImage=async(k,id)=>globalThis.${globalKey}.objects.get(k+'/'+id).bytes;export const discardOwnedImage=async(k,id)=>globalThis.${globalKey}.objects.delete(k+'/'+id);`,
  sharp: `export default globalThis.${globalKey}.sharp;`,
};
const bundled = await build({ stdin: { contents: `export * from './src/app/api/squad-pages/media/route';export {memoryStore} from './src/lib/squad-pages/store';export {previewRecords} from './src/lib/squad-pages/fixtures';export {emptyContent} from './src/lib/squad-pages/model';export {mutatePage} from './src/lib/squad-pages/service';`, resolveDir: root }, bundle: true, platform: 'node', format: 'esm', write: false, packages: 'external', logLevel: 'silent', alias: { '@': root + '/src' }, plugins: [{ name: 'owned-fixtures', setup(b) { b.onResolve({ filter: /.*/ }, a => Object.hasOwn(stubs, a.path) ? { path: a.path, namespace: 'fixture' } : null); b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ contents: stubs[a.path], loader: 'js' })); } }] });
const route = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'));
function request(method, input, mime = 'image/png', query = '') {
  const url = new URL('https://fictional.invalid/api/squad-pages/media?entity=' + encodeURIComponent(JSON.stringify({ kind: 'team', id: 'demo-hawks' })) + query);
  const r = new Request(url, { method, ...(method === 'POST' ? { body: input, headers: { 'content-type': mime } } : {}) }); r.nextUrl = url; return r;
}
test('actual upload route stores optimized MIME/size/purpose, reports savings and leaves focal/zoom coordinates intact', async () => {
  const ctx = globalThis[globalKey] = { sharp, store: route.memoryStore(route.previewRecords()), objects: new Map() };
  const response = await route.POST(request('POST', pngText(logo), 'image/png', '&purpose=logo')); assert.equal(response.status, 200);
  const { optimization, ...image } = await response.json(), key = 'team~demo-hawks', stored = ctx.objects.get(key + '/' + image.id);
  assert(stored.bytes.length <= logo.length); assert.equal(stored.bytes.length, optimization.storedBytes);
  const meta = await ctx.store.run(s => s.get(`squadPageMedia/${key}/items/${image.id}`)); assert.equal(meta.mime, stored.mime); assert.equal(meta.purpose, 'logo'); assert.equal(meta.width, 600);
  const content = route.emptyContent('Fictional'); content.hero = { ...image, x: 27, y: 76, zoom: 145, size: 110 };
  const saved = (await route.mutatePage(ctx.store, { uid: 'demo-owner' }, { entity: { kind: 'team', id: 'demo-hawks' }, action: 'save', expectedVersion: 0, content })).record;
  assert.deepEqual([saved.draft.content.hero.x, saved.draft.content.hero.y, saved.draft.content.hero.zoom, saved.draft.content.hero.size], [27, 76, 145, 110]);
  const variant = await route.GET(request('GET', null, 'image/png', '&id=' + image.id + '&w=480')); assert.equal(variant.status, 200);
  const data = Buffer.from(await variant.arrayBuffer()); assert((await sharp(data).metadata()).width <= 600); assert(data.length <= stored.bytes.length); assert.equal(variant.headers.get('Content-Type'), (await sharp(data).metadata()).format === 'png' ? 'image/png' : 'image/webp');
  const count = ctx.objects.size; const control = Buffer.alloc(8); control.writeUInt32BE(2); const animation = Buffer.concat([logo.subarray(0, 33), chunk('acTL', control), logo.subarray(33)]);
  assert.equal((await route.POST(request('POST', animation))).status, 415); assert.equal(ctx.objects.size, count);
  assert.equal((await route.POST(request('POST', logo, 'image/png', '&purpose=invalid'))).status, 400); assert.equal(ctx.objects.size, count);
  delete globalThis[globalKey];
});
