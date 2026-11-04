#!/usr/bin/env bash
# Build the zip that extensions.gnome.org and `gnome-extensions install` accept, into dist/.
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$root/dist"
extra=()
for d in lib providers ui shell data bin; do
    [[ -d "$root/$d" ]] && [[ -n "$(ls -A "$root/$d")" ]] && extra+=(--extra-source="$root/$d")
done
# MIT requires the notices to travel with the code (fzy port, Noctalia data).
extra+=(--extra-source="$root/LICENSE" --extra-source="$root/THIRD_PARTY_NOTICES.md")
gnome-extensions pack "$root" --force --out-dir="$root/dist" \
    --schema="$root/schemas/org.gnome.shell.extensions.conjure-launcher.gschema.xml" \
    "${extra[@]}"
ls -l "$root/dist"
