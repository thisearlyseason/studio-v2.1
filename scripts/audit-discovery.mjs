// Run with node --import tsx scripts/audit-discovery.mjs [base URL] [output JSON].
import fs from 'node:fs/promises';
import sitemap from '../src/app/sitemap.ts';
const base = process.argv[2] || 'http://localhost:9013';
const output = process.argv[3] || 'work/discovery-2026-11-03/routes.json';
const paths = sitemap().map(entry => new URL(entry.url).pathname);
const decode = text => text.replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const attr = (tag, key) => decode(tag.match(new RegExp(`${key}="([^"]*)"`))?.[1] || '');
const results = [];
let next = 0;
async function check(path, discovery = true) {
  const start = performance.now();
  const response = await fetch(`${base}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(60000), headers: { 'User-Agent': 'Googlebot' } });
  const html = await response.text();
  const tags = html.match(/<(?:meta|link)\b[^>]*>/g) || [];
  const meta = key => attr(tags.find(tag => attr(tag, 'name') === key || attr(tag, 'property') === key) || '', 'content');
  const canonicals = tags.filter(tag => attr(tag, 'rel') === 'canonical').map(tag => attr(tag, 'href'));
  const h1 = (html.match(/<h1\b[^>]*>[\s\S]*?<\/h1>/g) || []).map(tag => decode(tag.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()));
  const schemas = []; const errors = [];
  for (const match of html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)) {
    try { schemas.push(JSON.parse(match[1])); } catch { errors.push('Invalid JSON-LD'); }
  }
  const title = decode(html.match(/<title>(.*?)<\/title>/)?.[1] || '');
  const robots = [meta('robots'), response.headers.get('x-robots-tag') || ''].join(';');
  if (discovery) {
    if (response.status !== 200) errors.push(`HTTP ${response.status}`);
    if (!title || !meta('description')) errors.push('Missing title/description');
    const expected = `https://www.thesquad.pro${path === '/' ? '' : path}`;
    if (canonicals.length !== 1 || canonicals[0].replace(/\/$/, '') !== expected) errors.push(`Canonical: ${canonicals.join(',')}`);
    if (robots.includes('noindex') || !robots.includes('index')) errors.push(`Robots: ${robots}`);
    if (!meta('og:title') || !meta('og:description') || !meta('og:image')) errors.push('Incomplete social metadata');
    if (h1.length !== 1) errors.push(`H1 count ${h1.length}`);
  }
  const links = [...html.matchAll(/<a\b[^>]*href="([^"]+)"/g)].map(match => decode(match[1])).filter(href => href.startsWith('/') && !href.startsWith('//'));
  return { path, status: response.status, title, description: meta('description'), canonicals, robots, h1, schemaCount: schemas.length, errors, links: [...new Set(links)], responseMs: Math.round(performance.now() - start) };
}
await Promise.all(Array.from({ length: 6 }, async () => {
  while (next < paths.length) { const path = paths[next++]; try { results.push(await check(path)); } catch (error) { results.push({ path, errors: [error.message] }); } }
}));
const utilities = [];
for (const path of ['/login','/signup','/beta','/pricing','/sports-hub/search','/sports-hub/preferences','/dashboard','/sports/not-a-sport','/for/not-an-audience','/sports-hub/templates/not-a-template','/not-a-real-page']) {
  try { utilities.push(await check(path, false)); } catch(error) { utilities.push({path, errors:[error.message]}); }
}
const broken = [];
const links = [...new Set(results.flatMap(row => row.links || []).map(href => href.split('#')[0].split('?')[0]))].filter(path => path && !paths.includes(path));
await Promise.all(Array.from({length:4}, async (_, index) => {
  for(let i=index;i<links.length;i+=4) {const path=links[i]; try {const res=await fetch(`${base}${path}`,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(20000)}); await res.body?.cancel(); if(res.status>=400) broken.push({path,status:res.status});} catch(error){broken.push({path,error:error.message});}}
}));
results.sort((a,b) => a.path.localeCompare(b.path));
const duplicates = Object.entries(Object.groupBy(results, row => row.title)).filter(([, rows]) => rows.length>1).map(([title,rows]) => ({title,paths:rows.map(row=>row.path)}));
const summary = {base, checkedAt:new Date().toISOString(), routes:results.length, failures:results.filter(row=>row.errors.length), duplicateTitles:duplicates, brokenInternalLinks:broken, utilities};
await fs.writeFile(output,JSON.stringify({summary,results},null,2));
console.log(JSON.stringify(summary,null,2));
process.exitCode = summary.failures.length || broken.length || duplicates.length ? 1 : 0;
