#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PAPER_DIR="${PAPER_DIR:-/home/ubuntu/SelahMC/paper}"
PLUGINS_DIR="$PAPER_DIR/plugins"
JAR_TARGET="$PLUGINS_DIR/SelahMCAccountSocial.jar"
SOCIAL_ROOT="${SOCIAL_ROOT:-/srv/selahmc/social}"
SERVICE="${PAPER_SERVICE:-selahmc-paper}"

if [[ ! -d "$PAPER_DIR" ]]; then
  echo "ERROR: Paper directory not found: $PAPER_DIR" >&2
  exit 1
fi

if ! command -v javac >/dev/null 2>&1; then
  echo "ERROR: Java 21 JDK is required." >&2
  exit 1
fi
export JAVA_HOME="$(dirname "$(dirname "$(readlink -f "$(command -v javac)")")")"
export PATH="$JAVA_HOME/bin:$PATH"

if [[ "$(javac -version 2>&1 | awk '{print $2}' | cut -d. -f1)" -lt 21 ]]; then
  echo "ERROR: Java 21 or newer is required. Current: $(javac -version 2>&1)" >&2
  exit 1
fi
if ! command -v mvn >/dev/null 2>&1; then
  echo "ERROR: Maven is required. Install it with: sudo apt-get install -y maven" >&2
  exit 1
fi

cd "$PROJECT_DIR"
echo "Building SelahMC Account + Social v3.0.0 with $JAVA_HOME..."
mvn -DskipTests clean package

BUILT_JAR="$PROJECT_DIR/target/SelahMCAccountSocial.jar"
if [[ ! -s "$BUILT_JAR" ]]; then
  echo "ERROR: Expected build output was not created: $BUILT_JAR" >&2
  exit 1
fi

sudo mkdir -p "$PLUGINS_DIR" "$SOCIAL_ROOT"
STAMP="$(date -u +%Y%m%d-%H%M%S)"
if [[ -f "$JAR_TARGET" ]]; then
  sudo cp -a "$JAR_TARGET" "${JAR_TARGET}.backup-${STAMP}"
fi
sudo install -m 0644 "$BUILT_JAR" "$JAR_TARGET"

sudo find "$SOCIAL_ROOT" -mindepth 1 -maxdepth 1 -exec rm -rf {} +
sudo cp -a "$PROJECT_DIR/web/." "$SOCIAL_ROOT/"
sudo find "$SOCIAL_ROOT" -type d -exec chmod 0755 {} +
sudo find "$SOCIAL_ROOT" -type f -exec chmod 0644 {} +

chmod +x "$PROJECT_DIR/configure-caddy.sh"
sudo "$PROJECT_DIR/configure-caddy.sh"

sudo systemctl restart "$SERVICE"

echo "Waiting for the account API to start..."
ready=0
for _ in $(seq 1 90); do
  if curl -fsS --max-time 2 http://127.0.0.1:8788/health >/tmp/selah-account-health.json 2>/dev/null; then
    ready=1
    break
  fi
  sleep 1
done

if [[ "$ready" -ne 1 ]]; then
  echo "ERROR: Account API did not become healthy within 90 seconds." >&2
  sudo journalctl -u "$SERVICE" --since "5 minutes ago" --no-pager -o cat | tail -220 >&2 || true
  exit 1
fi

cat /tmp/selah-account-health.json
echo

echo "SelahMC Account + Social installed."
echo "Website: https://selahmc.me/social/"
echo "Signup:  https://selahmc.me/signup"
echo "Login:   https://selahmc.me/login"
echo "Health:  https://selahmc.me/auth-api/health"
echo
echo "Players now create their account on the website, generate a one-time code, and use /login <code> in Minecraft."
