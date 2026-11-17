#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { main as runCli } from '../src/cli.mjs';

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function translateArgs(argv) {
  let format = 'jsonl';
  let hasOutputTarget = false;
  const forwarded = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--format') {
      index += 1;
      if (index >= argv.length) throw new Error('--format requires a value.');
      format = argv[index];
      continue;
    }
    if (arg === '--output' || arg === '--output-dir') hasOutputTarget = true;
    forwarded.push(arg);
  }

  if (!['jsonl', 'markdown'].includes(format)) {
    throw new Error('--format must be jsonl or markdown.');
  }
  if (!hasOutputTarget && !forwarded.includes('--help') && !forwarded.includes('-h')) {
    forwarded.push('--output-dir', PROJECT_ROOT);
  }
  return ['export', format, ...forwarded];
}

try {
  await runCli(translateArgs(process.argv.slice(2)));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
