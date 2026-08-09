import { readFile } from 'node:fs/promises';

const [localPath, remotePath] = process.argv.slice(2);
if (!localPath || !remotePath) {
  throw new Error('Usage: node scripts/check-firestore-rules-drift.mjs <local.rules> <remote-ruleset.json>');
}

const normalize = value => value.replace(/\r\n/g, '\n').trim();
const [local, remotePayload] = await Promise.all([
  readFile(localPath, 'utf8'),
  readFile(remotePath, 'utf8').then(JSON.parse),
]);
const remoteFile = remotePayload?.source?.files?.find(file => file.name === 'firestore.rules') ||
  remotePayload?.source?.files?.find(file => String(file.name || '').endsWith('/firestore.rules'));
if (!remoteFile?.content) throw new Error('The deployed Firestore ruleset did not contain firestore.rules.');
if (normalize(local) !== normalize(remoteFile.content)) {
  throw new Error('Deployed Firestore rules differ from firestore.rules in this revision.');
}
console.log('Deployed Firestore rules match the repository.');
