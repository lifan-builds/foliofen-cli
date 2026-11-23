// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2026 lifan-builds. Foliofen CLI; Section 7 attribution terms in ATTRIBUTION.md.
import assert from 'node:assert/strict';
import test from 'node:test';
import { collectVisitCardLinks, selectExtractionLinks } from '../src/browser/sync-runner.js';

function fixturePage({ stall = false, offOrigin = false, resetOnBack = false, finalEmptyLoad = false } = {}) {
  const list = 'https://example.test/MyChart/visits';
  let url = list;
  let expanded = false;
  let loads = 0;
  const clicked = [];
  const card = (index, notes) => ({
    innerText: notes ? 'View clinical notes' : 'View After Visit Summary',
    className: notes ? 'notes button' : 'avs button',
    // data-id identifies an action, NOT an encounter.
    getAttribute: (key) => ({ 'data-id': notes ? 'notes-action' : 'avs-action', 'data-index': String(index) })[key],
    click() { clicked.push([index, notes]); url = `${offOrigin ? 'https://other.test' : 'https://example.test'}/MyChart/app/visits/past-details?csn=demo${index}`; },
  });
  const cards = () => [card(0, false), card(0, true), card(1, true), ...(expanded ? [card(2, true)] : [])];
  const more = {
    innerText: 'Load more past visits',
    getClientRects: () => ((finalEmptyLoad ? loads >= 2 : expanded) ? [] : [1]),
    click() { if (stall) return; loads += 1; expanded = true; },
  };
  const doc = { querySelectorAll: (selector) => selector === '[role="link"][data-id]' ? cards() : [more] };
  const evaluate = async (fn, arg) => {
    const original = globalThis.document;
    globalThis.document = doc;
    try { return fn(arg); } finally { globalThis.document = original; }
  };
  return {
    clicked, url: () => url,
    $$eval: async (_selector, fn, arg) => fn(cards(), arg), evaluate,
    waitForNavigation: async () => {},
    goBack: async () => { url = list; if (resetOnBack) expanded = false; },
    waitForFunction: async (fn, _options, arg) => { if (!await evaluate(fn, arg)) throw new Error('Pagination stalled'); },
  };
}

test('visit cards discover every encounter across pagination and prefer notes to duplicate AVS controls', async () => {
  const page = fixturePage();
  const links = await collectVisitCardLinks(page);
  assert.deepEqual(page.clicked, [[0, true], [1, true], [2, true]]);
  assert.equal(links.length, 3);
  assert.equal(new Set(links.map((link) => link.href)).size, 3);
  const selected = selectExtractionLinks({ extraction: { links, page: { sourceUrl: page.url() } }, target: { category: 'visits' }, expectedOrigin: 'https://example.test' });
  assert.ok(selected.every((link) => link.classification.admission === 'strict'));
});

test('a final load-more click that adds no cards ends discovery instead of discarding found encounters', async () => {
  const page = fixturePage({ finalEmptyLoad: true });
  const links = await collectVisitCardLinks(page);
  assert.deepEqual(page.clicked, [[0, true], [1, true], [2, true]]);
  assert.equal(links.length, 3);
});

test('stalled visit pagination and off-origin navigation fail rather than claim completeness', async () => {
  await assert.rejects(collectVisitCardLinks(fixturePage({ stall: true })), /Pagination stalled/);
  await assert.rejects(collectVisitCardLinks(fixturePage({ offOrigin: true })), /supported encounter/);
});

test('note detail pages are never mistaken for visit-list cards', async () => {
  assert.deepEqual(await collectVisitCardLinks({ url: () => 'https://example.test/MyChart/app/visits/note?csn=demo' }), []);
});

test('covered encounter containers remain refreshable because notes can be added later', async () => {
  const { getSyncSkipReason } = await import('../src/browser/sync-runner.js');
  const target = { category: 'visits', url: 'https://example.test/MyChart/app/visits/past-details?csn=demo', priorityDetail: true, hasStoredRecord: true };
  assert.equal(getSyncSkipReason(target), '');
});

 test('discovery restores expanded entries after full-page back navigation', async () => {
  const page = fixturePage({ resetOnBack: true });
  const links = await collectVisitCardLinks(page);
  assert.equal(links.length, 3);
 });

test('a signed title alone does not establish saved note-body coverage', async () => {
  const { buildPriorityDetailCoverage } = await import('../src/browser/sync-runner.js');
  const coverage = buildPriorityDetailCoverage([{ category: 'visits', recordType: 'visit-note', title: 'Operation Note', rawText: 'Operation Note Signed Apr 13, 2026', sourceUrl: 'https://example.test/MyChart/app/visits/note?csn=demo&hnoID=demo' }]);
  assert.equal(coverage.size, 0);
});

test('discovery observes the caller navigation budget and abort boundary before clicking', async () => {
  const page = fixturePage();
  await assert.rejects(collectVisitCardLinks(page, { beforeNavigation() { throw new Error('max_pages'); } }), /max_pages/);
  assert.equal(page.clicked.length, 0);
  let actions = 0;
  await assert.rejects(collectVisitCardLinks(page, { beforeNavigation() { if (++actions === 2) throw new Error('aborted'); } }), /aborted/);
  assert.equal(page.clicked.length, 1);
});

test('seed targets (priority 0) run before discovery targets', async () => {
  const { compareSyncPriority } = await import('../src/browser/sync-runner.js');
  const ordered = [{ label: 'discovery', priority: 0.5 }, { label: 'default' }, { label: 'seed', priority: 0 }].sort(compareSyncPriority);
  assert.deepEqual(ordered.map((target) => target.label), ['seed', 'discovery', 'default']);
});

test('persisted sync error reasons never carry portal URLs', async () => {
  const { safeErrorReason } = await import('../src/browser/sync-runner.js');
  assert.equal(safeErrorReason(new Error('Navigation failed https://mychart.example.org/app/visits/note?csn=secret')), 'Navigation failed [url]');
});
