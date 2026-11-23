// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 lifan-builds. Foliofen CLI; Section 7 attribution terms in ATTRIBUTION.md.
const { readFileSync } = require('node:fs');
const path = require('node:path');

const EXTRACTOR_MODULE_FILES = [
  '00-shell-and-targets.js',
  '10-text-normalization.js',
  '20-record-parser.js',
  '30-record-quality.js',
  '40-dom-extraction.js',
  '50-links-and-api.js',
];

function buildExtractorInjectionSource() {
  return EXTRACTOR_MODULE_FILES
    .map((file) => readFileSync(path.join(__dirname, 'extractor-modules', file), 'utf8'))
    .join('\n');
}

function loadExtractorApi() {
  const moduleRef = { exports: {} };
  const previous = globalThis.MyChartExtractorCore;
  const runner = new Function(
    'module',
    'exports',
    `${buildExtractorInjectionSource()}\nreturn module.exports || globalThis.MyChartExtractorCore;`,
  );
  const api = runner(moduleRef, moduleRef.exports);
  if (previous) globalThis.MyChartExtractorCore = previous;
  else delete globalThis.MyChartExtractorCore;
  return api;
}

const api = loadExtractorApi();
api.buildExtractorInjectionSource = buildExtractorInjectionSource;
api.EXTRACTOR_MODULE_FILES = EXTRACTOR_MODULE_FILES.slice();

module.exports = api;
