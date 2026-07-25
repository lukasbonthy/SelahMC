#!/usr/bin/env bash
set -euo pipefail

CADDYFILE="${CADDYFILE:-/etc/caddy/Caddyfile}"
SOCIAL_ROOT="${SOCIAL_ROOT:-/srv/selahmc/social}"
MARKER_BEGIN="# SELAHMC_ACCOUNT_SOCIAL_BEGIN"
MARKER_END="# SELAHMC_ACCOUNT_SOCIAL_END"

if [[ ! -f "$CADDYFILE" ]]; then
  echo "ERROR: Caddyfile not found at $CADDYFILE" >&2
  exit 1
fi

BACKUP="${CADDYFILE}.backup-account-social-$(date -u +%Y%m%d-%H%M%S)"
sudo cp -a "$CADDYFILE" "$BACKUP"

tmp="$(mktemp)"
sudo python3 - "$CADDYFILE" "$tmp" <<'PY'
from pathlib import Path
import re
import sys

source = Path(sys.argv[1])
target = Path(sys.argv[2])
text = source.read_text()

begin = "# SELAHMC_ACCOUNT_SOCIAL_BEGIN"
end = "# SELAHMC_ACCOUNT_SOCIAL_END"
text = re.sub(r"\n?[ \t]*# SELAHMC_ACCOUNT_SOCIAL_BEGIN.*?# SELAHMC_ACCOUNT_SOCIAL_END[ \t]*\n?", "\n", text, flags=re.S)

lines = text.splitlines()
site_start = None
for index, line in enumerate(lines):
    stripped = line.strip()
    if "selahmc.me" in stripped and "{" in stripped and not stripped.startswith("#"):
        site_start = index
        break

if site_start is None:
    raise SystemExit("ERROR: Could not find the selahmc.me site block in the Caddyfile.")

indent = re.match(r"\s*", lines[site_start]).group(0) + "\t"
block = [
    indent + begin,
    indent + "@selahAccountLogin path /login",
    indent + "redir @selahAccountLogin /social/ 302",
    indent + "@selahAccountSignup path /signup",
    indent + "redir @selahAccountSignup /social/?mode=signup 302",
    indent + "@selahFriends path /friends",
    indent + "redir @selahFriends /social/ 302",
    indent + "@selahSocialRoot path /social",
    indent + "redir @selahSocialRoot /social/ 308",
    indent + "handle_path /auth-api/* {",
    indent + "\treverse_proxy 127.0.0.1:8788",
    indent + "}",
    indent + "handle_path /social/* {",
    indent + "\troot * /srv/selahmc/social",
    indent + "\ttry_files {path} /index.html",
    indent + "\tfile_server",
    indent + "}",
    indent + end,
]

lines[site_start + 1:site_start + 1] = block
output = "\n".join(lines) + "\n"
target.write_text(output)
PY

sudo cp "$tmp" "$CADDYFILE"
rm -f "$tmp"

if ! sudo caddy validate --config "$CADDYFILE" --adapter caddyfile; then
  echo "Caddy validation failed. Restoring $BACKUP" >&2
  sudo cp -a "$BACKUP" "$CADDYFILE"
  exit 1
fi

sudo systemctl reload caddy

echo "Caddy routes installed:"
echo "  https://selahmc.me/social/"
echo "  https://selahmc.me/auth-api/health"
echo "Backup: $BACKUP"
