#!/usr/bin/env bash
# Dev server for Seek & Destroy.
# The game loads modules via dynamic <script> tags and fetches binary .pak
# assets over HTTP, so it MUST be served over HTTP (opening index.html as a
# file:// URL will NOT work).
#
# Usage:
#   ./serve.sh            # serve on http://localhost:8000
#   ./serve.sh 8080       # serve on a custom port
#   open index.html?test  # run the built-in test harness at boot

set -euo pipefail
PORT="${1:-8000}"
cd "$(dirname "$0")"

echo "Seek & Destroy dev server"
echo "  http://localhost:${PORT}/           (play)"
echo "  http://localhost:${PORT}/?test      (boot + run test harness)"
echo "Press Ctrl+C to stop."
exec python3 -m http.server "${PORT}"
