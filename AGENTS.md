# mychart-cli guidance

- Keep `mychart-cli` local-first: export only records visible in the dedicated Chrome/Puppeteer profile (`PRIVACY.md`, `docs/live-harness.md`), with zero backend, telemetry, or embedded LLM/clinical interpretation.
- Never include patient data, credentials, `.env` values, browser profiles, `.awesome-mychart/` stores, screenshots, authenticated URLs, or real exports in Git or agent output.
- Verify repository changes with `npm test` and `npm run check:release` (synthetic fixtures only; deterministic checks do not authorize live portal, login, sync, or export runs).
