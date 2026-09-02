import { createHash } from 'node:crypto';
import { chmod, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';

import { parse } from 'acorn';
import { build } from 'esbuild';

const moduleDirectory = dirname(fileURLToPath(import.meta.url));
const source = join(moduleDirectory, 'child-runner-source.mjs');
const output = join(moduleDirectory, 'child-runner.mjs');
const maximumBytes = 131_072;
const maximumRecoveredBytes = 262_144;
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

const staticString = node => {
  if (node?.type === 'Literal' && typeof node.value === 'string') return node.value;
  if (node?.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis[0]?.value?.cooked;
  }
  return undefined;
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
      && (node.arguments[0]?.type === 'TemplateLiteral'
        || (node.arguments[0]?.type === 'Literal' && typeof node.arguments[0].value === 'string'))) {
      literalErrorCount += 1;
      const argument = node.arguments[0];
      const fixedMessage = staticString(argument);
      if (fixedMessage !== undefined && constructed.has(fixedMessage)) {
        constructed.set(fixedMessage, constructed.get(fixedMessage) + 1);
      } else if (argument.type === 'TemplateLiteral' && argument.expressions.length > 0) {
        const effects = argument.expressions.map(expression => (
          `\`\${${text.slice(expression.start, expression.end)}}\``
        ));
        edits.push(Object.freeze({
          start: argument.start,
          end: argument.end,
          replacement: `(${effects.join(',')},"")`,
        }));
      } else edits.push(Object.freeze({ start: argument.start, end: argument.end, replacement: '' }));
    }
    if (node.type === 'BinaryExpression'
      && new Set(['===', '!==', '==', '!=']).has(node.operator)) {
      const leftString = staticString(node.left);
      const rightString = staticString(node.right);
      const pair = leftString !== undefined
        ? [node.right, leftString]
        : rightString !== undefined
          ? [node.left, rightString]
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
  const orderedEdits = edits.slice().sort((left, right) => left.start - right.start);
  if (orderedEdits.some((edit, index) => index > 0 && orderedEdits[index - 1].end > edit.start)) {
    throw new Error('Child runner error message edits must not overlap.');
  }
  let minimized = text;
  for (const edit of edits.sort((left, right) => right.start - left.start)) {
    minimized = `${minimized.slice(0, edit.start)}${edit.replacement}${minimized.slice(edit.end)}`;
  }
  let minimizedTree;
  try {
    minimizedTree = parse(minimized, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch {
    throw new Error('Child runner minimized output is not valid JavaScript.');
  }
  const audit = node => {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'NewExpression'
      && node.callee?.type === 'Identifier'
      && node.callee.name === 'Error'
      && node.arguments?.length === 1) {
      const argument = node.arguments[0];
      const fixedMessage = staticString(argument);
      if ((fixedMessage !== undefined && !controlFlowErrorMessages.includes(fixedMessage))
        || (argument.type === 'TemplateLiteral' && argument.expressions.length > 0)) {
        throw new Error('Child runner minimized output retained an unapproved error message.');
      }
    }
    for (const [key, child] of Object.entries(node)) {
      if (new Set(['start', 'end', 'loc', 'range']).has(key)) continue;
      if (Array.isArray(child)) child.forEach(audit);
      else audit(child);
    }
  };
  audit(minimizedTree);
  return Buffer.from(minimized, 'utf8');
}

export const auditRecoveredChild = bytes => {
  if (!Buffer.isBuffer(bytes) || bytes.length < 1 || bytes.length > maximumRecoveredBytes) {
    throw new Error('Recovered child module is invalid.');
  }
  let text;
  let tree;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    tree = parse(text, { ecmaVersion: 'latest', sourceType: 'module' });
  } catch {
    throw new Error('Recovered child module is invalid.');
  }
  const specifiers = [];
  let entryBindingReferences = 0;
  let importMetaReferences = 0;
  let invalidImportExpression = false;
  const visit = node => {
    if (!node || typeof node !== 'object') return;
    if ((node.type === 'ImportDeclaration'
        || node.type === 'ExportAllDeclaration'
        || node.type === 'ExportNamedDeclaration')
      && node.source) specifiers.push(node.source.value);
    if (node.type === 'ImportExpression') {
      if (node.source?.type !== 'Literal' || typeof node.source.value !== 'string') {
        invalidImportExpression = true;
      } else specifiers.push(node.source.value);
    }
    if (node.type === 'MemberExpression'
      && node.computed === false
      && node.object?.type === 'Identifier'
      && node.object.name === 'globalThis'
      && node.property?.type === 'Identifier'
      && node.property.name === '__phase9EntryUrl') entryBindingReferences += 1;
    if (node.type === 'MetaProperty'
      && node.meta?.name === 'import'
      && node.property?.name === 'meta') importMetaReferences += 1;
    for (const [key, child] of Object.entries(node)) {
      if (new Set(['start', 'end', 'loc', 'range']).has(key)) continue;
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  };
  visit(tree);
  if (importMetaReferences !== 0 || entryBindingReferences < 1) {
    throw new Error('Recovered child entry URL binding is invalid.');
  }
  if (invalidImportExpression
    || !specifiers.every(specifier => typeof specifier === 'string' && specifier.startsWith('node:'))) {
    throw new Error('Recovered child module import is invalid.');
  }
  return Object.freeze({
    bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
  });
};

export const compileRecoveredChild = async () => {
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
    define: { 'import.meta.url': 'globalThis.__phase9EntryUrl' },
  });
  if (result.outputFiles.length !== 1) throw new Error('Child runner build produced an unexpected output set.');
  const bytes = minimizeGeneratedErrorMessages(Buffer.from(result.outputFiles[0].contents));
  auditRecoveredChild(bytes);
  return bytes;
};

const renderPackagedChild = (payload, recoveredBytes) => Buffer.from(
  `import{gunzipSync as g}from'node:zlib';const k='__phase9EntryUrl';if(Object.hasOwn(globalThis,k))throw Error();Object.defineProperty(globalThis,k,{value:import.meta.url,writable:false,enumerable:false,configurable:true});try{const b=g(Buffer.from(${JSON.stringify(payload)},"base64"));if(b.length!==${recoveredBytes})throw Error();await import("data:text/javascript;base64,"+b.toString("base64"))}finally{delete globalThis[k]}`,
  'utf8',
);

export const packageRecoveredChild = bytes => {
  const recovered = auditRecoveredChild(bytes);
  const gzip = gzipSync(bytes, { level: 9, mtime: 0 });
  const wrapper = renderPackagedChild(gzip.toString('base64'), bytes.length);
  if (wrapper.length > maximumBytes) throw new Error('Packaged child wrapper is invalid.');
  return Object.freeze({
    wrapper,
    gzip,
    recoveredSha256: recovered.sha256,
    gzipSha256: createHash('sha256').update(gzip).digest('hex'),
  });
};

export const inspectPackagedChild = wrapper => {
  if (!Buffer.isBuffer(wrapper) || wrapper.length < 1 || wrapper.length > maximumBytes) {
    throw new Error('Packaged child wrapper is invalid.');
  }
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(wrapper);
  } catch {
    throw new Error('Packaged child wrapper is invalid.');
  }
  const payloads = [...text.matchAll(/Buffer\.from\("([A-Za-z0-9+/]+={0,2})","base64"\)/g)];
  const lengths = [...text.matchAll(/b\.length!==([1-9][0-9]*)/g)];
  if (payloads.length !== 1 || lengths.length !== 1) throw new Error('Packaged child wrapper is invalid.');
  const payload = payloads[0][1];
  const recoveredBytes = Number(lengths[0][1]);
  if (!Number.isSafeInteger(recoveredBytes) || recoveredBytes < 1 || recoveredBytes > maximumRecoveredBytes
    || !wrapper.equals(renderPackagedChild(payload, recoveredBytes))) {
    throw new Error('Packaged child wrapper is invalid.');
  }
  const gzip = Buffer.from(payload, 'base64');
  if (gzip.length < 1 || gzip.toString('base64') !== payload) throw new Error('Packaged child wrapper is invalid.');
  let recovered;
  try {
    recovered = gunzipSync(gzip, { maxOutputLength: maximumRecoveredBytes });
  } catch {
    throw new Error('Packaged child wrapper is invalid.');
  }
  if (recovered.length !== recoveredBytes) throw new Error('Packaged child wrapper is invalid.');
  auditRecoveredChild(recovered);
  if (!gzip.equals(gzipSync(recovered, { level: 9, mtime: 0 }))) {
    throw new Error('Packaged child wrapper is invalid.');
  }
  return Object.freeze({ recovered, gzip });
};

export const compilePackagedChild = async () => {
  const recoveredA = await compileRecoveredChild();
  const recoveredB = await compileRecoveredChild();
  const packagedA = packageRecoveredChild(recoveredA);
  const packagedB = packageRecoveredChild(recoveredB);
  if (!recoveredA.equals(recoveredB)
    || !packagedA.gzip.equals(packagedB.gzip)
    || !packagedA.wrapper.equals(packagedB.wrapper)) {
    throw new Error('Child runner build is not deterministic.');
  }
  const inspected = inspectPackagedChild(packagedA.wrapper);
  if (!inspected.recovered.equals(recoveredA) || !inspected.gzip.equals(packagedA.gzip)) {
    throw new Error('Child runner package inspection failed.');
  }
  return Object.freeze({
    wrapper: packagedA.wrapper,
    bytes: packagedA.wrapper.length,
    sha256: createHash('sha256').update(packagedA.wrapper).digest('hex'),
    recoveredBytes: recoveredA.length,
    recoveredSha256: packagedA.recoveredSha256,
    gzipBytes: packagedA.gzip.length,
    gzipSha256: packagedA.gzipSha256,
  });
};

async function buildChildRunner() {
  const built = await compilePackagedChild();
  await chmod(output, 0o644).catch(error => { if (error?.code !== 'ENOENT') throw error; });
  await writeFile(output, built.wrapper, { mode: 0o644 });
  await chmod(output, 0o444);
  process.stdout.write(`${JSON.stringify({
    bytes: built.bytes,
    sha256: built.sha256,
    recoveredBytes: built.recoveredBytes,
    recoveredSha256: built.recoveredSha256,
    gzipBytes: built.gzipBytes,
    gzipSha256: built.gzipSha256,
  })}\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildChildRunner();
}
