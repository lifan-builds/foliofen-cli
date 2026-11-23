#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-only
# Copyright (C) 2026 lifan-builds. Foliofen CLI; Section 7 attribution terms in ATTRIBUTION.md.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec node "$ROOT_DIR/scripts/launch-live-harness.mjs"
