#!/usr/bin/env bash
# Attach to the Tauri Android webview on a connected device.
#
#   ./scripts/android-devtools.sh          # forward DevTools, then open chrome://inspect
#   ./scripts/android-devtools.sh console  # just tail the JS console in this terminal
#
# The DevTools socket is named after the app's pid, so this has to be re-run
# after the app restarts.
set -euo pipefail

PACKAGE="${PACKAGE:-com.betaflight.app}"
PORT="${PORT:-9222}"

DEVICE_ARGS=()
if [ -n "${ANDROID_SERIAL:-}" ]; then
    DEVICE_ARGS=(-s "$ANDROID_SERIAL")
fi

if [ "${1:-}" = "console" ]; then
    echo "Tailing the webview console for $PACKAGE (Ctrl-C to stop)…" >&2
    exec adb "${DEVICE_ARGS[@]}" logcat -s Tauri/Console
fi

PID="$(adb "${DEVICE_ARGS[@]}" shell pidof "$PACKAGE" | tr -d '\r')"
if [ -z "$PID" ]; then
    echo "$PACKAGE is not running — start it first." >&2
    exit 1
fi

adb "${DEVICE_ARGS[@]}" forward --remove "tcp:$PORT" 2>/dev/null || true
adb "${DEVICE_ARGS[@]}" forward "tcp:$PORT" "localabstract:webview_devtools_remote_$PID" >/dev/null

echo "DevTools for $PACKAGE (pid $PID) is on http://localhost:$PORT"
echo "Open chrome://inspect#devices in Chrome and click 'inspect', or use the target list:"
curl -s "http://localhost:$PORT/json/list" | grep -E '"(title|url|webSocketDebuggerUrl)"' || true
