import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
const folder=new URL('../public/squad-pages/editorial/',import.meta.url);
const rights=JSON.parse(await fs.readFile(new URL('image-rights.json',folder),'utf8'));
test('every bundled editorial photograph has retained original provenance and lawful free-license evidence',async()=>{
 assert.deepEqual(rights.assets.map(x=>x.file).sort(),['indoor-action.webp','team-huddle.webp','indoor-game.webp','baseball-run.webp','baseball-bat.webp','baseball-ball.webp','athlete-court.webp','athlete-shot.webp','athlete-hands.webp','court.webp','court-detail.webp','field.webp','track.webp','track-detail.webp'].sort());
 for(const asset of rights.assets){assert(asset.pixelsInspected);assert(asset.photographer);assert(asset.sourceURL.startsWith('https://unsplash.com/'));assert.equal(asset.licenseURL,'https://unsplash.com/license');assert(/not Unsplash\+/.test(asset.license));assert.match(asset.originalSHA256,/^[0-9a-f]{64}$/);const bytes=await fs.readFile(new URL(asset.file,folder));assert.equal(bytes.length,asset.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);}
});
test('editorial assets decode within1600px without embedded EXIF location or source scripts',async()=>{
 for(const asset of rights.assets){const bytes=await fs.readFile(new URL(asset.file,folder));const meta=await sharp(bytes).metadata();assert.equal(meta.format,'webp');assert(meta.width<=1600&&meta.height<=1600);assert(!meta.exif);assert(!meta.xmp);assert.equal((await sharp(bytes).raw().toBuffer()).length,meta.width*meta.height*3);}
});
