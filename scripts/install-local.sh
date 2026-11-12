#!/usr/bin/env bash
# Builds the .deb package and installs the new version on the system, for day-to-day use.
#
#   pnpm install:local            builds, installs and restarts the cockpit (asks before restarting)
#   pnpm install:local --no-restart   installs and lets the new version apply on the next launch
#   pnpm install:local --yes      restarts without asking
#   pnpm install:local --skip-build   installs the .deb already in release/
#
# Restarting closes the open tabs: the terminals belong to the app process.
set -euo pipefail

cd "$(dirname "$0")/.."

restart=ask
build=yes
for argument in "$@"; do
  case "$argument" in
    --no-restart) restart=no ;;
    --yes) restart=yes ;;
    --skip-build) build=no ;;
    *) echo "unknown option: $argument" >&2; exit 64 ;;
  esac
done

INSTALL_DIR=/opt/dev-cockpit
BINARY="$INSTALL_DIR/dev-cockpit"

if [ "$build" = yes ]; then
  echo "==> Building the package"
  pnpm package
fi

package=$(ls -t release/dev-cockpit_*.deb 2>/dev/null | head -n 1 || true)
[ -n "$package" ] || { echo "no .deb in release/: run without --skip-build" >&2; exit 1; }

# Only the installed app's processes: its binary path differs from one run from the repository
running() { pgrep -f "^$BINARY" >/dev/null 2>&1; }

was_running=no
if running; then was_running=yes; fi

echo "==> Installing $package"
# --reinstall allows replacing with a same-numbered version during development
sudo apt-get install -y --reinstall "./$package"

if [ "$was_running" = no ]; then
  echo "==> Installed. Open Dev Cockpit from the application menu or with your global key."
  exit 0
fi

if [ "$restart" = no ]; then
  echo "==> Installed. The running cockpit stays on the previous version until reopened."
  exit 0
fi

if [ "$restart" = ask ]; then
  echo "The cockpit is open. Restarting closes the tabs and the commands running in them."
  read -r -p "Restart now? [y/N] " answer
  case "$answer" in y|Y|yes|YES) ;; *) echo "==> Installed. The new version applies on the next launch."; exit 0 ;; esac
fi

echo "==> Restarting"
pkill -f "^$BINARY" || true
# Wait for the app and the daemon to finish, so the new one starts with the socket free
for _ in $(seq 1 30); do running || break; sleep 0.2; done
nohup "$BINARY" --no-sandbox >/dev/null 2>&1 &
disown
echo "==> Done."
