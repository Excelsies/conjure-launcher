#!/usr/bin/env bash
# Install shexli, the static analyzer extensions.gnome.org runs on every upload, into a per-user virtual
# environment (no admin rights needed). tools/ego-check.sh runs it on the zip.
set -euo pipefail
version="0.2.1"
venv="${XDG_CACHE_HOME:-$HOME/.cache}/conjure-launcher/shexli-venv"
python3 -m venv "$venv"
"$venv/bin/pip" install -q --upgrade "shexli==$version"
echo "shexli $version installed: $venv/bin/shexli"
