#!/usr/bin/env bash
# release_gate.sh — the every-10-versions release gate (dev/docs/TESTING.md
# section 8), the local twin of the version-gate job in dev/ci/e2e.yml.
#
# Rule (identical to the workflow): for version tag vNN the full verification
# battery runs iff the integer N is divisible by 10 (v120, v130, ...). Tags are
# plain vNN with no dots, so the gate is literally N % 10 == 0.
#
# This exists because the deploy credential cannot push .github/workflows/
# (GitHub App token without the `workflows` permission), so the workflow file
# cannot be activated yet — the release runbook calls this script instead and
# the cadence holds either way.
#
# Usage:
#   dev/ci/release_gate.sh              # gate on the newest tag (git describe)
#   dev/ci/release_gate.sh v130         # gate on an explicit tag
#   dev/ci/release_gate.sh v131         # gate closes, exits 0 without running
#
# Battery (when the gate is open): npm test, then the structure audit, then the
# reference-policy gate.
# Exit codes: 0 = gate closed or battery green, 1 = malformed tag, 2 = battery failed.
set -euo pipefail
cd "$(dirname "$0")/../.."

tag="${1:-$(git describe --tags --abbrev=0)}"
n="${tag#v}"
if ! printf '%s' "$n" | grep -Eq '^[0-9]+$'; then
  echo "release_gate: '$tag' is not a vNN version tag" >&2
  exit 1
fi
if [ $((n % 10)) -ne 0 ]; then
  echo "release_gate: $tag -> N=$n, N % 10 != 0 — gate closed, no verification run"
  exit 0
fi

echo "release_gate: $tag -> N=$n is a multiple of 10 — running the full battery"
npm test
python3 dev/scripts/structure_audit.py
python3 dev/scripts/reference_policy_gate.py
echo "release_gate: $tag battery green (suite + structure audit + reference policy)"
