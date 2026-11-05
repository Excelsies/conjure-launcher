#!/usr/bin/env bash
# Install Conjure Launcher for the current user by symlinking the checkout into the
# extensions directory, so edits take effect on the next shell start (log out/in on Wayland,
# or use tools/devkit.sh).
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
uuid="$(python3 -I -c 'import json,sys; print(json.load(open(sys.argv[1]))["uuid"])' "$root/metadata.json")"
dest="${XDG_DATA_HOME:-$HOME/.local/share}/gnome-shell/extensions/$uuid"

glib-compile-schemas --strict "$root/schemas"

if [[ -L "$dest" ]]; then
    current="$(readlink -f "$dest")"
    if [[ "$current" != "$root" ]]; then
        echo "error: $dest already links to $current, not $root" >&2
        exit 1
    fi
    echo "already installed: $dest -> $root"
elif [[ -e "$dest" ]]; then
    echo "error: $dest exists and is not a symlink; remove it first" >&2
    exit 1
else
    mkdir -p "$(dirname "$dest")"
    ln -s "$root" "$dest"
    echo "installed: $dest -> $root"
fi
# dmenu CLI on PATH. Only ever replaces our own symlink.
bindir="$HOME/.local/bin"
mkdir -p "$bindir"
if [[ -L "$bindir/conjure-dmenu" || ! -e "$bindir/conjure-dmenu" ]]; then
    ln -sfn "$root/bin/conjure-dmenu" "$bindir/conjure-dmenu"
    echo "installed: $bindir/conjure-dmenu"
else
    echo "warning: $bindir/conjure-dmenu exists and is not a symlink; left alone" >&2
fi
echo "enable with: gnome-extensions enable $uuid  (takes effect after the next shell start)"
