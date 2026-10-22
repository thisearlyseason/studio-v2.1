import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { pageLinkHref } from '../src/lib/squad-pages/native-link-policy.ts';
import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

test('native page links retain the existing store restrictions and safe page navigation', () => {
  for (const url of ['/checkout', '/pricing', '/register/league/example', '/events/register/example', 'https://thesquad.pro/pricing', 'https://unapproved.example/pay']) {
    assert.equal(pageLinkHref(url, 'store'), undefined, url);
    assert.equal(pageLinkHref(url, 'web'), url, url);
  }
  for (const url of ['#section-about', '/p/our-team', 'https://www.youtube.com/watch?v=example']) {
    assert.equal(pageLinkHref(url, 'store'), url);
  }
});

for (const distribution of ['store', 'web']) test(`actual ${distribution} PageView applies link policy across CTAs, menus, resources and branding`, async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const compiled = await build({ stdin: { contents: `export {PageView} from './src/components/squad-pages/page-view';export {sampleContent} from './src/lib/squad-pages/sample-content';`, resolveDir: root }, bundle: true, packages: 'external', platform: 'node', format: 'esm', jsx: 'automatic', write: false, alias: { '@': root + '/src' }, define: { 'process.env.NEXT_PUBLIC_APP_DISTRIBUTION': JSON.stringify(distribution) }, plugins: [{ name: 'css-only', setup(b) { b.onLoad({ filter: /\.module\.css$/ }, () => ({ contents: 'export default new Proxy({}, {get:(_,key)=>String(key)})', loader: 'js' })); } }] });
  const folder = await fs.mkdtemp(root + '.native-link-test-');
  const file = folder + '/bundle.mjs';
  let m;
  try {
    await fs.writeFile(file, compiled.outputFiles[0].text);
    m = await import(pathToFileURL(file).href);
  } finally { await fs.rm(folder, { recursive: true, force: true }); }
  const content = m.sampleContent('Our actual squad', 'team');
  content.headerButton = { visible: true, label: 'Registration', target: '/register/league/example' };
  content.menu = [{ id: 'checkout', visible: true, label: 'Blocked checkout', target: '/checkout' }];
  content.links = [{ id: 'checkout', label: 'Checkout', url: '/checkout' }];
  content.resources = [{ id: 'pricing', label: 'Pricing', url: 'https://thesquad.pro/pricing' }];
  content.registrations = [{ id: 'register', label: 'Register', url: '/register/league/example' }];
  content.squadBrand = true;
  const html = renderToStaticMarkup(React.createElement(m.PageView, { content, context: { forms: [], directory: [{ name: 'Another squad', url: '/p/another-squad' }] }, images: () => '' }));
  for (const url of ['/checkout', '/register/league/example', 'https://thesquad.pro/pricing', 'https://thesquad.pro']) {
    assert.equal(html.includes(`href="${url}"`), distribution === 'web', url);
  }
  assert.match(html, /href="#page-top"/);
  assert.match(html, /Our actual squad/);
  if (distribution === 'store') assert.match(html, /aria-disabled="true"/);
});
