import { createHash, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { isAbsolute, join, normalize, sep } from 'node:path';

import {
  acquireBlankBrowser,
  armAcquiredSignalRecorder,
  attachExistingSignalRecorder,
  capturePlaywrightTransport,
  createPhase9ProductionCliClient,
  installSignalRecorder,
  setAndVerifyViewport,
} from './playwright-cli-client.mjs';
import {
  REQUIRED_LEDGER_COLUMNS, STAGING_ORIGIN, STAGING_PROJECT_ID,
} from './scenario-contracts.mjs';
import {
  buildCanonicalScenarioPlan,
  runAdmissionScenario,
  runIsolationScenario,
  runLogoutScenario,
  runPendingDeletionScenario,
} from './scenarios.mjs';

const markerNameSha256 = '585c21d0652b1f1c5dd8168796ee2599745f8a1a9885e3178ac29b057f0044c3';
const argv = process.argv.slice(1);
const exactArgument = name => {
  const positions = argv.flatMap((value, index) => value === name ? [index] : []);
  if (positions.length !== 1 || !argv[positions[0] + 1] || argv[positions[0] + 1].startsWith('--')) {
    throw new Error('runner-configuration-invalid');
  }
  return argv[positions[0] + 1];
};

const phase = exactArgument('--phase');
const workspace = exactArgument('--workspace');
const manifestPath = exactArgument('--manifest');
const credentialsPath = exactArgument('--credentials');
const guardianMarkerName = exactArgument('--guardian-marker-env');
const configBase64 = exactArgument('--config-base64');
const playwrightTempRoot = join(workspace, 'playwright-tmp');
if (argv.length !== 12 || !new Set(['before-transition', 'after-transition']).has(phase)
  || !workspace.startsWith('/tmp/phase9-core-identities.')
  || process.env.TMPDIR !== playwrightTempRoot
  || createHash('sha256').update(guardianMarkerName).digest('hex') !== markerNameSha256
  || !/^[0-9a-f]{64}$/.test(process.env[guardianMarkerName] ?? '')) {
  throw new Error('runner-configuration-invalid');
}
const playwrightTempMetadata = await lstat(playwrightTempRoot);
if (!playwrightTempMetadata.isDirectory() || playwrightTempMetadata.isSymbolicLink()
  || (playwrightTempMetadata.mode & 0o777) !== 0o700) {
  throw new Error('runner-configuration-invalid');
}

let config;
try { config = JSON.parse(Buffer.from(configBase64, 'base64').toString('utf8')); } catch {
  throw new Error('runner-configuration-invalid');
}
const expectedConfigKeys = [
  'chrome', 'nodeRuntime', 'origin', 'playwrightArtifact', 'playwrightArtifactSha256',
  'playwrightCoreVersion', 'playwrightVersion', 'projectId', 'protocolVersion',
];
const exactPolicy = (value, keys) => value && typeof value === 'object' && !Array.isArray(value)
  && Object.keys(value).sort().join(',') === [...keys].sort().join(',')
  && keys.every(key => typeof value[key] === 'string' && value[key].length > 0);
if (!config || Object.keys(config).sort().join(',') !== expectedConfigKeys.sort().join(',')
  || config.projectId !== STAGING_PROJECT_ID || config.origin !== STAGING_ORIGIN
  || config.protocolVersion !== '4'
  || config.playwrightArtifact !== 'scripts/qa-evidence/phase9/playwright-transport.bundle.json.gz'
  || config.playwrightVersion !== '0.1.18'
  || config.playwrightCoreVersion !== '1.63.0-alpha-2026-08-05'
  || !/^[0-9a-f]{64}$/.test(config.playwrightArtifactSha256)
  || !exactPolicy(config.nodeRuntime, ['path', 'sha256', 'codesignIdentifier', 'teamIdentifier'])
  || config.nodeRuntime.path !== process.execPath
  || !exactPolicy(config.chrome, [
    'appPath', 'binaryPath', 'binarySha256', 'codesignIdentifier', 'teamIdentifier',
  ])) throw new Error('runner-configuration-invalid');

const repositoryRoot = await realpath(process.cwd());
const resolveRepositoryFile = async relativePath => {
  if (typeof relativePath !== 'string' || relativePath.length === 0 || isAbsolute(relativePath)
    || normalize(relativePath) !== relativePath || relativePath.split(sep).some(component => (
      component === '' || component === '.' || component === '..'
    ))) throw new Error('runner-configuration-invalid');
  const absolute = join(repositoryRoot, relativePath);
  if (!absolute.startsWith(`${repositoryRoot}${sep}`) || await realpath(absolute) !== absolute) {
    throw new Error('runner-configuration-invalid');
  }
  let component = repositoryRoot;
  for (const name of relativePath.split(sep)) {
    component = join(component, name);
    if ((await lstat(component)).isSymbolicLink()) throw new Error('runner-configuration-invalid');
  }
  return absolute;
};
const artifactPath = await resolveRepositoryFile(config.playwrightArtifact);
const transport = capturePlaywrightTransport({
  artifactPath,
  expectedSha256: config.playwrightArtifactSha256,
  runtimePolicy: config.nodeRuntime,
  chromePolicy: config.chrome,
});

const readPrivateJson = async path => {
  if (!path.startsWith(`${workspace}/`)) throw new Error('runner-private-path-invalid');
  const [metadata, canonical] = await Promise.all([lstat(path), realpath(path)]);
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o777) !== 0o600 || canonical !== path) {
    throw new Error('runner-private-input-invalid');
  }
  const text = await readFile(path, 'utf8');
  if (text.length > 262_144) throw new Error('runner-private-input-invalid');
  return JSON.parse(text);
};

const manifest = await readPrivateJson(manifestPath);
const credentials = await readPrivateJson(credentialsPath);
if (manifest?.version !== 3 || manifest.projectId !== STAGING_PROJECT_ID || typeof manifest.runId !== 'string'
  || credentials?.version !== 1 || credentials.runId !== manifest.runId
  || Object.keys(credentials).sort().join(',') !== 'identities,runId,version'
  || !Array.isArray(credentials.identities) || credentials.identities.length !== 20
  || new Set(credentials.identities.map(value => value.alias)).size !== 20
  || credentials.identities.some(value => (
    !value || Object.keys(value).sort().join(',') !== 'alias,email,password'
    || typeof value.alias !== 'string' || typeof value.email !== 'string' || typeof value.password !== 'string'
    || value.email.length < 3 || value.password.length < 1
  ))) throw new Error('runner-private-input-invalid');

const identities = new Map(credentials.identities.map(value => [value.alias, {
  email: value.email, password: value.password,
}]));
const grants = new Map();
const credentialBroker = createServer((request, response) => {
  const token = String(request.url ?? '').slice(1);
  const alias = grants.get(token);
  grants.delete(token);
  const credential = alias ? identities.get(alias) : null;
  response.writeHead(credential ? 200 : 404, {
    'content-type': 'application/json', 'cache-control': 'no-store',
  });
  response.end(credential ? JSON.stringify(credential) : '{}');
});
await new Promise((resolvePromise, reject) => {
  credentialBroker.once('error', reject);
  credentialBroker.listen(0, '127.0.0.1', resolvePromise);
});
const credentialGrant = alias => {
  if (!identities.has(alias)) throw new Error('runner-credential-alias-invalid');
  const token = randomBytes(24).toString('hex');
  grants.set(token, alias);
  return `http://127.0.0.1:${credentialBroker.address().port}/${token}`;
};

const client = createPhase9ProductionCliClient({
  transport,
  runtimePolicy: config.nodeRuntime,
  chromePolicy: config.chrome,
  guardianMarkerName,
  sourceEnvironment: process.env,
  temporaryDirectory: playwrightTempRoot,
  cwd: repositoryRoot,
  fixtureRunId: manifest.runId,
});
const plan = buildCanonicalScenarioPlan();
const isolationLanding = Object.freeze({
  'qa-parent-a': ['/family', 'Family Overview'],
  'qa-parent-b': ['/family', 'Family Overview'],
  'qa-adult-player-a': ['/dashboard', 'Dashboard'],
  'qa-adult-player-b': ['/dashboard', 'Dashboard'],
  'qa-youth-active': ['/dashboard', 'Dashboard'],
});
const rowsForPhase = phase === 'before-transition'
  ? plan.filter(row => row.startState !== 'pending_deletion')
  : plan.filter(row => row.startState === 'pending_deletion');
const sessionName = value => `p9-${value}`.replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64);
const freshSessionName = value => `${sessionName(value).slice(0, 58)}-fresh`;
const rowSession = row => row.scenario === 'stale-session'
  ? sessionName(`pending-deletion-active-baseline-${row.viewportName}`)
  : sessionName(row.contextId);
const plannedOwnedSessions = phase === 'before-transition'
  ? rowsForPhase.flatMap(row => row.group === 'logout'
    ? [sessionName(row.contextId), freshSessionName(row.contextId)]
    : [sessionName(row.contextId)])
  : rowsForPhase.filter(row => row.scenario === 'fresh-login').map(row => sessionName(row.contextId));

const executeProcessAudit = args => new Promise((resolvePromise, reject) => execFile('/bin/ps', args, {
  encoding: 'utf8', env: { LC_ALL: 'C', PATH: '/usr/bin:/bin' },
  maxBuffer: 16_777_216, timeout: 5_000,
}, (error, stdout) => error ? reject(new Error('runner-launch-receipt-invalid')) : resolvePromise(stdout)));
const captureLaunchReceipt = async session => {
  const marker = process.env[guardianMarkerName];
  const token = `${guardianMarkerName}=${marker}`;
  const output = await executeProcessAudit(['eww', '-axo', 'pid=,ppid=,command=']);
  const records = [];
  for (const line of output.split('\n')) {
    const words = line.split(/\s+/);
    if (!words.includes(token) && !words.includes(`--${token}`)) continue;
    const match = /^\s*([1-9][0-9]*)\s+([0-9]+)\s+/.exec(line);
    if (!match) throw new Error('runner-launch-receipt-invalid');
    const pid = Number(match[1]);
    const command = (await executeProcessAudit(['-p', String(pid), '-o', 'command='])).trim();
    records.push({ pid, ppid: Number(match[2]), command });
  }
  const daemonPattern = new RegExp(
    `^${process.execPath.replaceAll('.', '\\.')} /private/tmp/phase9-playwright-transport\\.[0-9a-f]{48}`
      + `/node_modules/playwright-core/lib/entry/cliDaemon\\.js ${session} --browser=chrome$`,
  );
  const daemons = records.filter(record => daemonPattern.test(record.command));
  if (daemons.length !== 1) throw new Error('runner-launch-receipt-invalid');
  const mains = records.filter(record => record.ppid === daemons[0].pid
    && record.command.startsWith(`${config.chrome.binaryPath} `)
    && !record.command.includes(' --type=') && record.command.includes(` --${token}`));
  if (mains.length !== 1) throw new Error('runner-launch-receipt-invalid');
  return Object.freeze({ session, daemonPid: daemons[0].pid, chromeMainPid: mains[0].pid });
};
const ownedSessions = new Set();
const launchReceipts = new Map();
const attachedBrowserSessions = new Set();
let ownershipSequence = 0;
const emitProtocol = value => {
  if (!process.stdout.write(`${JSON.stringify(value)}\n`)) throw new Error('runner-protocol-backpressure');
};
const requireOwnershipAuthorization = (session, sequence) => new Promise((resolvePromise, reject) => {
  let bytes = 0;
  let buffer = '';
  const cleanup = () => {
    process.stdin.off('data', onData);
    process.stdin.off('end', onEnd);
    process.stdin.off('error', onEnd);
  };
  const fail = () => {
    cleanup();
    reject(new Error('runner-ownership-authorization-invalid'));
  };
  const onEnd = () => fail();
  const onData = chunk => {
    if (!Buffer.isBuffer(chunk)) return fail();
    bytes += chunk.length;
    if (bytes > 1_024) return fail();
    buffer += chunk.toString('utf8');
    const newline = buffer.indexOf('\n');
    if (newline === -1) return;
    if (buffer.slice(newline + 1).length !== 0) return fail();
    let message;
    try { message = JSON.parse(buffer.slice(0, newline)); } catch { return fail(); }
    if (!message || Object.keys(message).sort().join(',') !== 'phase,sequence,session,type,version'
      || message.type !== 'ownership-authorized' || message.version !== 4
      || message.phase !== phase || message.sequence !== sequence || message.session !== session) return fail();
    cleanup();
    resolvePromise();
  };
  process.stdin.on('data', onData);
  process.stdin.once('end', onEnd);
  process.stdin.once('error', onEnd);
});
const openWithReceipt = async session => {
  if (!plannedOwnedSessions.includes(session) || launchReceipts.has(session)) {
    throw new Error('runner-launch-receipt-invalid');
  }
  emitProtocol({
    type: 'ownership-intent', version: 4, phase, sequence: ownershipSequence, session,
  });
  await requireOwnershipAuthorization(session, ownershipSequence);
  await acquireBlankBrowser(client, session);
  const launchReceipt = await captureLaunchReceipt(session);
  launchReceipts.set(session, launchReceipt);
  ownedSessions.add(session);
  emitProtocol({
    type: 'ownership-add', version: 4, phase, sequence: ownershipSequence,
    session, launchReceipt,
  });
  ownershipSequence += 1;
  await armAcquiredSignalRecorder(client, session);
};
const confirmAttachedOwnership = session => {
  if (ownedSessions.has(session) || attachedBrowserSessions.has(session)) {
    throw new Error('runner-launch-receipt-invalid');
  }
  emitProtocol({
    type: 'ownership-attach', version: 4, phase, sequence: ownershipSequence, session,
  });
  ownershipSequence += 1;
  attachedBrowserSessions.add(session);
};

const waitForExactLocation = (session, path, sentinel) => client.runCode(session, `async (page) => {
  await page.waitForURL(url => url.origin === ${JSON.stringify(STAGING_ORIGIN)} && url.pathname === ${JSON.stringify(path)}, { timeout: 45000 });
  await page.getByRole('heading', { level: 1, name: ${JSON.stringify(sentinel)}, exact: true }).waitFor({ state: 'visible', timeout: 45000 });
  await page.waitForFunction(() => !/Loading your workspace|Signing in/i.test(document.body?.innerText || ''), { timeout: 20000 }).catch(() => {});
  return true;
}`);
const login = async (session, alias) => {
  const grant = credentialGrant(alias);
  await client.goto(session, `${STAGING_ORIGIN}/login`);
  await client.runCode(session, `async (page) => {
    const response = await page.request.get(${JSON.stringify(grant)});
    if (!response.ok()) throw new Error('credential-broker-refused');
    const credential = await response.json();
    await page.locator('#email').fill(credential.email);
    await page.locator('#password').fill(credential.password);
    credential.email = ''; credential.password = '';
    await page.locator('button[type="submit"]').click();
    return true;
  }`);
};
const clearSession = session => client.runCode(session, `async (page) => {
  await page.context().clearCookies();
  await page.goto('about:blank');
  return true;
}`);
const actionsFor = session => ({
  loginAndLand: alias => login(session, alias),
  navigate: path => client.goto(session, `${STAGING_ORIGIN}${path}`),
  waitForExactLocation: (path, sentinel) => waitForExactLocation(session, path, sentinel),
  waitForSettled: async () => client.runCode(session, 'async (page) => { await page.waitForTimeout(300); return true; }'),
  sameOriginGet: target => client.runCode(session, `async (page) => page.evaluate(async target => (await fetch(target, { method: 'GET', credentials: 'same-origin', cache: 'no-store' })).status, ${JSON.stringify(target)})`),
  firestoreGet: target => client.runCode(session, `async (page) => page.evaluate(async ({ projectId, path }) => {
    const openDatabase = name => new Promise((resolve, reject) => { const request = indexedDB.open(name); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const requestAll = store => new Promise((resolve, reject) => { const request = store.getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const database = await openDatabase('firebaseLocalStorageDb');
    const records = await requestAll(database.transaction('firebaseLocalStorage', 'readonly').objectStore('firebaseLocalStorage'));
    database.close();
    let accessToken = null;
    const visit = (value, depth = 0) => { if (accessToken || !value || typeof value !== 'object' || depth > 8) return; if (typeof value.accessToken === 'string' && value.accessToken.length > 20) { accessToken = value.accessToken; return; } for (const child of Object.values(value)) visit(child, depth + 1); };
    for (const record of records) visit(record);
    if (!accessToken) throw new Error('client-auth-unavailable');
    const encoded = path.split('/').map(encodeURIComponent).join('/');
    const result = await fetch('https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents/' + encoded, { headers: { Authorization: 'Bearer ' + accessToken }, cache: 'no-store' });
    accessToken = null;
    return result.status;
  }, ${JSON.stringify({ projectId: STAGING_PROJECT_ID, path: target.path })})`),
});

const rows = [];
try {
  for (const row of rowsForPhase) {
    const session = rowSession(row);
    const viewport = row.viewportName === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 };
    if (phase === 'before-transition' || row.scenario === 'fresh-login') {
      await openWithReceipt(session);
      if (await setAndVerifyViewport(client, session, viewport) !== row.viewport) {
        throw new Error('runner-viewport-label-invalid');
      }
    } else if (row.scenario === 'stale-session') {
      confirmAttachedOwnership(session);
      await attachExistingSignalRecorder(client, session, {
        ...viewport, marker: session, requireAuthenticated: true,
      });
    }
    if (row.group === 'admission-route') {
      rows.push(await runAdmissionScenario({ client, session, context: row, actions: actionsFor(session) }));
    } else if (row.group === 'isolation') {
      await login(session, row.alias);
      await waitForExactLocation(session, ...isolationLanding[row.alias]);
      rows.push(await runIsolationScenario({
        client, session, context: row, runId: manifest.runId, actions: actionsFor(session),
      }));
    } else if (row.group === 'logout') {
      const freshSession = freshSessionName(row.contextId);
      await openWithReceipt(freshSession);
      if (await setAndVerifyViewport(client, freshSession, viewport) !== row.viewport) {
        throw new Error('runner-viewport-label-invalid');
      }
      await login(session, row.alias);
      await client.tabNew(session, 'about:blank');
      await installSignalRecorder(client, session);
      await client.goto(session, `${STAGING_ORIGIN}/dashboard`);
      await client.tabSelect(session, 0);
      await client.goto(session, `${STAGING_ORIGIN}/settings`);
      await client.runCode(session, "async (page) => { await page.getByRole('button', { name: /Sign Out/i }).waitFor({ state: 'visible', timeout: 45000 }); return true; }");
      const logoutActions = actionsFor(session);
      Object.assign(logoutActions, {
        selectStage: stage => client.tabSelect(session, stage === 'logout-tab' ? 0 : 1),
        'logout-tab': () => client.runCode(session, "async (page) => { await page.getByRole('button', { name: /Sign Out/i }).click(); return true; }"),
        'stale-tab-reload': () => client.runCode(session, 'async (page) => { await page.reload(); return true; }'),
        'stale-tab-back': () => client.runCode(session, 'async (page) => { await page.goBack(); return true; }'),
        'stale-tab-second-reload': () => client.runCode(session, 'async (page) => { await page.reload(); return true; }'),
        waitForLogin: () => waitForExactLocation(session, '/login', 'Sign In'),
        freshUnauthenticated: path => client.goto(freshSession, `${STAGING_ORIGIN}${path}`),
        waitForFreshLogin: () => waitForExactLocation(freshSession, '/login', 'Sign In'),
      });
      rows.push(await runLogoutScenario({
        client, session, freshSession, context: row, actions: logoutActions,
      }));
    } else if (row.scenario === 'active-baseline') {
      rows.push(await runPendingDeletionScenario({
        client, session, context: row, scenario: row.scenario,
        actions: {
          navigate: path => login(session, row.alias).then(() => client.goto(session, `${STAGING_ORIGIN}${path}`)),
          waitForDashboard: () => waitForExactLocation(session, '/dashboard', 'Dashboard'),
        },
      }));
      await client.runCode(session, `async (page) => { page.__phase9RetainedSessionMarker = ${JSON.stringify(session)}; return true; }`);
    } else if (row.scenario === 'stale-session') {
      rows.push(await runPendingDeletionScenario({
        client, session, context: row, scenario: row.scenario,
        actions: {
          reloadRevokedSession: () => client.runCode(session, 'async (page) => { await page.reload(); return true; }'),
          waitForLogin: () => waitForExactLocation(session, '/login', 'Sign In'),
        },
      }));
    } else {
      rows.push(await runPendingDeletionScenario({
        client, session, context: row, scenario: row.scenario,
        actions: {
          freshLogin: () => login(session, row.alias),
          waitForLogin: () => waitForExactLocation(session, '/login', 'Sign In'),
          waitForUnavailable: () => client.runCode(session, "async (page) => { await page.getByRole('status').getByText('The email or password is incorrect, or this account is unavailable.', { exact: true }).waitFor({ state: 'visible', timeout: 45000 }); return true; }"),
        },
      }));
    }
    const result = rows.pop();
    if (result?.result !== 'PASS') throw new Error('scenario-failed');
    rows.push(Object.freeze(Object.fromEntries(REQUIRED_LEDGER_COLUMNS.map(column => [column, result[column]]))));
    if (phase === 'before-transition' && row.group !== 'pending-deletion') await clearSession(session).catch(() => {});
  }
  const browserSessions = [...ownedSessions].sort();
  const receipts = [...launchReceipts.values()].sort((left, right) => left.session.localeCompare(right.session));
  const attached = [...attachedBrowserSessions].sort();
  if (new Set(browserSessions).size !== browserSessions.length
    || receipts.length !== browserSessions.length
    || receipts.some((receipt, index) => receipt.session !== browserSessions[index])) {
    throw new Error('runner-launch-receipt-invalid');
  }
  emitProtocol({
    type: 'ownership-complete', version: 4, phase, sequence: ownershipSequence,
    browserSessions,
    attachedBrowserSessions: attached, launchReceipts: receipts, releasedBrowserSessions: [],
  });
  const sessionsForRow = row => {
    const planned = rowsForPhase.find(candidate => candidate.contextId === row.contextId);
    if (!planned) throw new Error('runner-row-session-invalid');
    const session = rowSession(planned);
    return (planned.group === 'logout' ? [session, freshSessionName(planned.contextId)] : [session]).sort();
  };
  for (const [index, row] of rows.entries()) process.stdout.write(`${JSON.stringify({
    type: 'row', version: 2, phase, index, sessions: sessionsForRow(row), row,
  })}\n`);
  process.stdout.write(`${JSON.stringify({
    type: 'completion', version: 4, phase, ok: true, rowCount: rows.length,
    browserSessions, attachedBrowserSessions: attached, launchReceipts: receipts,
    releasedBrowserSessions: [],
  })}\n`);
} finally {
  identities.clear();
  grants.clear();
  await new Promise(resolvePromise => credentialBroker.close(resolvePromise));
}
