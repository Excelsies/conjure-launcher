#!/usr/bin/env bash
# Run a throwaway GNOME Shell session in a window, with only this extension enabled, so changes
# can be tested without logging out. Needs the mutter devkit viewer (package mutter-dev-bin).
#
# The nested session gets its own XDG_CONFIG_HOME, so its dconf database (enabled extensions,
# the Super+Space takeover, launcher settings) is a temporary copy and never touches the real
# session's settings. Extensions are still read from the real XDG_DATA_HOME.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
uuid="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$root/metadata.json")"

if [[ ! -x /usr/libexec/mutter-devkit ]]; then
    echo "error: /usr/libexec/mutter-devkit not found; install it with: sudo apt install mutter-dev-bin" >&2
    exit 1
fi
"$root/tools/install.sh" >/dev/null

sandbox="$(mktemp -d "${TMPDIR:-/var/tmp}/conjure-devkit.XXXXXX")"
# Helpers spawned by the nested session (mesa shader cache, gvfsd-metadata, ibus,
# portals) can outlive the shell for a few seconds and keep writing into the sandbox. Wait (up
# to 15 s) until no process still has the sandbox in its environment, then remove it. A cleanup
# problem is reported without replacing the script's own exit status.
sandbox_pids() {
    # The marker is set only on the nested session's command, never in this script's own
    # environment, so this pipeline does not match itself. -a: environ is NUL-separated, and
    # without it grep treats the file as binary and reports no match.
    grep -l -a -s -F -- "CONJURE_SANDBOX=$sandbox" /proc/[0-9]*/environ 2>/dev/null | cut -d/ -f3 || true
}
cleanup() {
    local rc=$? i pids
    for i in $(seq 1 30); do
        pids="$(sandbox_pids)"
        [[ -z "$pids" ]] && break
        sleep 0.5
    done
    [[ -n "$pids" ]] && echo "warning: sandbox processes still running: $(echo $pids)" >&2
    rm -rf "$sandbox" 2>/dev/null || { sleep 1; rm -rf "$sandbox" 2>/dev/null; } || true
    [[ -e "$sandbox" ]] && echo "warning: could not remove $sandbox" >&2
    exit "$rc"
}
trap cleanup EXIT
# Signals end the script without running EXIT on their own; route them through it.
trap 'exit 130' INT
trap 'exit 143' TERM HUP
export XDG_CONFIG_HOME="$sandbox/config"
mkdir -p "$XDG_CONFIG_HOME"
export SHELL_DEBUG=backtrace-warnings

env CONJURE_SANDBOX="$sandbox" dbus-run-session -- bash -c '
    set -euo pipefail
    gsettings set org.gnome.shell enabled-extensions "[\"$1\"]"
    gsettings set org.gnome.shell disable-user-extensions false
    gnome-shell --devkit --wayland
' _ "$uuid"
