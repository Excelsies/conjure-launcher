#!/usr/bin/env bash
# Container entry point for ci/shell-tests.Dockerfile. GNOME Shell needs a system bus even
# headless; the container has none, so start a private one as root, then run the tests as an
# unprivileged user (a root session takes different code paths in the shell).
set -euo pipefail
mkdir -p /run/dbus
dbus-daemon --system --fork --nopidfile
# Mock the system services the shell calls at startup (as GNOME Shell's own CI does).
for template in logind upower; do
    python3 -m dbusmock --system --template "$template" >/tmp/dbusmock-$template.log 2>&1 &
done
for name in org.freedesktop.login1 org.freedesktop.UPower; do
    for _ in $(seq 1 50); do
        dbus-send --system --print-reply --dest=org.freedesktop.DBus / org.freedesktop.DBus.NameHasOwner "string:$name" 2>/dev/null \
            | grep -q 'boolean true' && break
        sleep 0.1
    done
done
src=/home/tester/w
mkdir -p "$src"
tar -x -C "$src"
chown -R tester: "$src"
exec runuser -u tester -- env XDG_RUNTIME_DIR=/tmp/runtime-tester CONJURE_TESTS="${CONJURE_TESTS:-}" CONJURE_TEST_VERBOSE="${CONJURE_TEST_VERBOSE:-}" bash -c '
    set -e
    mkdir -m 700 -p "$XDG_RUNTIME_DIR"
    cd "$1"
    gnome-shell --version
    if [[ -n "${CONJURE_TESTS:-}" ]]; then tools/shell-test.sh $CONJURE_TESTS; else tools/shell-test.sh tests/shell/*.js; fi
' _ "$src"
