'use strict';

const Module = require('node:module');
const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const guardianMarkerName = 'PHASE9_GUARDIAN_RUN_MARKER';
const guardianMarkerNameSha256 = '585c21d0652b1f1c5dd8168796ee2599745f8a1a9885e3178ac29b057f0044c3';
const chromeBinary = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const profileDescriptorRuntime = '/usr/bin/python3';
const profileDescriptorFchdir = `
import os, sys
if len(sys.argv) < 3 or os.environ.get("PHASE9_PROFILE_CWD") != "descriptor":
    raise SystemExit("profile-descriptor-launch-invalid")
os.fchdir(3)
os.umask(0o077)
os.environ["TMPDIR"] = "."
os.execve(sys.argv[1], sys.argv[1:], os.environ)
`;

if (!globalThis.__phase9PlaywrightTransportModuleGuard) {
  let cursor = __dirname;
  while (path.basename(cursor) !== 'node_modules') {
    const parent = path.dirname(cursor);
    if (parent === cursor) throw new Error('Playwright transport module root is invalid.');
    cursor = parent;
  }
  const transportRoot = `${path.dirname(cursor)}${path.sep}`;
  const originalLoad = Module._load;
  const builtins = new Set(Module.builtinModules.flatMap(name => [name, `node:${name}`]));
  Module._load = function phase9ClosedModuleLoad(request, parent, isMain) {
    if (builtins.has(request)) return originalLoad.call(this, request, parent, isMain);
    const resolved = Module._resolveFilename(request, parent, isMain);
    if (typeof resolved !== 'string' || !resolved.startsWith(transportRoot)) {
      throw new Error('Playwright transport refused an external JavaScript module.');
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  const guardianMarker = process.env[guardianMarkerName];
  const descriptorProfile = process.env.PHASE9_PROFILE_CWD === 'descriptor';
  let descriptorWorkspaceToken = null;
  if (descriptorProfile) {
    const held = fs.fstatSync(3);
    const descriptorCwd = process.env.TMPDIR === '.';
    const selected = descriptorCwd ? fs.statSync('.') : null;
    if (!held.isDirectory() || held.uid !== process.geteuid() || (held.mode & 0o777) !== 0o700
      || (!descriptorCwd && !/^\/tmp\/phase9-core-identities\.[A-Za-z0-9_-]+\/playwright-tmp$/.test(process.env.TMPDIR ?? ''))
      || (selected && (!selected.isDirectory() || selected.isSymbolicLink()
        || held.dev !== selected.dev || held.ino !== selected.ino))) {
      throw new Error('Playwright transport profile descriptor is invalid.');
    }
    descriptorWorkspaceToken = `phase9-profile-${held.dev}-${held.ino}`;
    if (!descriptorCwd) {
      const ignoredWorkspaceSentinel = path.join(process.cwd(), '.playwright');
      const originalExistsSync = fs.existsSync;
      fs.existsSync = candidate => candidate === ignoredWorkspaceSentinel
        ? false : originalExistsSync(candidate);
    }
    const originalCreateHash = crypto.createHash;
    crypto.createHash = function phase9DescriptorWorkspaceHash(algorithm, options) {
      const hash = originalCreateHash.call(this, algorithm, options);
      if (algorithm !== 'sha1') return hash;
      const originalUpdate = hash.update;
      hash.update = function phase9DescriptorWorkspaceUpdate(data, encoding) {
        const selected = data === `${transportRoot}node_modules/playwright-core`
          ? descriptorWorkspaceToken : data;
        return originalUpdate.call(this, selected, encoding);
      };
      return hash;
    };
  }
  if (guardianMarker !== undefined || descriptorProfile) {
    if (crypto.createHash('sha256').update(guardianMarkerName).digest('hex') !== guardianMarkerNameSha256
      || (guardianMarker !== undefined && !/^[0-9a-f]{64}$/.test(guardianMarker))) {
      throw new Error('Playwright transport guardian marker is invalid.');
    }
    const originalSpawn = childProcess.spawn;
    childProcess.spawn = function phase9MarkedChromeSpawn(file, args, options) {
      const isChrome = file === chromeBinary;
      const isDaemon = descriptorProfile && file === process.execPath
        && args?.[0] === `${transportRoot}node_modules/playwright-core/lib/entry/cliDaemon.js`;
      const markedArgs = isChrome && guardianMarker !== undefined
        ? [...args, `--${guardianMarkerName}=${guardianMarker}`] : args;
      const markedOptions = {
        ...options,
        ...(isChrome && guardianMarker !== undefined ? {
          env: { ...(options?.env ?? process.env), [guardianMarkerName]: guardianMarker },
        } : {}),
        ...(descriptorProfile && (isDaemon || isChrome) ? { cwd: undefined } : {}),
        ...(isDaemon ? { stdio: [...options.stdio, 3] } : {}),
      };
      return originalSpawn.call(
        this,
        isDaemon ? profileDescriptorRuntime : file,
        isDaemon ? ['-I', '-c', profileDescriptorFchdir, process.execPath, ...markedArgs] : markedArgs,
        markedOptions,
      );
    };
  }
  Object.defineProperty(globalThis, '__phase9PlaywrightTransportModuleGuard', {
    configurable: false, enumerable: false, writable: false, value: true,
  });
}
