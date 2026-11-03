import test from 'node:test';
import assert from 'node:assert/strict';
import sitemap from '../src/app/sitemap.ts';
import robots from '../src/app/robots.ts';
import { discoveryMetadata } from '../src/lib/discovery-metadata.ts';
import { spawnSync } from 'node:child_process';

test('sitemap contains unique canonical public URLs and no account or payment routes', () => {
  const entries = sitemap();
  assert.equal(new Set(entries.map(entry => entry.url)).size, entries.length);
  for(const entry of entries) {
    assert.equal(new URL(entry.url).origin, 'https://www.thesquad.pro');
    assert.doesNotMatch(new URL(entry.url).pathname, /^\/(api|dashboard|family|chats|register|public|recruit|login|signup|pricing)(\/|$)/);
    if(entry.lastModified) assert.ok(new Date(entry.lastModified) <= new Date());
  }
  assert.ok(entries.some(entry => entry.url.endsWith('/download')));
  assert.ok(entries.some(entry => entry.url.endsWith('/plans')));
});
test('public metadata shares the page identity without a homepage canonical', () => {
  const meta=discoveryMetadata('/plans','Plans','Compare plans');
  assert.equal(meta.alternates.canonical,'https://www.thesquad.pro/plans');
  assert.equal(meta.openGraph.url,meta.alternates.canonical);
  assert.equal(meta.twitter.title,'Plans');
  assert.equal(meta.robots.index,true);
  assert.deepEqual(robots().rules.disallow,['/api/']);
});
test('preview and staging builds suppress sitemap and public indexing', () => {
  for(const env of [{VERCEL_ENV:'preview'},{SITE_INDEXING:'disabled'},{NEXT_PUBLIC_APP_DISTRIBUTION:'store'}]) {
    const result=spawnSync(process.execPath,['--import','tsx','--input-type=module','-e',"import sitemap from './src/app/sitemap.ts';import {publicRobots} from './src/lib/discovery-metadata.ts';console.log(JSON.stringify({size:sitemap().length,index:publicRobots.index}))"],{env:{...process.env,...env},encoding:'utf8'});
    assert.equal(result.status,0,result.stderr);
    assert.deepEqual(JSON.parse(result.stdout),{size:0,index:false});
  }
});

test('public web plan comparison cannot bypass native distribution controls', async () => {
  const { isStoreBlockedPath, isExternalPurchaseUrl } = await import('../src/lib/app-distribution.ts');
  assert.equal(isStoreBlockedPath('/plans'), true);
  assert.equal(isExternalPurchaseUrl('/plans'), true);
});
