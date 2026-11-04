#!/usr/bin/env bash
# Look at the launcher without installing it or logging out: a nested GNOME Shell window (devkit)
# running the extension from this checkout, with its own D-Bus session and temporary XDG dirs (the
# real settings are never written), the machine's search providers off, and every action that could
# reach the real session replaced by a notice (tools/preview-script.js). Close the window to stop.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
uuid="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$root/metadata.json")"
[[ -x /usr/libexec/mutter-devkit ]] || { echo "needs mutter-dev-bin (sudo apt install mutter-dev-bin)" >&2; exit 1; }
glib-compile-schemas --strict "$root/schemas"

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
    exec gnome-shell --devkit --wayland --virtual-monitor 1600x1000 --automation-script="$2"
' _ "$uuid" "$root/tools/preview-script.js" "$system_providers"
