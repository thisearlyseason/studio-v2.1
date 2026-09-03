import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import { chmod, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(moduleDirectory, '../../..');
const sourceRoot = join(repositoryRoot, 'node_modules', 'playwright-core');
const entrySource = join(moduleDirectory, 'playwright-transport-entry.cjs');
const moduleGuardSource = join(moduleDirectory, 'playwright-transport-module-guard.cjs');
const artifactPath = join(moduleDirectory, 'playwright-transport.bundle.json.gz');
const manifestPath = join(moduleDirectory, 'playwright-transport-manifest.json');
const PLAYWRIGHT_CLI_VERSION = '0.1.18';
const PLAYWRIGHT_CORE_VERSION = '1.63.0-alpha-2026-08-05';

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const relativeRuntimeFiles = Object.freeze([
  'browsers.json',
  'package.json',
  'lib/coreBundle.js',
  'lib/package.js',
  'lib/serverRegistry.js',
  'lib/utilsBundle.js',
  'lib/webp_codec.wasm',
  'lib/entry/cliDaemon.js',
]);

async function cliClientFiles() {
  const result = [];
  for (const directory of ['lib/tools/cli-client', 'lib/tools/utils']) {
    const names = await readdir(join(sourceRoot, directory));
    for (const name of names.sort()) {
      if (directory.endsWith('/utils') && !['extension.js', 'socketConnection.js'].includes(name)) continue;
      result.push(`${directory}/${name}`);
    }
  }
  return result;
}

function encodedFile(path, contents, mode = 0o444) {
  return Object.freeze({
    path, mode, size: contents.length, sha256: sha256(contents), contents: contents.toString('base64'),
  });
}

async function main() {
  const packageJson = JSON.parse(await readFile(join(sourceRoot, 'package.json'), 'utf8'));
  if (packageJson.name !== 'playwright-core' || packageJson.version !== PLAYWRIGHT_CORE_VERSION) {
    throw new Error('Installed playwright-core does not match the reviewed build input.');
  }
  const guard = await readFile(moduleGuardSource);
  const entry = await readFile(entrySource);
  const shebangEnd = entry.indexOf(0x0a) + 1;
  if (shebangEnd < 2 || !entry.subarray(0, shebangEnd).toString('utf8').startsWith('#!/usr/bin/env node')) {
    throw new Error('Transport entry source must retain its exact Node shebang.');
  }
  const files = [encodedFile(
    'node_modules/@playwright/cli/playwright-cli.js', Buffer.concat([
      entry.subarray(0, shebangEnd), guard, entry.subarray(shebangEnd),
    ]), 0o555,
  )];
  for (const path of [...relativeRuntimeFiles, ...await cliClientFiles()].sort()) {
    if (path.includes('..') || path.startsWith('/')) throw new Error('Transport build path escaped its package root.');
    let contents = await readFile(join(sourceRoot, path));
    if (path === 'lib/entry/cliDaemon.js') contents = Buffer.concat([guard, contents]);
    files.push(encodedFile(`node_modules/playwright-core/${path}`, contents));
  }
  files.sort((left, right) => left.path.localeCompare(right.path, 'en'));
  const payload = Buffer.from(`${JSON.stringify({
    version: 1, format: 'phase9-playwright-transport-v1',
    entry: 'node_modules/@playwright/cli/playwright-cli.js', files,
  })}\n`, 'utf8');
  const artifact = gzipSync(payload, { level: 9, mtime: 0 });
  const artifactSha256 = sha256(artifact);
  const manifest = {
    version: 1,
    format: 'phase9-playwright-transport-v1',
    playwrightCliVersion: PLAYWRIGHT_CLI_VERSION,
    playwrightCoreVersion: PLAYWRIGHT_CORE_VERSION,
    artifactSha256,
    files: files.map(({ path, mode, size, sha256: fileSha256 }) => ({ path, mode, size, sha256: fileSha256 })),
  };
  await Promise.all([artifactPath, manifestPath].map(path => chmod(path, 0o644).catch(error => {
    if (error?.code !== 'ENOENT') throw error;
  })));
  await Promise.all([
    writeFile(artifactPath, artifact, { flag: 'w', mode: 0o644 }),
    writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'w', mode: 0o644 }),
  ]);
  await Promise.all([chmod(artifactPath, 0o444), chmod(manifestPath, 0o444)]);
  process.stdout.write(`${JSON.stringify({ artifact: relative(repositoryRoot, artifactPath), artifactSha256, files: files.length })}\n`);
}

await main();
