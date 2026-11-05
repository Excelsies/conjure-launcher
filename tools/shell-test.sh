#!/usr/bin/env bash
# Run a GNOME Shell automation script (tests/shell/*.js) in a headless shell:
# no window, no input devices, its own D-Bus session, and temporary XDG config/data/state/cache
# directories, so neither the running desktop nor the real settings or launch history are
# touched. The extension is linked into the temporary data dir only.
#
# usage: tools/shell-test.sh tests/shell/<script>.js [more scripts...]
#        CONJURE_EXTRA_EXTENSIONS="uuid ..." also enables those extensions (user-installed ones are
#        linked into the sandbox read-only by path; they get sandboxed settings like everything else).
#        CONJURE_TEST_VERBOSE=1 prints each script's full shell log.
#        CONJURE_TEST_NO_FIXTURES=1, CONJURE_TEST_APP_ALLOWLIST="ids", CONJURE_TEST_EXTRA_ALLOWED="regex"
#        (extra log lines the criticals check accepts) are used by tools/screenshots.sh.
# exit:  0 when every script passed; non-zero otherwise.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
uuid="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$root/metadata.json")"
(( $# > 0 )) || { echo "usage: $0 tests/shell/<script>.js..." >&2; exit 2; }

glib-compile-schemas --strict "$root/schemas"

sandbox="$(mktemp -d "${TMPDIR:-/var/tmp}/conjure-shelltest.XXXXXX")"
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
# Wait for the nested session's helpers to exit; after the grace period, terminate the ones
# that remain. Only processes carrying this run's CONJURE_SANDBOX marker are ever signalled.
# Called between scripts too: leftover helpers otherwise pile up and exhaust per-user limits
# (measured: "Cannot initialize inotify: Too many open files" stalled the next shell's startup).
reap_sandbox() {
    local i pids
    for i in $(seq 1 20); do
        pids="$(sandbox_pids)"
        [[ -z "$pids" ]] && return 0
        sleep 0.5
    done
    echo "note: terminating leftover sandbox processes: $(echo $pids)" >&2
    kill -TERM $pids 2>/dev/null || true
    sleep 1
    pids="$(sandbox_pids)"
    [[ -n "$pids" ]] && kill -KILL $pids 2>/dev/null || true
    return 0
}
cleanup() {
    local rc=$?
    reap_sandbox
    rm -rf "$sandbox" 2>/dev/null || { sleep 1; rm -rf "$sandbox" 2>/dev/null; } || true
    [[ -e "$sandbox" ]] && echo "warning: could not remove $sandbox" >&2
    exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM HUP

real_ext_dir="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions"
export XDG_CONFIG_HOME="$sandbox/config" XDG_DATA_HOME="$sandbox/data"
export XDG_STATE_HOME="$sandbox/state" XDG_CACHE_HOME="$sandbox/cache"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME/gnome-shell/extensions"
if [[ -n "${CONJURE_TEST_ZIP:-}" ]]; then
    # Test the packaged extension instead of the checkout (tools/ego-check.sh).
    mkdir -p "$XDG_DATA_HOME/gnome-shell/extensions/$uuid"
    unzip -q "$CONJURE_TEST_ZIP" -d "$XDG_DATA_HOME/gnome-shell/extensions/$uuid"
    glib-compile-schemas "$XDG_DATA_HOME/gnome-shell/extensions/$uuid/schemas"
else
    ln -s "$root" "$XDG_DATA_HOME/gnome-shell/extensions/$uuid"
fi
enabled="'$uuid'"
for extra in ${CONJURE_EXTRA_EXTENSIONS:-}; do
    if [[ -d "$real_ext_dir/$extra" ]]; then
        ln -s "$real_ext_dir/$extra" "$XDG_DATA_HOME/gnome-shell/extensions/$extra"
    elif [[ ! -d "/usr/share/gnome-shell/extensions/$extra" ]]; then
        echo "error: extension $extra is not installed" >&2
        exit 2
    fi
    enabled="$enabled, '$extra'"
done
# Fixture apps give the tests known names to rank, independent of what the machine has installed.
# CONJURE_TEST_NO_FIXTURES=1 leaves them (and the fixture search provider) out, e.g. for screenshots.
mkdir -p "$XDG_DATA_HOME/applications"
[[ -z "${CONJURE_TEST_NO_FIXTURES:-}" ]] && cp "$root"/tests/shell/fixtures/applications/*.desktop "$XDG_DATA_HOME/applications/"
# CONJURE_TEST_APP_ALLOWLIST="a.desktop b.desktop": hide every other system app, in the sandbox only
# (an override with NoDisplay=true under the sandbox's XDG_DATA_HOME shadows the system entry).
if [[ -n "${CONJURE_TEST_APP_ALLOWLIST:-}" ]]; then
    IFS=: read -r -a data_dirs <<<"${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
    for dir in "${data_dirs[@]}"; do
        for f in "$dir"/applications/*.desktop; do
            [[ -e "$f" ]] || continue
            id="$(basename "$f")"
            [[ " $CONJURE_TEST_APP_ALLOWLIST " == *" $id "* ]] && continue
            printf '[Desktop Entry]\nType=Application\nName=hidden\nNoDisplay=true\nExec=true\n' > "$XDG_DATA_HOME/applications/$id"
        done
    done
fi
# A fixture GNOME search provider, D-Bus-activated on the sandbox bus only (skipped with no fixtures).
# The shell reads search-provider files from system data dirs only, so the fixture goes into a
# sandbox dir that is prepended to XDG_DATA_DIRS for the nested session.
mkdir -p "$sandbox/sysdata/gnome-shell/search-providers" "$XDG_DATA_HOME/dbus-1/services"
[[ -z "${CONJURE_TEST_NO_FIXTURES:-}" ]] && cp "$root"/tests/shell/fixtures/search-providers/*.ini "$sandbox/sysdata/gnome-shell/search-providers/"
export XDG_DATA_DIRS="$sandbox/sysdata:${XDG_DATA_DIRS:-/usr/local/share:/usr/share}"
printf '[D-BUS Service]\nName=org.conjure.TestSearch\nExec=/usr/bin/gjs -m %s\n' \
    "$root/tests/shell/fixtures/search-provider.js" > "$XDG_DATA_HOME/dbus-1/services/org.conjure.TestSearch.service"
# The machine's own search providers stay off in the sandbox: starting them would launch real
# apps and services (Nautilus can start the file indexer over the real home directory).
system_providers="$(grep -h '^DesktopId=' /usr/share/gnome-shell/search-providers/*.ini 2>/dev/null \
    | cut -d= -f2 | sort -u | sed "s/.*/'&'/" | paste -sd, -)"
export CONJURE_TEST_ROOT="$root" CONJURE_TEST_UUID="$uuid"

status=0
for script in "$@"; do
    script="$(realpath "$script")"
    log="$sandbox/$(basename "$script" .js).log"
    echo "== $(basename "$script")"
    set +e
    # Optional <script>.monitors lists virtual monitor sizes (default: one 1600x1000).
    monitors=(--virtual-monitor 1600x1000)
    if [[ -f "${script%.js}.monitors" ]]; then
        monitors=()
        for m in $(cat "${script%.js}.monitors"); do monitors+=(--virtual-monitor "$m"); done
    fi
    # Optional <script>.setup.sh seeds settings (inside the sandbox) before the shell starts.
    setup="${script%.js}.setup.sh"
    [[ -f "$setup" ]] || setup=""
    # Each script gets a fresh settings database.
    rm -rf "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" && mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME"
    timeout --kill-after=5 90 env CONJURE_SANDBOX="$sandbox" dbus-run-session -- bash -c '
        set -e
        gsettings set org.gnome.shell enabled-extensions "[$1]"
        gsettings set org.gnome.shell disable-user-extensions false
        gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
        gsettings set org.gnome.desktop.search-providers disabled "[$4]"
        # Do not set enable-animations=false here: measured, it stops the headless shell from
        # ever reaching startup-complete (0/3 starts, against 3/3 without it).
        if [[ -n "$3" ]]; then bash "$3"; fi
        script="$2"; shift 4
        exec gnome-shell --headless --wayland --no-x11 "$@" --automation-script="$script"
    ' _ "$enabled" "$script" "$setup" "$system_providers" "${monitors[@]}" >"$log" 2>&1
    rc=$?
    set -e
    reap_sandbox
    if [[ -n "${CONJURE_TEST_VERBOSE:-}" ]]; then cat "$log"; fi
    grep -E '(: |^)(ok|not ok|#) |\[conjure-launcher\]|JS ERROR|JS WARNING|Extension .*(error|Error)' "$log" || true
    # Runtime criticals (test-harness pattern 8): a green script must not hide errors the platform
    # only logs. Allowed, with reasons: our own "[conjure-launcher]" lines (tests inject failures on
    # purpose and the extension logs them) and the harness's own "Script failed" line.
    crit="$(grep -E 'CRITICAL \*\*|JS ERROR|JS WARNING|Failed to set text .* from markup' "$log" \
        | grep -v -E '\[conjure-launcher\]|Script failed' \
        | { if [[ -n "${CONJURE_TEST_EXTRA_ALLOWED:-}" ]]; then grep -v -E "$CONJURE_TEST_EXTRA_ALLOWED"; else cat; fi; } || true)"
    if [[ -n "$crit" ]]; then
        echo "FAILED ($(basename "$script")): runtime criticals in the shell log:"
        sed 's/^/    /' <<<"$crit" | head -n 20
        (( rc == 0 )) && rc=3
    fi
    if (( rc != 0 )); then
        echo "FAILED ($(basename "$script"), exit $rc); last lines of the shell log:"
        tail -n 25 "$log"
        status=1
    fi
done
exit "$status"
