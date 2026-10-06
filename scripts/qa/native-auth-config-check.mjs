import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Public metadata only. Matching supplied values is not provider or device proof.
export function checkNativeAuthConfiguration(input) {
  const value = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const failures = [];
  const require = (condition, field) => { if (!condition) failures.push(field); };
  const present = key => typeof value[key] === 'string' && value[key].trim() === value[key] && value[key].length > 0;
  const match = (left, right) => require(present(left) && present(right) && value[left] === value[right], `${left}/${right}`);
  require(['ios', 'android'].includes(value.platform), 'platform');
  require(value.environment === 'qa' && value.releaseBuild === false, 'QA-only build');
  require(value.distribution === 'store', 'distribution');
  for (const field of ['serverEnabled', 'browserEnabled', 'nativeEnabled']) require(value[field] === true, field);
  let validOrigin = false;
  try {
    const url = new URL(value.storeOrigin);
    validOrigin = url.protocol === 'https:' && url.origin === value.storeOrigin && !url.port &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/.test(url.hostname) &&
      !/^(?:\d+\.)+\d+$/.test(url.hostname) && !url.hostname.endsWith('.localhost') && !url.hostname.endsWith('.local');
  } catch { /* Missing or invalid public origin is a configuration failure. */ }
  require(validOrigin, 'storeOrigin');
  match('storeOrigin', 'approvedStoreOrigin');
  require(value.buildIdentifier === 'pro.thesquad.shell.dev', 'QA buildIdentifier');
  match('buildIdentifier', 'registeredIdentifier');
  match('firebaseProjectId', 'webFirebaseProjectId');
  match('firebaseProjectId', 'registeredFirebaseProjectId');
  require(value.firebaseProjectId === 'the-squad-audit-preview', 'QA firebaseProjectId');
  const client = key => require(present(key) && /^\d+-[a-zA-Z0-9_-]+\.apps\.googleusercontent\.com$/.test(value[key]), key);
  client('serverClientId'); match('serverClientId', 'registeredServerClientId');
  if (value.platform === 'android') {
    require(present('signingSha256') && /^[a-f0-9]{64}$/.test(value.signingSha256), 'signingSha256');
    match('signingSha256', 'registeredSigningSha256');
  } else if (value.platform === 'ios') {
    client('iosClientId'); match('iosClientId', 'registeredIosClientId');
    require(present('iosClientId') && value.reversedClientId === value.iosClientId.split('.').reverse().join('.'), 'reversedClientId');
  }
  return { ok: failures.length === 0, failures };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let result;
  try {
    const file = process.argv[2];
    if (!file || !file.startsWith('/')) throw Error('Input required');
    const raw = readFileSync(file);
    if (raw.length > 16384) throw Error('Oversized input');
    result = checkNativeAuthConfiguration(JSON.parse(raw.toString('utf8')));
  } catch { result = { ok: false, failures: ['readable absolute-path public configuration JSON'] }; }
  console.log(JSON.stringify(result));
  process.exitCode = result.ok ? 0 : 1;
}
