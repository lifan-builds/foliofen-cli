# Foliofen Privacy Policy

Last updated: November 4, 2026

Foliofen is a local-first Chrome extension for extracting, browsing,
exporting, and optionally asking questions about medical records that you can
access in MyChart.

This policy is written for the Chrome Web Store listing and for users reviewing
the source before installation.

In this policy, data processing generally means local browser processing and
storage, not collection by an Foliofen server.

## Summary

- Foliofen does not create an Foliofen account.
- Foliofen does not operate a cloud service.
- Foliofen does not sell user data.
- Foliofen does not use medical records for advertising.
- Extracted records are stored locally in the user's Chrome profile using
  IndexedDB.
- Medical-record text leaves the user's device only when the user explicitly
  exports a file or uses an AI feature with a configured LLM provider.

## Data Processed

Foliofen can process the following user data:

- MyChart page content visible to the signed-in user, including medical record
  text, visit notes, test results, medications, letters, health summaries, dates,
  provider names, patient labels, and source page URLs.
- Locally generated record metadata such as categories, snippets, sync status,
  extraction timestamps, incremental export watermarks, and runtime diagnostics.
- Optional user-provided LLM settings such as provider selection and API keys.
- Optional chat questions and selected local record context when the user uses
  Ask AI.

This data may include sensitive health information.

## Local Storage

Extracted records and generated index cards are stored in IndexedDB inside the
browser profile where the extension is installed. The extension uses Chrome
extension storage for settings, sync state, chat state, and diagnostics.

Foliofen does not upload stored records to an Foliofen server.

## AI Features

Raw record sync is the default behavior.

AI features are optional. If the user configures Gemini or a CLIProxyAPI-
compatible endpoint and uses Ask AI or explicitly chooses LLM distillation, the
extension sends the relevant prompt and selected record text to that configured
provider or endpoint so it can generate the requested response.

LLM record distillation is opt-in. When enabled, Foliofen preserves the
original extracted source text and stores the distilled clinical view separately.
If distillation fails, the raw record is still stored and the error is recorded
as a diagnostic.

Users should review their selected LLM provider's privacy and retention terms
before enabling AI features.

## Exports

Users can export records to local files from the extension dashboard. Exported
files are created only after the user chooses an export action. Once exported,
users control how those files are stored, shared, or deleted.

## Permissions

Foliofen requests Chrome permissions needed for the extension to work:

- `activeTab`: interact with the current MyChart tab after user action.
- `tabs`: find and reuse the user's prepared MyChart tab during sync.
- `scripting`: inject content scripts into MyChart pages for extraction.
- `storage`: store settings, runtime state, and local extension data.
- `downloads`: save user-requested exports.
- `sidePanel`: provide the lightweight Ask AI side panel.

The declared host patterns are listed below. Chrome host permissions grant
access by scheme and host; the path in the first pattern does not restrict the
host permission to a patient portal. Content-script matching uses the path.
The extension uses this access for supported patient-portal pages, optional
Gemini requests, and local CLIProxyAPI-compatible endpoints:

- `https://*/*mychart*/*`
- `https://generativelanguage.googleapis.com/*`
- `http://127.0.0.1:8317/*`
- `http://localhost:8317/*`

## Data Sharing

Foliofen does not share user data with third parties except when the user:

- exports records to a local file and shares that file, or
- uses an AI feature that sends selected record context to the configured LLM
  provider or endpoint.

## Data Deletion

Users can remove locally stored extension data by clearing the extension's data
in Chrome or uninstalling the extension. Exported files are outside extension
storage and must be deleted by the user from their filesystem.

## Medical Disclaimer

Foliofen is for personal information management only. It does not provide
medical advice, diagnosis, or treatment recommendations. User-facing AI answers
about records include: `This is not medical advice.`

## Contact

For questions or issues, use the GitHub repository issue tracker for this
project.

## Independent project

Foliofen is an independent tool compatible with MyChart® patient portals.
MyChart is a registered trademark of Epic Systems Corporation. Foliofen is not
affiliated with, endorsed by, or sponsored by Epic Systems Corporation.
