#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_VENV="${TMPDIR:-/tmp}/brain-verify-venv"

cd "$ROOT_DIR"

python3 -m py_compile backend/*.py tests/*.py

if [[ ! -x "$BACKEND_VENV/bin/python" ]]; then
  rm -rf "$BACKEND_VENV"
  python3 -m venv "$BACKEND_VENV"
fi

"$BACKEND_VENV/bin/python" -m pip install -q -r backend/requirements.txt
"$BACKEND_VENV/bin/python" -m pytest -q -s tests/audit_regressions.py
"$BACKEND_VENV/bin/python" -m pytest -q -s tests/backend_smoke.py

npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend audit --audit-level=moderate
