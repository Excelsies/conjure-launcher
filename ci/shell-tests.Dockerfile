# GNOME Shell 50 for the headless integration tests (tests/shell). Used by CI and locally:
#   pnpm test:shell            (tools/container-shell-test.sh)
# The source arrives as a tar stream on stdin, so no host directory permissions are involved.
FROM ubuntu:26.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      gnome-shell gnome-shell-common dbus dbus-user-session libglib2.0-bin \
      python3 python3-dbusmock coreutils procps mesa-vulkan-drivers libgl1-mesa-dri fonts-cantarell \
 && rm -rf /var/lib/apt/lists/*
# The screencast service needs PipeWire, which the container lacks; activating it can hang the
# shell's startup (measured: "Error connecting to the screencast service", then no
# startup-complete). Screencasting is not under test, so remove its activation file.
RUN rm -f /usr/share/dbus-1/services/org.gnome.Shell.Screencast.service
# A uid with no processes on a typical host, so per-user kernel limits (inotify instances) are
# not shared with the developer's own desktop session.
RUN useradd --create-home --uid 64000 tester
WORKDIR /home/tester
COPY shell-tests-entry.sh /usr/local/bin/shell-tests-entry
CMD ["/usr/local/bin/shell-tests-entry"]
