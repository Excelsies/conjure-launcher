#!/usr/bin/env bash
# Regenerate the README screenshots (docs/screenshots/*.png) in a headless GNOME Shell. The sandbox
# shows only a fixed set of standard GNOME apps (no test fixtures, nothing personal from this machine),
# the default theme unless a scene sets one, and launches nothing.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
out="$root/docs/screenshots"
mkdir -p "$out"
rm -f "$out"/*.png  # scenes that were renamed or dropped must not linger
export CONJURE_SHOT_DIR="$out"
export CONJURE_TEST_NO_FIXTURES=1
export CONJURE_TEST_APP_ALLOWLIST="firefox_firefox.desktop org.gnome.Nautilus.desktop org.gnome.Ptyxis.desktop org.gnome.TextEditor.desktop org.gnome.Settings.desktop org.gnome.Calculator.desktop org.gnome.Characters.desktop org.gnome.clocks.desktop org.gnome.baobab.desktop org.gnome.DiskUtility.desktop org.gnome.font-viewer.desktop org.gnome.Logs.desktop org.gnome.Loupe.desktop org.gnome.Papers.desktop org.gnome.Software.desktop com.mattjakeman.ExtensionManager.desktop org.gnome.seahorse.Application.desktop"
# Opening the theme list with a virtual pointer makes Clutter log crossing-event criticals for the
# fake device (headless only; never seen with a real mouse). Accept exactly those here.
export CONJURE_TEST_EXTRA_ALLOWED='clutter_event_(crossing_new|get_time|type|get_source_device|get_flags|get_device|get_coords)|Clutter-CRITICAL.*event != NULL'
"$root/tools/shell-test.sh" "$root/tools/screenshots-script.js"
ls -l "$out"
