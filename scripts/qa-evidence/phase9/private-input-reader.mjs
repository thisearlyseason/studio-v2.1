import { constants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import { join, normalize } from 'node:path';

const WORKSPACE_PATTERN = /^\/tmp\/phase9-core-identities\.[A-Za-z0-9_-]+$/;
const MAX_PRIVATE_INPUT_BYTES = 262_144;

const exactIdentity = (stats, type) => Object.freeze({
  type,
  dev: stats.dev,
  ino: stats.ino,
  uid: stats.uid,
  mode: stats.mode,
  nlink: stats.nlink,
  size: stats.size,
  mtimeMs: stats.mtimeMs,
  ctimeMs: stats.ctimeMs,
});

const sameIdentity = (left, right, {
  includeContentMetadata = false,
  includeLinkCount = true,
} = {}) => (
  left.type === right.type
  && left.dev === right.dev
  && left.ino === right.ino
  && left.uid === right.uid
  && left.mode === right.mode
  && (!includeLinkCount || (left.nlink === right.nlink))
  && (!includeContentMetadata || (
    left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs
  ))
);

const requireDirectory = stats => {
  if (!stats.isDirectory() || stats.isSymbolicLink() || (stats.mode & 0o777) !== 0o700
    || stats.nlink < 1) throw new Error('runner-configuration-invalid');
  return exactIdentity(stats, 'directory');
};

const requireRegularFile = stats => {
  if (!stats.isFile() || stats.isSymbolicLink() || (stats.mode & 0o777) !== 0o600
    || stats.nlink !== 1 || stats.size < 1 || stats.size > MAX_PRIVATE_INPUT_BYTES) {
    throw new Error('runner-private-input-invalid');
  }
  return exactIdentity(stats, 'regular-file');
};

export async function openBoundPrivateInputs({
  workspace,
  manifestPath,
  credentialsPath,
  profileRootPath,
  filesystem = Object.freeze({ lstat, open, realpath }),
  openConstants = constants,
} = {}) {
  if (typeof workspace !== 'string' || normalize(workspace) !== workspace
    || !WORKSPACE_PATTERN.test(workspace)
    || manifestPath !== join(workspace, 'manifest.json')
    || credentialsPath !== join(workspace, 'credentials.json')
    || profileRootPath !== join(workspace, 'playwright-tmp')) {
    throw new Error('runner-configuration-invalid');
  }

  const canonicalTemporaryRoot = await filesystem.realpath('/tmp');
  const expectedCanonicalWorkspace = join(
    canonicalTemporaryRoot, workspace.slice('/tmp/'.length),
  );
  const [canonicalWorkspace, canonicalProfileRoot] = await Promise.all([
    filesystem.realpath(workspace), filesystem.realpath(profileRootPath),
  ]);
  if (canonicalWorkspace !== expectedCanonicalWorkspace
    || canonicalProfileRoot !== join(canonicalWorkspace, 'playwright-tmp')) {
    throw new Error('runner-configuration-invalid');
  }

  const trustedWorkspace = requireDirectory(await filesystem.lstat(workspace));
  const trustedProfile = requireDirectory(await filesystem.lstat(profileRootPath));
  const directoryFlags = openConstants.O_RDONLY | openConstants.O_DIRECTORY | openConstants.O_NOFOLLOW;
  const fileFlags = openConstants.O_RDONLY | openConstants.O_NOFOLLOW;
  const workspaceHandle = await filesystem.open(workspace, directoryFlags);
  let profileHandle;
  try {
    profileHandle = await filesystem.open(profileRootPath, directoryFlags);
    const workspaceIdentity = requireDirectory(await workspaceHandle.stat());
    const profileIdentity = requireDirectory(await profileHandle.stat());
    if (!sameIdentity(trustedWorkspace, workspaceIdentity, { includeLinkCount: false })
      || !sameIdentity(trustedProfile, profileIdentity, { includeLinkCount: false })) {
      throw new Error('runner-configuration-invalid');
    }

    const revalidateDirectories = async () => {
      const [workspaceHeld, workspaceNamed, profileHeld, profileNamed] = await Promise.all([
        workspaceHandle.stat(), filesystem.lstat(workspace),
        profileHandle.stat(), filesystem.lstat(profileRootPath),
      ]);
      if (!sameIdentity(workspaceIdentity, requireDirectory(workspaceHeld), { includeLinkCount: false })
        || !sameIdentity(workspaceIdentity, requireDirectory(workspaceNamed), { includeLinkCount: false })
        || !sameIdentity(profileIdentity, requireDirectory(profileHeld), { includeLinkCount: false })
        || !sameIdentity(profileIdentity, requireDirectory(profileNamed), { includeLinkCount: false })) {
        throw new Error('runner-configuration-invalid');
      }
    };

    await revalidateDirectories();

    const readPrivateJson = async (path, name) => {
      if (path !== join(workspace, name)) {
        throw new Error('runner-private-path-invalid');
      }
      await revalidateDirectories();
      const trustedNamed = requireRegularFile(await filesystem.lstat(path));
      if (await filesystem.realpath(path) !== join(canonicalWorkspace, name)) {
        throw new Error('runner-private-path-invalid');
      }
      await revalidateDirectories();
      const handle = await filesystem.open(path, fileFlags);
      try {
        const before = requireRegularFile(await handle.stat());
        const namedBefore = requireRegularFile(await filesystem.lstat(path));
        if (!sameIdentity(trustedNamed, before, { includeContentMetadata: true })
          || !sameIdentity(before, namedBefore, { includeContentMetadata: true })) {
          throw new Error('runner-private-input-invalid');
        }
        const text = await handle.readFile({ encoding: 'utf8' });
        const after = requireRegularFile(await handle.stat());
        const namedAfter = requireRegularFile(await filesystem.lstat(path));
        if (Buffer.byteLength(text, 'utf8') !== before.size
          || !sameIdentity(before, after, { includeContentMetadata: true })
          || !sameIdentity(before, namedAfter, { includeContentMetadata: true })) {
          throw new Error('runner-private-input-invalid');
        }
        await revalidateDirectories();
        return JSON.parse(text);
      } finally {
        await handle.close();
      }
    };

    const manifest = await readPrivateJson(manifestPath, 'manifest.json');
    const credentials = await readPrivateJson(credentialsPath, 'credentials.json');
    await revalidateDirectories();
    let closed = false;
    return Object.freeze({
      manifest,
      credentials,
      revalidate: revalidateDirectories,
      profileDescriptor: profileHandle.fd,
      close: async () => {
        if (closed) return;
        closed = true;
        await Promise.all([profileHandle.close(), workspaceHandle.close()]);
      },
    });
  } catch (error) {
    await profileHandle?.close().catch(() => {});
    await workspaceHandle.close().catch(() => {});
    throw error;
  }
}
