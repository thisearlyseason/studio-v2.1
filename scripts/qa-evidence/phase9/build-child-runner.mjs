import { createHash } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parse } from 'acorn';
import { build } from 'esbuild';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const source = join(moduleDirectory, 'child-runner-source.mjs');
const output = join(moduleDirectory, 'child-runner.mjs');
const maximumBytes = 131_072;
const controlFlowErrorMessages = Object.freeze([
  'New tab viewport application failed and the browser was closed.',
]);

const messageMember = value => {
  const node = value?.type === 'ChainExpression' ? value.expression : value;
  return node?.type === 'MemberExpression'
    && node.computed === false
    && node.property?.type === 'Identifier'
    && node.property.name === 'message';
};

export function minimizeGeneratedErrorMessages(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > 262_144) {
    throw new Error('Child runner build input is invalid.');
  }
  const text = bytes.toString('utf8');
  let tree;
  try {
    tree = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch {
    throw new Error('Child runner build output is not valid JavaScript.');
  }
  const edits = [];
  const constructed = new Map(controlFlowErrorMessages.map(message => [message, 0]));
  const compared = new Map(controlFlowErrorMessages.map(message => [message, 0]));
  let literalErrorCount = 0;
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'NewExpression'
      && node.callee?.type === 'Identifier'
      && node.callee.name === 'Error'
      && node.arguments?.length === 1
      && node.arguments[0]?.type === 'Literal'
      && typeof node.arguments[0].value === 'string') {
      literalErrorCount += 1;
      const argument = node.arguments[0];
      if (constructed.has(argument.value)) {
        constructed.set(argument.value, constructed.get(argument.value) + 1);
      } else edits.push(Object.freeze({ start: argument.start, end: argument.end }));
    }
    if (node.type === 'BinaryExpression'
      && new Set(['===', '!==', '==', '!=']).has(node.operator)) {
      const pair = node.left?.type === 'Literal' && typeof node.left.value === 'string'
        ? [node.right, node.left.value]
        : node.right?.type === 'Literal' && typeof node.right.value === 'string'
          ? [node.left, node.right.value]
          : null;
      if (pair && messageMember(pair[0])) {
        if (!compared.has(pair[1])) {
          throw new Error('Child runner control-flow error message is not explicitly preserved.');
        }
        compared.set(pair[1], compared.get(pair[1]) + 1);
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (new Set(['start', 'end', 'loc', 'range']).has(key)) continue;
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(tree);
  if (literalErrorCount < 1 || literalErrorCount > 1_000
    || controlFlowErrorMessages.some(message => (
      constructed.get(message) !== 1 || compared.get(message) !== 1
    ))) throw new Error('Child runner control-flow error message inventory is invalid.');
  let minimized = text;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    minimized = `${minimized.slice(0, edit.start)}${minimized.slice(edit.end)}`;
  }
  try {
    parse(minimized, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch {
    throw new Error('Child runner minimized output is not valid JavaScript.');
  }
  return Buffer.from(minimized, 'utf8');
}

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
  return minimizeGeneratedErrorMessages(Buffer.from(result.outputFiles[0].contents));
};

async function buildChildRunner() {
  const first = await compile();
  const second = await compile();
  if (!first.equals(second) || first.length > maximumBytes) {
    throw new Error('Child runner build is not deterministic or bounded.');
  }
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
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildChildRunner();
}
