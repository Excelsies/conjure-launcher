#!/usr/bin/env bash
# Run the headless GNOME Shell integration tests (tests/shell) inside a GNOME Shell 50
# container, as a dedicated uid. Nothing runs in, or counts against, the developer's session:
# no display, no D-Bus, no settings, and no share of the user's per-uid kernel limits.
#
# usage: tools/container-shell-test.sh [tests/shell/<script>.js ...]   (default: all)
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
image=conjure-shell-tests
docker build -q -f "$root/ci/shell-tests.Dockerfile" -t "$image" "$root/ci" >/dev/null
tar -C "$root" -c --exclude=node_modules --exclude=.git --exclude=dist . |
    docker run --rm -i -e CONJURE_TESTS="$*" -e CONJURE_TEST_VERBOSE="${CONJURE_TEST_VERBOSE:-}" "$image"
