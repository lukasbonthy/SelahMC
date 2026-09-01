#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
TARGET_DIR="${SELAH_CLIENT_DIR:-/srv/selahmc/client}"
BACKUP_ROOT="${SELAH_BACKUP_DIR:-/home/ubuntu/selahmc-client-backups}"
CLIENT_FILE="selahmc-client-v8.3.6.js"

cd "$SCRIPT_DIR"

for required_file in SHA256SUMS README.txt index.html install.sh "$CLIENT_FILE"; do
	if [[ ! -f "$required_file" ]]; then
		echo "Missing package file: $required_file" >&2
		exit 1
	fi
done

sha256sum -c SHA256SUMS

if [[ ! -d "$TARGET_DIR" ]]; then
	echo "SelahMC client directory does not exist: $TARGET_DIR" >&2
	exit 1
fi

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_DIR="$BACKUP_ROOT/$timestamp"
if [[ -e "$BACKUP_DIR" ]]; then
	BACKUP_DIR="$BACKUP_ROOT/$timestamp-$$"
fi
mkdir -p "$BACKUP_DIR"

for current_file in \
	"$TARGET_DIR/index.html" \
	"$TARGET_DIR/selahmc-client-v8.3.3.js" \
	"$TARGET_DIR/selahmc-client-v8.3.4.js" \
	"$TARGET_DIR/selahmc-client-v8.3.5.js" \
	"$TARGET_DIR/selahmc-client-v8.3.6.js"; do
	if [[ -f "$current_file" ]]; then
		cp -p "$current_file" "$BACKUP_DIR/"
	fi
done

temporary_client="$TARGET_DIR/.$CLIENT_FILE.$$"
temporary_index="$TARGET_DIR/.index.html.$$"
cleanup() {
	rm -f "$temporary_client" "$temporary_index"
}
trap cleanup EXIT

install -m 0644 "$CLIENT_FILE" "$temporary_client"
install -m 0644 index.html "$temporary_index"
mv -f "$temporary_client" "$TARGET_DIR/$CLIENT_FILE"
mv -f "$temporary_index" "$TARGET_DIR/index.html"
trap - EXIT

expected_client_hash="$(awk -v file="$CLIENT_FILE" '$2 == file { print $1 }' SHA256SUMS)"
actual_client_hash="$(sha256sum "$TARGET_DIR/$CLIENT_FILE" | awk '{ print $1 }')"
if [[ -z "$expected_client_hash" || "$actual_client_hash" != "$expected_client_hash" ]]; then
	echo "Installed client hash verification failed" >&2
	exit 1
fi

if ! grep -Fq "selahmc-client-v8.3.6.js?v=${expected_client_hash:0:8}" "$TARGET_DIR/index.html"; then
	echo "Installed index does not reference the verified client hash" >&2
	exit 1
fi

echo
echo "Deployment complete: $TARGET_DIR/$CLIENT_FILE"
echo "Backup created: $BACKUP_DIR"
if [[ -f "$BACKUP_DIR/index.html" ]]; then
	printf 'Rollback index: sudo install -m 0644 %q %q\n' \
		"$BACKUP_DIR/index.html" "$TARGET_DIR/index.html"
fi
