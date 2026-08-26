import { createHash } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const source = join(moduleDirectory, 'child-runner-source.mjs');
const output = join(moduleDirectory, 'child-runner.mjs');

const compile = async () => {
  const result = await build({
    entryPoints: [source],
    bundle: true,
    write: false,
    minify: true,
    treeShaking: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    legalComments: 'none',
    charset: 'utf8',
  });
  if (result.outputFiles.length !== 1) throw new Error('Child runner build produced an unexpected output set.');
  return Buffer.from(result.outputFiles[0].contents);
};

const first = await compile();
const second = await compile();
if (!first.equals(second) || first.length > 131_072) throw new Error('Child runner build is not deterministic or bounded.');
const text = first.toString('utf8');
const specifiers = [...text.matchAll(/(?:\bfrom\s+|\bimport\()\s*["']([^"']+)["']/g)].map(match => match[1]);
if (!specifiers.every(specifier => specifier.startsWith('node:'))) {
  throw new Error('Child runner build retained a non-intrinsic import.');
}
await chmod(output, 0o644).catch(error => { if (error?.code !== 'ENOENT') throw error; });
await writeFile(output, first, { mode: 0o644 });
await chmod(output, 0o444);
process.stdout.write(`${JSON.stringify({
  bytes: first.length,
  sha256: createHash('sha256').update(first).digest('hex'),
})}\n`);
