#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fixture_root="$(mktemp -d)"
port=8782
server_pid=""

cleanup() {
  if [[ -n "${server_pid}" ]]; then
    kill "${server_pid}" 2>/dev/null || true
  fi
  rm -rf -- "${fixture_root}"
}
trap cleanup EXIT

printf '<!doctype html><title>diagnostic fixture</title>\n' >"${fixture_root}/index.html"
timeout 10 perl "${repo_root}/.devcontainer/static-server.pl" \
  "${fixture_root}" "${port}" "${fixture_root}/diagnostics.log" >/dev/null 2>&1 &
server_pid=$!

for _ in $(seq 1 20); do
  if curl --fail --silent --head --max-time 1 "http://127.0.0.1:${port}/" >/dev/null; then
    break
  fi
  sleep 0.1
done

status="$(curl --silent --output /dev/null --write-out '%{http_code}' \
  --request POST --header 'Content-Type: text/plain;charset=UTF-8' \
  --data-binary 'console.error atlas exploded' \
  "http://127.0.0.1:${port}/__selah_diag")"

if [[ "${status}" != "204" ]]; then
  echo "expected diagnostic POST status 204, got ${status}" >&2
  exit 1
fi
[[ "$(sed -n '1p' "${fixture_root}/diagnostics.log")" == "console.error atlas exploded" ]]
