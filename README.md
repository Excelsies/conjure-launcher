# Conjure Launcher

A keyboard-first application launcher for GNOME Shell 50+, modelled on the launcher in
[Noctalia](https://github.com/noctalia-dev/noctalia) (MIT). It is built as a GNOME Shell extension
because Mutter does not implement `wlr-layer-shell`, so a standalone Wayland launcher cannot draw
over the desktop. It replaces the "Show Apps" grid.

Status: design phase. See `docs/design-brief.md` (awaiting approval) and
`docs/noctalia-reference.md` (behaviour extracted from Noctalia).

## Development

| Command | What it does |
|---|---|
| `npm install` | Install the lint and test tools (dev only; nothing ships to the shell) |
| `npm run check` | ESLint, unit tests (`tests/**/*.test.js`) and schema validation; CI runs the same |
| `tools/install.sh` | Symlink this checkout into `~/.local/share/gnome-shell/extensions/` |
| `tools/devkit.sh` | Run a nested GNOME Shell with only this extension enabled, using a temporary settings database. Needs `sudo apt install mutter-dev-bin` |
| `tools/pack.sh` | Build the installable zip into `dist/` |

Code under `lib/` must not import `gi://` or Shell modules (ESLint enforces this), so it can be
unit-tested under Node.

Logs: `journalctl --user -f -o cat /usr/bin/gnome-shell | grep conjure-launcher`

Theming for integrations: see `docs/theming.md`.
