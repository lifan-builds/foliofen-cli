// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 lifan-builds. Foliofen CLI; Section 7 attribution terms in ATTRIBUTION.md.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { writePullState } from '../src/core/agent-export-workflow.js';
import { buildSyntheticDemo, formatSyntheticDemo } from '../src/core/demo.js';
import { resolveMyChartPaths } from '../src/core/paths.js';
import { writePrivateFile } from '../src/core/private-files.js';
import { JsonMedicalStore } from '../src/storage/json-store.js';
import {
  parseNpmPackOutput,
  scanPackedFilesForSecrets,
  scanRepositoryDenylist,
} from '../scripts/check-release.mjs';

const execFileAsync = promisify(execFile);

function permissions(stats) {
  return stats.mode & 0o777;
}

test('runtime path resolution honors configured data home', () => {
  const resolved = resolveMyChartPaths({
    dataDir: '/tmp/synthetic-mychart-home',
    packageRoot: '/package',
    homeDir: '/home/demo',
    platform: 'linux',
    env: {},
    pathExists: () => false,
  });
  assert.equal(resolved.dataHome, '/tmp/synthetic-mychart-home');
  assert.equal(resolved.storePath, '/tmp/synthetic-mychart-home/store.json');
  assert.equal(resolved.profileDir, '/tmp/synthetic-mychart-home/browser-profile');
  assert.equal(resolved.attachmentsDir, '/tmp/synthetic-mychart-home/attachments');
  assert.equal(resolved.envPath, '/tmp/synthetic-mychart-home/.env');
  assert.equal(resolved.legacy, false);
});

test('runtime path resolution preserves existing checkout-local state', () => {
  const resolved = resolveMyChartPaths({
    packageRoot: '/repo/mychart-cli',
    homeDir: '/home/demo',
    platform: 'linux',
    env: {},
    pathExists: (candidate) => candidate === '/repo/mychart-cli/.awesome-mychart/store.json',
  });
  assert.equal(resolved.storePath, '/repo/mychart-cli/.awesome-mychart/store.json');
  assert.equal(resolved.profileDir, '/repo/mychart-cli/browser_profiles/awesome-mychart-live');
  assert.equal(resolved.legacy, true);
});

test('runtime path resolution uses the platform data directory for new installs', () => {
  const mac = resolveMyChartPaths({
    packageRoot: '/package',
    homeDir: '/Users/demo',
    platform: 'darwin',
    env: {},
    pathExists: () => false,
  });
  const linux = resolveMyChartPaths({
    packageRoot: '/package',
    homeDir: '/home/demo',
    platform: 'linux',
    env: { XDG_DATA_HOME: '/data' },
    pathExists: () => false,
  });
  assert.equal(mac.dataHome, '/Users/demo/Library/Application Support/mychart-cli');
  assert.equal(linux.dataHome, '/data/mychart-cli');
});

test('medical stores, exports, and pull state use private permissions', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mychart-private-files-'));
  const storePath = path.join(root, 'records', 'store.json');
  const exportPath = path.join(root, 'exports', 'records.jsonl');
  const statePath = path.join(root, 'state', 'pull.json');

  await new JsonMedicalStore({ storePath }).writeStore({ records: [], indexCards: [] });
  await writePrivateFile(exportPath, '{"kind":"synthetic"}\n', 'utf8');
  await writePullState(statePath, { version: 1, scopes: {} });

  if (process.platform !== 'win32') {
    assert.equal(permissions(await stat(path.dirname(storePath))), 0o700);
    assert.equal(permissions(await stat(storePath)), 0o600);
    assert.equal(permissions(await stat(exportPath)), 0o600);
    assert.equal(permissions(await stat(statePath)), 0o600);
  }
});

test('private file writes do not narrow permissions on an existing parent directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mychart-existing-parent-'));
  const sharedDirectory = path.join(root, 'existing');
  await mkdir(sharedDirectory, { mode: 0o755 });
  if (process.platform !== 'win32') await chmod(sharedDirectory, 0o755);

  await writePrivateFile(path.join(sharedDirectory, 'private.txt'), 'synthetic\n');

  if (process.platform !== 'win32') {
    assert.equal(permissions(await stat(sharedDirectory)), 0o755);
    assert.equal(permissions(await stat(path.join(sharedDirectory, 'private.txt'))), 0o600);
  }
});

test('medical store writes do not narrow an existing caller-owned parent directory', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'mychart-existing-store-parent-'));
  const recordsDirectory = path.join(root, 'records');
  await mkdir(recordsDirectory, { mode: 0o755 });
  if (process.platform !== 'win32') await chmod(recordsDirectory, 0o755);

  const storePath = path.join(recordsDirectory, 'store.json');
  await new JsonMedicalStore({ storePath }).writeStore({ records: [], indexCards: [] });

  if (process.platform !== 'win32') {
    assert.equal(permissions(await stat(recordsDirectory)), 0o755);
    assert.equal(permissions(await stat(storePath)), 0o600);
  }
});

test('synthetic demo is deterministic and clearly contains no real patient data', async () => {
  const demo = buildSyntheticDemo();
  const output = formatSyntheticDemo();
  assert.equal(demo.recordCount, 2);
  assert.match(output, /synthetic demo/i);
  assert.match(output, /No network, login, browser profile, or patient data is used/);
  assert.equal(output.includes('Synthetic Demo Patient'), true);

  const cli = await execFileAsync(process.execPath, ['src/cli.mjs', 'demo'], {
    cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'),
  });
  assert.equal(cli.stderr, '');
  assert.equal(cli.stdout, `${output}\n`);
});

test('release repository scan fails closed on unreadable or unexpectedly missing files', async () => {
  await assert.rejects(
    scanRepositoryDenylist({
      rootDir: '/repo',
      repositoryFiles: ['src/cli.mjs'],
      denylist: [],
      readText: async () => {
        const err = new Error('EACCES: permission denied');
        err.code = 'EACCES';
        throw err;
      },
    }),
    /Failed to read repository file src\/cli\.mjs: EACCES/,
  );

  await assert.rejects(
    scanRepositoryDenylist({
      rootDir: '/repo',
      repositoryFiles: ['src/vanished.js'],
      deletedTrackedFiles: new Set(),
      denylist: ['patient-name'],
      readText: async () => {
        const err = new Error('ENOENT: no such file');
        err.code = 'ENOENT';
        throw err;
      },
    }),
    /Failed to read repository file src\/vanished\.js: ENOENT/,
  );

  await scanRepositoryDenylist({
    rootDir: '/repo',
    repositoryFiles: ['scripts/deleted.mjs', 'README.md'],
    deletedTrackedFiles: new Set(['scripts/deleted.mjs']),
    denylist: ['forbidden-phrase'],
    readText: async (target) => {
      if (target.endsWith('deleted.mjs')) {
        const err = new Error('ENOENT: no such file');
        err.code = 'ENOENT';
        throw err;
      }
      return 'Safe documentation\n';
    },
  });

  await assert.rejects(
    scanRepositoryDenylist({
      rootDir: '/repo',
      repositoryFiles: ['README.md'],
      denylist: ['forbidden-phrase'],
      readText: async () => 'Contains FORBIDDEN-PHRASE inside text\n',
    }),
    /denylisted public text found in README\.md/,
  );
});

test('release packed-file scan fails closed on any read error including ENOENT', async () => {
  for (const code of ['ENOENT', 'EACCES']) {
    await assert.rejects(
      scanPackedFilesForSecrets({
        rootDir: '/repo',
        packedFiles: [{ path: 'src/cli.mjs' }],
        readText: async () => {
          const err = new Error(`${code}: read failure`);
          err.code = code;
          throw err;
        },
      }),
      new RegExp(`Failed to read packed file src/cli\\.mjs: ${code}`),
    );
  }

  await assert.rejects(
    scanPackedFilesForSecrets({
      rootDir: '/repo',
      packedFiles: [{ path: 'src/cli.mjs' }],
      readText: async () => 'const hdr = "Authorization: Bearer super-secret-token";\n',
    }),
    /credential-like content found in src\/cli\.mjs/,
  );
});

test('check-release entrypoint executes checks even when invoked through a symlink', async () => {
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'mychart-release-symlink-'));
  const fakeRepo = path.join(tempRoot, 'fake-repo');
  const scriptsDir = path.join(fakeRepo, 'scripts');
  await mkdir(scriptsDir, { recursive: true });
  await writeFile(path.join(fakeRepo, 'package.json'), JSON.stringify({ name: 'wrong-package-name' }));

  const realScript = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'check-release.mjs');
  const symlinkedScript = path.join(tempRoot, 'check-release-link.mjs');
  await symlink(realScript, symlinkedScript);

  // If symlink entrypoint detection failed, check-release-link.mjs would exit 0 silently.
  // Executing inside fakeRepo would only fail if runReleaseCheck actually runs; verify directly on a copy in fakeRepo/scripts invoked via symlink:
  const repoScript = path.join(scriptsDir, 'check-release.mjs');
  const { readFile } = await import('node:fs/promises');
  await writeFile(repoScript, await readFile(realScript, 'utf8'));
  const binLink = path.join(tempRoot, 'bin-check-release');
  await symlink(repoScript, binLink);

  await assert.rejects(
    execFileAsync(process.execPath, [binLink]),
    /unexpected package name/,
  );
});

test('parseNpmPackOutput supports npm <=11 array and npm 12+ keyed object formats', () => {
  const sample = { name: '@lifan-builds/foliofen-cli', entryCount: 1, files: [{ path: 'README.md' }] };
  assert.deepEqual(parseNpmPackOutput(JSON.stringify([sample])), sample);
  assert.deepEqual(parseNpmPackOutput(JSON.stringify({ '@lifan-builds/foliofen-cli': sample })), sample);
  assert.throws(() => parseNpmPackOutput('[]'), /unexpected npm pack output/);
  assert.throws(() => parseNpmPackOutput('{}'), /unexpected npm pack output/);
  assert.throws(() => parseNpmPackOutput('null'), /unexpected npm pack output/);
});
