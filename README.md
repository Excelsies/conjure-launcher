# Conjure Launcher

A keyboard-first application launcher for GNOME Shell 50+, modelled on the launcher in
[Noctalia](https://github.com/noctalia-dev/noctalia) (MIT). It is built as a GNOME Shell extension
because Mutter does not implement `wlr-layer-shell`, so a standalone Wayland launcher cannot draw
over the desktop. It replaces the "Show Apps" grid.

Status: design phase. See `docs/design-brief.md` (awaiting approval) and
`docs/noctalia-reference.md` (behaviour extracted from Noctalia).

## Using it

| Key | Action |
|---|---|
| Super+Space | Open or close the launcher |
| Type | Search all apps (fuzzy) |
| Up / Down, Tab / Shift+Tab, Ctrl+N / Ctrl+P | Move the selection (Left / Right too in the grid) |
| Page Up / Page Down | Move by a page |
| Enter | Open (or switch to) the app; Ctrl+Enter or middle-click opens a new window |
| Shift+Enter, right-click | Actions: open, new window, the app's own actions, pin / unpin |
| Ctrl+Tab / Ctrl+Shift+Tab, Ctrl+1..4 | Switch view: Recent, Pinned, All, Categories |
| Ctrl+Left / Ctrl+Right | Previous / next category (Categories view) |
| Ctrl+G | Toggle list / grid |
| Esc | Leave the actions menu, or close |

| Type | To get |
|---|---|
| `12*3`, `sqrt(2)*10` | The calculator result first (Enter copies it). `/calc …` for anything else |
| `/emo heart` | Emoji (Enter copies) |
| `/win term` | Open windows, most recent first (Enter switches) |
| `/session sleep` | Lock, log out, suspend, switch user, restart, power off |
| `/` | The list of providers; Enter fills in the prefix |
| anything else | Apps, plus results from GNOME's search providers (files, Settings, ...) as enabled in GNOME Settings > Search. GNOME Calculator's provider is left out (the launcher has its own) |

Calculator: `+ - * / % ^ !`, parentheses, `sqrt cbrt abs round floor ceil sin cos tan asin acos
atan ln log log2 exp pow min max`, `pi tau e`. Trigonometry is in radians.

Settings: `gnome-extensions prefs conjure-launcher@excelsies` (placement, search field position,
width, opening view, grid, shortcut, history, colours).

## Development

| Command | What it does |
|---|---|
| `pnpm install` | Install the lint and test tools (dev only; nothing ships to the shell). pnpm is pinned in `package.json`; `corepack enable` provides it |
| `pnpm run check` | ESLint, unit tests (`tests/**/*.test.js`) and schema validation; CI runs the same |
| `pnpm test:shell` | Headless GNOME Shell integration tests (`tests/shell`): no window, no input devices, its own D-Bus session and temporary XDG dirs. Runs under your uid, so it shares your per-user kernel limits (inotify) while it runs |
| `pnpm test:shell:container` | The same tests in a GNOME Shell 50 container under a separate uid. **Experimental:** about half of container starts stall before `startup-complete` (see `docs/design-brief.md`, known gaps) |
| `tools/install.sh` | Symlink this checkout into `~/.local/share/gnome-shell/extensions/` |
| `tools/devkit.sh` | Run a nested GNOME Shell with only this extension enabled, using a temporary settings database. Needs `sudo apt install mutter-dev-bin` |
| `tools/pack.sh` | Build the installable zip into `dist/` |

Code under `lib/` must not import `gi://` or Shell modules (ESLint enforces this), so it can be
unit-tested under Node.

Logs: `journalctl --user -f -o cat /usr/bin/gnome-shell | grep conjure-launcher`

Theming for integrations: see `docs/theming.md`.
