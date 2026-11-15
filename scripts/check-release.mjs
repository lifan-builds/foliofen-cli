#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const allowedTopLevel = new Set([
  '.env.example',
  'CHANGELOG.md',
  'CONTRIBUTING.md',
  'LICENSE',
  'PRIVACY.md',
  'README.md',
  'SECURITY.md',
  'docs',
  'package.json',
  'scripts',
  'src',
]);

export const DEFAULT_SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,
  /^(?:[A-Z0-9_]*(?:PASSWORD|TOKEN|SECRET|API_KEY)[A-Z0-9_]*)[ \t]*=[ \t]*[^\r\n.\s]+/m,
  /Authorization:\s*Bearer\s+[A-Za-z0-9._-]+/i,
];

export async function scanRepositoryDenylist({
  rootDir,
  repositoryFiles,
  deletedTrackedFiles = new Set(),
  denylist = [],
  readText = (filePath) => readFile(filePath, 'utf8'),
}) {
  for (const filePath of new Set(repositoryFiles)) {
    let content;
    try {
      content = await readText(path.join(rootDir, filePath));
    } catch (error) {
      if (error?.code === 'ENOENT' && deletedTrackedFiles.has(filePath)) {
        continue;
      }
      throw new Error(`Failed to read repository file ${filePath}: ${error?.message || error}`, { cause: error });
    }
    for (const value of denylist) {
      assert(!content.toLowerCase().includes(value.toLowerCase()), `denylisted public text found in ${filePath}`);
    }
  }
}

export async function scanPackedFilesForSecrets({
  rootDir,
  packedFiles,
  secretPatterns = DEFAULT_SECRET_PATTERNS,
  readText = (filePath) => readFile(filePath, 'utf8'),
}) {
  assert(Array.isArray(packedFiles) && packedFiles.length > 0, 'npm pack reported no files');
  for (const file of packedFiles) {
    assert(typeof file?.path === 'string' && file.path.length > 0, 'invalid packed file entry');
    let content;
    try {
      content = await readText(path.join(rootDir, file.path));
    } catch (error) {
      throw new Error(`Failed to read packed file ${file.path}: ${error?.message || error}`, { cause: error });
    }
    for (const pattern of secretPatterns) {
      assert(!pattern.test(content), `credential-like content found in ${file.path}`);
    }
  }
}

export async function runReleaseCheck({ rootDir = root, env = process.env } = {}) {
  const packageJson = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'));
  assert(packageJson.name === '@lifan-builds/mychart-cli', 'unexpected package name');
  assert(packageJson.bin?.['mychart-cli'] === 'src/cli.mjs', 'missing mychart-cli bin mapping');
  assert(Number(String(packageJson.engines?.node || '').match(/\d+/)?.[0] || 0) >= 20, 'Node 20+ engine is required');
  assert(packageJson.dependencies?.['puppeteer-core'], 'puppeteer-core must be a runtime dependency');

  const { stdout } = await execFileAsync('npm', ['pack', '--dry-run', '--json'], { cwd: rootDir });
  const packList = JSON.parse(stdout);
  assert(Array.isArray(packList) && packList.length === 1 && packList[0], 'unexpected npm pack output');
  const pack = packList[0];
  assert(Array.isArray(pack.files) && pack.files.length > 0, 'npm pack reported no files');
  const packedPaths = new Set(pack.files.map((file) => file.path));
  assert(packedPaths.has('scripts/init-live-harness.sh'), 'missing published live-harness compatibility launcher');
  for (const file of pack.files) {
    const topLevel = file.path.split('/', 1)[0];
    assert(allowedTopLevel.has(topLevel), `package contains non-release path: ${file.path}`);
    assert(!/(?:^|\/)(?:\.trellis|\.agents|\.claude|\.codex|tests|browser_profiles|\.awesome-mychart)(?:\/|$)/.test(file.path),
      `package contains private/development path: ${file.path}`);
  }

  const denylist = String(env.MYCHART_CLI_PUBLIC_DENYLIST || '')
    .split('||')
    .map((value) => value.trim())
    .filter(Boolean);

  const [{ stdout: repositoryFileOutput }, { stdout: deletedFileOutput }] = await Promise.all([
    execFileAsync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: rootDir, encoding: 'buffer' }),
    execFileAsync('git', ['ls-files', '-d', '-z'], { cwd: rootDir, encoding: 'buffer' }),
  ]);
  const repositoryFiles = repositoryFileOutput.toString('utf8').split('\0').filter(Boolean);
  const deletedTrackedFiles = new Set(deletedFileOutput.toString('utf8').split('\0').filter(Boolean));

  await scanRepositoryDenylist({
    rootDir,
    repositoryFiles,
    deletedTrackedFiles,
    denylist,
  });
  await scanPackedFilesForSecrets({
    rootDir,
    packedFiles: pack.files,
  });

  console.log(`Release package check passed: ${pack.entryCount} files, ${pack.unpackedSize} unpacked bytes.`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isExecutedDirectly(argvEntry, moduleUrl) {
  if (!argvEntry) return false;
  try {
    return realpathSync(argvEntry) === realpathSync(fileURLToPath(moduleUrl));
  } catch {
    return path.resolve(argvEntry) === fileURLToPath(moduleUrl);
  }
}

if (isExecutedDirectly(process.argv[1], import.meta.url)) {
  await runReleaseCheck();
}
