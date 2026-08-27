#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
manifest="${repo_root}/.devcontainer/selah-files.txt"
destination="${repo_root}/.selah-test"
source_url="${SELAH_SOURCE_URL:-https://selahmc.me/client}"
stage="$(mktemp -d "${repo_root}/.selah-stage-XXXXXX")"

cleanup() {
  if [[ -d "${stage}" ]]; then
    rm -rf -- "${stage}"
  fi
}
trap cleanup EXIT

echo "Preparing SelahMC v8.3.3 from ${source_url}"
while IFS='|' read -r source_path target_path; do
  [[ -n "${source_path}" ]] || continue
  if [[ -z "${target_path}" ]]; then
    target_path="${source_path}"
  fi
  mkdir -p "${stage}/$(dirname "${target_path}")"
  curl --fail --location --silent --show-error --retry 3 \
    --connect-timeout 20 \
    "${source_url%/}/${source_path}" \
    --output "${stage}/${target_path}"
done < "${manifest}"

python3 - "${stage}" <<'PY'
from pathlib import Path
import sys

root = Path(sys.argv[1])

index_path = root / "index.html"
index = index_path.read_text(encoding="utf-8")
if index.count("v8.3.2") != 4:
    raise SystemExit("unexpected v8.3.2 index reference count")
index_path.write_text(index.replace("v8.3.2", "v8.3.3"), encoding="utf-8")

bridge_path = root / "selah-optifine-bridge-v8.3.3.js"
bridge = bridge_path.read_text(encoding="utf-8")
if bridge.count("8.3.2") != 2:
    raise SystemExit("unexpected OptiFine bridge version count")
bridge_path.write_text(bridge.replace("8.3.2", "8.3.3"), encoding="utf-8")

client_path = root / "selahmc-client-v8.3.3.js"
client = client_path.read_text(encoding="utf-8")
old_anchor = "AJd(c);c.cMt=b;"
new_anchor = "AJd(c);c.cpL=b;"
if client.count(old_anchor) != 1:
    raise SystemExit("expected exactly one deferred first-use texture anchor")
if client.count("8.3.2") != 1:
    raise SystemExit("unexpected client version count")
client = client.replace(old_anchor, new_anchor).replace("8.3.2", "8.3.3")
if not client.endswith("\n"):
    client += "\n"
client_path.write_text(client, encoding="utf-8")
PY

(
  cd "${stage}"
  sha256sum --check <<'SUMS'
c73a44da32a9909e939ad6c163e8fcc4f3a9c6b25b4d8d5caa59e260cbcbff6a  index.html
eb97d558f6a776f4125f98a77ecc31c15b3052d07ab22a4cb87ea7b0d817a4a8  selah-loader-v8.3.3.js
9ecb0a64045381ae539428178d6db324a68a48ff9bb54bb5fafc57a5921dbddd  selah-optifine-bridge-v8.3.3.js
ac3b0acac7919bcb53e5a60a2bb77c57e928aa2683731a292a52a8fd2bc8a744  selahmc-client-v8.3.3.js
880c2d18e6f120ec735ab770b655160edc9d473b6a6326e75027723aedf459fd  selahmc-assets-v8.3.3.epk
SUMS
)
touch "${stage}/.ready-v8.3.3"
rm -rf -- "${destination}"
mv -- "${stage}" "${destination}"
stage=""
trap - EXIT
echo "SelahMC v8.3.3 is verified and ready."
