#!/usr/bin/env bash
# Look at the launcher without installing it or logging out: a nested GNOME Shell window (devkit)
# running the extension from this checkout, with its own D-Bus session and temporary XDG dirs (the
# real settings are never written), the machine's search providers off, and every action that could
# reach the real session replaced by a notice (tools/preview-script.js). Close the window to stop.
# CONJURE_PREVIEW_DRIVE=<driver.js> runs a scripted check instead and closes the window when it ends.
# tools/preview-check.js is one: CONJURE_PREVIEW_DRIVE=tools/preview-check.js tools/preview.sh
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
uuid="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$root/metadata.json")"
[[ -x /usr/libexec/mutter-devkit ]] || { echo "needs mutter-dev-bin (sudo apt install mutter-dev-bin)" >&2; exit 1; }
glib-compile-schemas --strict "$root/schemas"
# The nested shell resolves paths from its own working directory: pass the driver as an absolute path.
[[ -n "${CONJURE_PREVIEW_DRIVE:-}" ]] && export CONJURE_PREVIEW_DRIVE="$(realpath "$CONJURE_PREVIEW_DRIVE")"

# Before the XDG dirs are redirected (gsettings reads the real database through them): mirror the few real settings the launcher reacts to (read only; written only into the preview's own session):
# the shortcuts that decide who gets Super+Space, and the style and accent the System theme follows.
real() { gsettings get "$1" "$2" 2>/dev/null || echo "$3"; }
mirror=(
    org.gnome.shell.keybindings toggle-application-view "$(real org.gnome.shell.keybindings toggle-application-view "['<Super>a']")"
    org.gnome.desktop.wm.keybindings switch-input-source "$(real org.gnome.desktop.wm.keybindings switch-input-source "['<Super>space']")"
    org.gnome.desktop.wm.keybindings switch-input-source-backward "$(real org.gnome.desktop.wm.keybindings switch-input-source-backward "['<Shift><Super>space']")"
    org.gnome.desktop.interface color-scheme "$(real org.gnome.desktop.interface color-scheme "'default'")"
    org.gnome.desktop.interface accent-color "$(real org.gnome.desktop.interface accent-color "'blue'")"
)
real_apps="${XDG_DATA_HOME:-$HOME/.local/share}/applications"
sandbox="$(mktemp -d "${TMPDIR:-/var/tmp}/conjure-preview.XXXXXX")"
trap 'rm -rf "$sandbox"' EXIT
export XDG_CONFIG_HOME="$sandbox/config" XDG_DATA_HOME="$sandbox/data" XDG_STATE_HOME="$sandbox/state" XDG_CACHE_HOME="$sandbox/cache"
mkdir -p "$XDG_CONFIG_HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME" "$XDG_DATA_HOME/gnome-shell/extensions"
ln -s "$root" "$XDG_DATA_HOME/gnome-shell/extensions/$uuid"
# Your own installed apps, read-only, so the list looks like yours.
[[ -d "$real_apps" ]] && ln -s "$real_apps" "$XDG_DATA_HOME/applications"
export CONJURE_TEST_UUID="$uuid"
system_providers="$(grep -h '^DesktopId=' /usr/share/gnome-shell/search-providers/*.ini 2>/dev/null | cut -d= -f2 | sort -u | sed "s/.*/'&'/" | paste -sd, -)"

dbus-run-session -- bash -c '
    gsettings set org.gnome.shell enabled-extensions "[\"$1\"]"
    gsettings set org.gnome.shell disable-user-extensions false
    gsettings set org.gnome.shell welcome-dialog-last-shown-version "999"
    gsettings set org.gnome.desktop.search-providers disabled "[$3]"
    script="$2"
    shift 3
    while (( $# >= 3 )); do gsettings set "$1" "$2" "$3"; shift 3; done
    exec gnome-shell --devkit --wayland --virtual-monitor 1600x1000 --automation-script="$script"
' _ "$uuid" "$root/tools/preview-script.js" "$system_providers" "${mirror[@]}"
