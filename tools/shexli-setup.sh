#!/usr/bin/env bash
# Install shexli, a static analyzer for the GNOME Shell extension guidelines, into a per-user virtual
# environment (no admin rights needed). tools/package-check.sh runs it on the zip.
set -euo pipefail
version="0.2.1"
venv="${XDG_CACHE_HOME:-$HOME/.cache}/conjure-launcher/shexli-venv"
python3 -m venv "$venv"
"$venv/bin/pip" install -q --upgrade "shexli==$version"
echo "shexli $version installed: $venv/bin/shexli"
