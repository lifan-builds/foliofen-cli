import {
  buildDateRangeMarkdownExportDownload,
  buildMarkdownExportDownload,
  filterCardsByRecordDateRange,
} from './markdown-export.js';
import {
  DEFAULT_MAX_SYNC_AGE_MINUTES,
  DEFAULT_STORE_PATH,
} from './paths.js';
import { createRecordBrowserState } from './record-browser.js';
import { JsonMedicalStore } from '../storage/json-store.js';

export function assertFreshDeepSync({
  syncMetadata = {},
  maxAgeMinutes = DEFAULT_MAX_SYNC_AGE_MINUTES,
  now = new Date(),
} = {}) {
  const maxAgeNumber = Number(maxAgeMinutes);
  if (!Number.isFinite(maxAgeNumber) || maxAgeNumber < 1) {
    throw new Error('max sync age must be a positive number of minutes.');
  }
  const lastDeepSyncAt = syncMetadata?.lastDeepSyncAt || '';
  if (!lastDeepSyncAt) {
    throw new Error('No previous foliofen-cli deep sync timestamp is available. Run with --sync or --allow-stale-export.');
  }
  const lastDeepSyncTime = Date.parse(lastDeepSyncAt);
  if (Number.isNaN(lastDeepSyncTime)) {
    throw new Error(`foliofen-cli deep sync timestamp is invalid: ${lastDeepSyncAt}`);
  }
  const ageMinutes = (now.getTime() - lastDeepSyncTime) / 60000;
  if (ageMinutes > maxAgeNumber) {
    throw new Error(
      `foliofen-cli deep sync is stale (${Math.floor(ageMinutes)} minutes old; max ${maxAgeNumber}). Run with --sync or --allow-stale-export.`,
    );
  }
  return {
    lastDeepSyncAt,
    ageMinutes,
    maxAgeMinutes: maxAgeNumber,
  };
}

export async function readStoredRecords({
  storePath = DEFAULT_STORE_PATH,
} = {}) {
  const store = new JsonMedicalStore({ storePath });
  const [cards, records, syncMetadata] = await Promise.all([
    store.getIndexCards(),
    store.getAllRecords(),
    store.getSyncMetadata(),
  ]);
  return { cards, records, syncMetadata };
}

export function normalizeSourceHost(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  try {
    return new URL(raw.includes('://') ? raw : `https://${raw}`).host;
  } catch {
    return raw.replace(/^\/\//, '').split('/')[0];
  }
}

function getSourceHost(card = {}, record = {}) {
  return normalizeSourceHost(card.sourceUrl || record.sourceUrl || '');
}

export function filterRecordCards({
  cards = [],
  records = [],
  patient = '',
  patientLabelExact = '',
  patientKey = '',
  sourceHost = '',
  category = '',
  categories = [],
  query = '',
} = {}) {
  const recordsById = records instanceof Map
    ? records
    : new Map(records.map((record) => [record.id, record]));
  let filteredCards = cards.filter((card) => recordsById.has(card.id));
  const expectedSourceHost = normalizeSourceHost(sourceHost);

  if (expectedSourceHost) {
    filteredCards = filteredCards.filter((card) => (
      getSourceHost(card, recordsById.get(card.id)) === expectedSourceHost
    ));
  }

  if (patient) {
    const needle = String(patient).toLowerCase();
    filteredCards = filteredCards.filter((card) => (
      String(card.patient?.label || '').toLowerCase().includes(needle)
    ));
  }

  if (patientLabelExact) {
    const expectedLabel = String(patientLabelExact).replace(/\s+/g, ' ').trim().toLowerCase();
    filteredCards = filteredCards.filter((card) => (
      String(card.patient?.label || card.patient?.name || '').replace(/\s+/g, ' ').trim().toLowerCase() === expectedLabel
    ));
  }

  if (categories.length) {
    const categorySet = new Set(categories);
    filteredCards = filteredCards.filter((card) => categorySet.has(card.category));
  }

  const state = createRecordBrowserState({
    cards: filteredCards,
    records: recordsById,
    patientKey,
    category,
    query,
    selectedRecordId: '',
    limit: Number.POSITIVE_INFINITY,
  });

  return {
    cards: state.filteredCards,
    recordsById,
    totalMatchingCount: state.totalMatchingCount,
    totalCardCount: state.cards.length,
  };
}

export function buildRecordsMarkdownExport({
  cards = [],
  records = [],
  all = false,
  startDate = '',
  endDate = '',
  filters = {},
  generatedAt,
} = {}) {
  const recordsById = records instanceof Map
    ? records
    : new Map(records.map((record) => [record.id, record]));
  const exportDownload = all
    ? buildMarkdownExportDownload({
        generatedAt,
        cards,
        records: recordsById,
        filters,
      })
    : buildDateRangeMarkdownExportDownload({
        generatedAt,
        startDate,
        endDate,
        cards,
        records: recordsById,
        filters,
      });
  const exportedCards = all
    ? cards
    : filterCardsByRecordDateRange(cards, recordsById, { startDate, endDate });
  return {
    ...exportDownload,
    exportedCards,
  };
}
