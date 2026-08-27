#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
site_root="${repo_root}/.selah-test"
diagnostics_log="${repo_root}/.selah-diagnostics.log"

if [[ ! -f "${site_root}/.ready-v8.3.3" ]]; then
  bash "${repo_root}/.devcontainer/setup-selah-test.sh"
fi

if ! curl --fail --silent --max-time 2 http://127.0.0.1:8000/ >/dev/null 2>&1; then
  : >"${diagnostics_log}"
  nohup perl "${repo_root}/.devcontainer/static-server.pl" "${site_root}" 8000 "${diagnostics_log}" \
    >"${repo_root}/.selah-test-server.log" 2>&1 &
fi

for _ in $(seq 1 30); do
  if curl --fail --silent --max-time 2 http://127.0.0.1:8000/ >/dev/null 2>&1; then
    echo "SelahMC v8.3.3 test server: http://localhost:8000"
    exit 0
  fi
  sleep 1
done

echo "SelahMC test server did not become ready." >&2
exit 1
