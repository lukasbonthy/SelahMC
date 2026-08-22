#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
WORK="$ROOT/work"
BASE="$WORK/eagler112"
DEFERRED_UPSTREAM="$WORK/eagler18"
REPORT="$WORK/report.txt"
LOG="$WORK/build.log"

BASE_REPO="https://github.com/lenabena67/eaglercraft-base-client.git"
BASE_COMMIT="9d055f6f9cb40322768625226377508542e74a50"
DEFERRED_REPO="https://github.com/Eaglercraft-Archive/Eaglercraftx-u19-source.git"

rm -rf "$WORK"
mkdir -p "$WORK"
exec > >(tee "$LOG") 2>&1

say() { printf '\n===== %s =====\n' "$*"; }

say "Clone Eaglercraft 1.12.2 baseline"
git clone --quiet "$BASE_REPO" "$BASE"
git -C "$BASE" checkout --quiet "$BASE_COMMIT"
printf 'baseline=%s\n' "$(git -C "$BASE" rev-parse HEAD)" > "$REPORT"

say "Clone deferred renderer reference"
git clone --quiet --depth 1 "$DEFERRED_REPO" "$DEFERRED_UPSTREAM"
printf 'deferred_ref=%s\n' "$(git -C "$DEFERRED_UPSTREAM" rev-parse HEAD)" >> "$REPORT"

say "Locate source roots"
BASE_MAIN="$BASE/src/main/java"
BASE_GAME="$BASE/src/game/java"
UP_MAIN="$DEFERRED_UPSTREAM/sources/main/java"
UP_RES="$DEFERRED_UPSTREAM/sources/resources"
for d in "$BASE_MAIN" "$BASE_GAME" "$UP_MAIN"; do
  test -d "$d" || { echo "Missing expected source root: $d"; exit 20; }
done

say "Copy native deferred renderer source"
SRC_DEFERRED="$UP_MAIN/net/lax1dude/eaglercraft/v1_8/opengl/ext/deferred"
DST_DEFERRED="$BASE_MAIN/net/lax1dude/eaglercraft/opengl/ext/deferred"
test -d "$SRC_DEFERRED" || { echo "Deferred source not found: $SRC_DEFERRED"; exit 21; }
mkdir -p "$(dirname "$DST_DEFERRED")"
rm -rf "$DST_DEFERRED"
cp -a "$SRC_DEFERRED" "$DST_DEFERRED"

copy_if_present() {
  local src="$1" rel="$2"
  test -e "$src" || return 0
  for dstroot in "$BASE/src/main/resources" "$BASE/src/game/resources"; do
    if test -d "$dstroot"; then
      mkdir -p "$dstroot/$(dirname "$rel")"
      rm -rf "$dstroot/$rel"
      cp -a "$src" "$dstroot/$rel"
    fi
  done
}
copy_if_present "$UP_RES/assets/eagler/glsl/deferred" "assets/eagler/glsl/deferred"
copy_if_present "$UP_RES/assets/eagler/textures" "assets/eagler/textures"

say "Apply 1.12 compatibility pass"
python3 "$ROOT/port_deferred.py" "$BASE" "$DEFERRED_UPSTREAM"

say "Compile JavaScript"
cd "$BASE"
chmod +x gradlew CompileJS.sh CompileEPK.sh 2>/dev/null || true
./gradlew --no-daemon generateJavascript

say "Compile EPK"
./CompileEPK.sh

say "Verify output"
test -s javascript/classes.js
test -s javascript/assets.epk
node --check javascript/classes.js
for marker in EaglerDeferredPipeline GuiShaderConfig GuiShaderConfigList; do
  if grep -aq "$marker" javascript/classes.js; then
    printf '%s=present\n' "$marker" >> "$REPORT"
  else
    printf '%s=missing\n' "$marker" >> "$REPORT"
    exit 30
  fi
done
printf 'classes_js_bytes=%s\n' "$(stat -c '%s' javascript/classes.js)" >> "$REPORT"
printf 'assets_epk_bytes=%s\n' "$(stat -c '%s' javascript/assets.epk)" >> "$REPORT"
cat "$REPORT"
