#!/bin/bash
# Records one README clip: run.sh <scene> [dry|record]. See README.md in this folder.
set -u
M="$(cd "$(dirname "$0")" && pwd)"
REPO="$(cd "$M/../.." && pwd)"
scene="${1:?usage: run.sh <scene> [dry|record]}"
mode="${2:-record}"
export MEDIA_WORK="${MEDIA_WORK:-${XDG_CACHE_HOME:-$HOME/.cache}/dck-media}"
export MEDIA_HOME="${MEDIA_HOME:-/home/ana}"
export DCK_REPO="$REPO"
export ELECTRON="${ELECTRON:-$REPO/packages/shell/node_modules/electron/dist/electron}"
export SCREEN="${SCREEN:-1280x720}"
display_number="${MEDIA_DISPLAY:-61}"
W="$MEDIA_WORK"

[ -x "$ELECTRON" ] || { echo "Electron not found at $ELECTRON (set ELECTRON)" >&2; exit 1; }
[ -f "$REPO/packages/shell/dist/main.cjs" ] || { echo 'Build the app first: pnpm build' >&2; exit 1; }
mkdir -p "$W"
"$M/setup.sh" "$W" "$REPO" > /dev/null || exit 1
if [ -x "$M/prep-$scene.sh" ]; then "$M/prep-$scene.sh" > /dev/null || exit 1; fi
rm -rf "$W/state" "$MEDIA_HOME/.run"
mkdir -p "$W/state/cfg" "$W/state/state" "$W/state/keyring" "$W/logs" "$W/shots" "$W/raw" "$W/events" "$MEDIA_HOME/.run"
chmod 700 "$MEDIA_HOME/.run"
printf ghp_fixture > "$W/state/keyring/github.token"
printf jira-fixture > "$W/state/keyring/jira.token"

pids=()
node "$M/fake-github.cjs" 18877 > "$W/logs/fake-github.txt" 2>&1 &
pids+=($!)
node "$M/fake-jira.cjs" 18876 > "$W/logs/fake-jira.txt" 2>&1 &
pids+=($!)
Xvfb ":$display_number" -screen 0 "${SCREEN}x24" -nolisten tcp > "$W/logs/xvfb.txt" 2>&1 &
pids+=($!)
sleep 1
export DISPLAY=":$display_number"
xsetroot -cursor_name left_ptr
display -window root "$W/desktop.png" &
pids+=($!)
eval "$(dbus-launch --sh-syntax)"
pids+=("$DBUS_SESSION_BUS_PID")
(cd "$M" && "${MEDIA_DBUS_PYTHON:-python3}" notify-server.py "$W" "${SCREEN%x*}") > "$W/logs/notify.txt" 2>&1 &
pids+=($!)
sleep 1

SCENE="$scene" MODE="$mode" timeout 900 node "$M/drive.cjs" > "$W/logs/$scene-$mode.txt" 2>&1
status=$?
echo "drive exit $status"
pkill -f "$REPO/packages/shell/dist/daemon.cjs"
kill "${pids[@]}" 2> /dev/null
pkill -f "$W/notification-" 2> /dev/null
pkill -f "$W/pages/" 2> /dev/null
grep -h '^EVENT\|pageerror\|TIMEOUT\|FAIL' "$W/logs/$scene-$mode.txt" | cut -c1-300
exit $status
