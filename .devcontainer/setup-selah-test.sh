#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="${repo_root}/.devcontainer/selah-files.txt"
repair_root="${repo_root}/lifecycle-repair"
source_root="${repo_root}/recovered-live"
destination="${repo_root}/.selah-test"
source_url="${SELAH_SOURCE_URL:-https://selahmc.me/client}"
stage="$(mktemp -d "${repo_root}/.selah-stage-XXXXXX")"

base_client_sha="6e775ed50e83a6ba976aea593e0ef70ed74b662f652f3f47f616499a85005ba4"
base_index_sha="bf37f956c331a6275ec8a5d7a6741b55aac77ffead7330efeae58e252b723cfa"
release_client_sha="8d7e33e1f2ee1c2cc229e0d82160c0a4bbc7708a47e2f2c9bbaa1b20a916f584"
release_marker=".ready-v8.3.7-8d7e33e1"

require_repo_child() {
  case "$1" in
    "${repo_root}"/*) ;;
    *)
      echo "Refusing path outside repository: $1" >&2
      exit 1
      ;;
  esac
}

require_repo_child "${stage}"
require_repo_child "${destination}"
require_repo_child "${source_root}"
require_repo_child "${repair_root}/dist"

cleanup() {
  if [[ -n "${stage}" && -d "${stage}" ]]; then
    rm -rf -- "${stage}"
  fi
}
trap cleanup EXIT

fetch_pinned() {
  local source_path="$1"
  local output_path="$2"
  local expected_sha="$3"
  local temporary_path="${output_path}.download-${BASHPID}"

  mkdir -p "$(dirname "${output_path}")"
  curl --fail --location --silent --show-error --retry 3 \
    --connect-timeout 20 \
    "${source_url%/}/${source_path}" \
    --output "${temporary_path}"
  echo "${expected_sha}  ${temporary_path}" | sha256sum --check --status
  mv -- "${temporary_path}" "${output_path}"
}

echo "Preparing SelahMC v8.3.7 from ${source_url}"

mkdir -p "${source_root}"
fetch_pinned \
  "selahmc-client-v8.3.3.js" \
  "${source_root}/selahmc-client-v8.3.3.js" \
  "${base_client_sha}"
fetch_pinned \
  "index.html" \
  "${source_root}/index.html" \
  "${base_index_sha}"

export SELAH_STAGE="${stage}"
export SELAH_SOURCE_URL_RESOLVED="${source_url%/}"
tr '\n' '\0' < "${manifest}" | xargs -0 -r -P 12 -I '{}' bash -c '
  set -euo pipefail
  IFS="|" read -r source_path target_path <<< "$1"
  [[ -n "${source_path}" ]] || exit 0
  [[ -n "${target_path}" ]] || target_path="${source_path}"
  mkdir -p "${SELAH_STAGE}/$(dirname "${target_path}")"
  curl --fail --location --silent --show-error --retry 3 \
    --connect-timeout 20 \
    "${SELAH_SOURCE_URL_RESOLVED}/${source_path}" \
    --output "${SELAH_STAGE}/${target_path}"
' _ '{}'
unset SELAH_STAGE SELAH_SOURCE_URL_RESOLVED

echo "Running SelahMC lifecycle regression suite"
(
  cd "${repair_root}"
  node --test \
    tests/bundle-transformer.test.mjs \
    tests/generated-function-extractor.test.mjs \
    tests/generated-runtime-regressions.test.mjs \
    tests/package-installer.test.mjs \
    tests/package-release-index.test.mjs \
    tests/world-lifecycle-policy.test.mjs
  node tools/package-release.mjs
)

release_root="${repair_root}/dist/SelahMC-v8.3.7-Lifecycle-Transaction"
cp -- "${release_root}/index.html" "${stage}/index.html"
cp -- "${release_root}/selahmc-client-v8.3.7.js" \
  "${stage}/selahmc-client-v8.3.7.js"

(
  cd "${stage}"
  sha256sum --check <<SUMS
${release_client_sha}  selahmc-client-v8.3.7.js
766018891402456aee3c803014b6d1158ccbf0e9dfd7004975dd74cd884cb43b  selah-loader-v8.3.3.js
9ecb0a64045381ae539428178d6db324a68a48ff9bb54bb5fafc57a5921dbddd  selah-optifine-bridge-v8.3.3.js
880c2d18e6f120ec735ab770b655160edc9d473b6a6326e75027723aedf459fd  selahmc-assets-v8.3.3.epk
SUMS
)

node --check "${stage}/selahmc-client-v8.3.7.js"
touch "${stage}/${release_marker}"

if [[ -e "${destination}" ]]; then
  rm -rf -- "${destination}"
fi
mv -- "${stage}" "${destination}"
stage=""
trap - EXIT

echo "SelahMC v8.3.7 is verified and ready."
