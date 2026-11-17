import {
  DEFAULT_ATTACHMENTS_DIR,
  DEFAULT_STORE_PATH,
  DEFAULT_TIMEOUT_SECONDS,
} from '../core/paths.js';
import {
  runPuppeteerDeepSync,
} from './sync-runner.js';
import { sleep } from './mychart-auth.js';

export { closeBrowserSession, openBrowserSession } from './sync-runner.js';

export async function triggerRawDeepSync(page, {
  browser,
  session = {},
  force = false,
  categories,
  seedUrls,
  maxRecords,
  maxPages,
  maxBroadPages,
  exhaustive = false,
  requireActivePatient = '',
  profileDir,
  storePath = DEFAULT_STORE_PATH,
  attachmentsDir = DEFAULT_ATTACHMENTS_DIR,
  timeoutSeconds = DEFAULT_TIMEOUT_SECONDS,
  maxTransientRetries = 1,
  onProgress = () => {},
  onRetry = () => {},
} = {}) {
  const activeBrowser = browser || getBrowserFromPage(page);
  if (!activeBrowser) throw new Error('triggerRawDeepSync requires a Puppeteer browser or page.');
  let attempt = 0;
  let retryForce = force;
  while (attempt <= maxTransientRetries) {
    try {
      return await runPuppeteerDeepSync({
        browser: activeBrowser,
        session,
        force: retryForce,
        categories,
        seedUrls,
        maxRecords,
        maxPages,
        maxBroadPages,
        exhaustive,
        requireActivePatient,
        profileDir,
        timeoutSeconds,
        storePath,
        attachmentsDir,
        onProgress,
      });
    } catch (error) {
      if (!isTransientBrowserFrameError(error) || attempt >= maxTransientRetries) throw error;
      attempt += 1;
      retryForce = false;
      onRetry({ attempt, error });
      await sleep(1500);
    }
  }
  throw new Error('Deep sync failed after retry.');
}

export function isTransientBrowserFrameError(error) {
  return /(?:detached\s+Frame|frame\s+was\s+detached|execution context was destroyed|target closed)/i
    .test(String(error?.message || error || ''));
}

function getBrowserFromPage(page) {
  if (!page || typeof page.browser !== 'function') return null;
  try {
    return page.browser();
  } catch {
    return null;
  }
}
