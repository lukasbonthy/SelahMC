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

perl -0pi -e '
  my $count = s/v8\.3\.2/v8.3.3/g;
  die "unexpected v8.3.2 index reference count\n" unless $count == 4;
' "${stage}/index.html"

perl -0pi -e '
  my $count = s/8\.3\.2/8.3.3/g;
  die "unexpected OptiFine bridge version count\n" unless $count == 2;
' "${stage}/selah-optifine-bridge-v8.3.3.js"

perl -0pi -e '
  my $anchor_count = () = /AJd\(c\);c\.cMt=b;/g;
  die "expected exactly one deferred first-use texture anchor\n"
    unless $anchor_count == 1;
  my $version_count = () = /8\.3\.2/g;
  die "unexpected client version count\n" unless $version_count == 1;
  s/AJd\(c\);c\.cMt=b;/AJd(c);c.cpL=b;/;
  s/8\.3\.2/8.3.3/;
  $_ .= "\n" unless /\n\z/;
' "${stage}/selahmc-client-v8.3.3.js"

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
