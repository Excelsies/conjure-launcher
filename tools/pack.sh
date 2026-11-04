#!/usr/bin/env bash
# Build the zip that extensions.gnome.org and `gnome-extensions install` accept, into dist/.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$root/dist"
extra=()
for d in lib providers ui shell; do
    [[ -d "$root/$d" ]] && [[ -n "$(ls -A "$root/$d")" ]] && extra+=(--extra-source="$root/$d")
done
gnome-extensions pack "$root" --force --out-dir="$root/dist" \
    --schema="$root/schemas/org.gnome.shell.extensions.conjure-launcher.gschema.xml" \
    "${extra[@]}"
ls -l "$root/dist"
