# Architecture

Conjure Launcher is a GNOME Shell 50 extension (`conjure-launcher@excelsies`). It draws a keyboard-first
launcher panel as shell chrome, searches apps and other sources with fuzzy ranking, and is configured
through GSettings (`org.gnome.shell.extensions.conjure-launcher`) and a libadwaita preferences window.

## Platform

- Mutter does not implement `wlr-layer-shell`, so a standalone Wayland client cannot draw over the
  desktop. The launcher is therefore an extension.
- The panel is an actor added with `Main.layoutManager.addTopChrome`, not a window. Window managers and
  tiling extensions never see it, so it always floats.
- The extension has no dependency on any other extension and reads no other extension's settings.

## Components

| Area | Files |
|---|---|
| Entry point | `extension.js` (enable / disable, provider list) |
| Pure logic (no `gi://` imports; unit-tested under Node, enforced by ESLint) | `lib/`: `fzy`, `appScore`, `ranking`, `router`, `queryController`, `usage`, `views`, `navigation`, `lifecycle`, `takeover`, `placement`, `theme`, `palettes`, `calc`, `emoji`, `session`, `commands`, `commandsDoc`, `paste`, `overview`, `builtins`, `prefsHelpers` |
| Shell integration | `shell/launcher.js` (panel lifecycle, query wiring, theming), `shell/keybinding.js`, `shell/systemStyle.js`, `shell/usageFile.js`, `shell/settingsAdapters.js`, `shell/clipboard.js`, `shell/autoPaste.js`, `shell/dbusService.js` |
| UI | `ui/panel.js`, `stylesheet.css` (layout only; every colour is a theme token) |
| Providers | `providers/apps.js`, `calc.js`, `emoji.js`, `windows.js`, `session.js`, `searchProviders.js`, `commands.js`, `wallpaper.js`, `dmenu.js` |
| Settings | `schemas/*.gschema.xml`, `prefs.js`, `common/commandsStore.js` |
| dmenu client | `bin/conjure-dmenu` (GJS) |
| Data | `data/emoji.json` |

## Opening and closing

- **Shortcut.** `toggle-launcher` (default Super+Space) opens and closes the panel. GNOME's app-grid
  binding (`org.gnome.shell.keybindings toggle-application-view`) is changed only where it holds the
  same accelerator, and is given back on disable (invariant 1). Other bindings
  that hold the accelerator, such as GNOME's default input-source switch on Super+Space, are logged
  and left alone; the launcher does not receive the key until that binding is changed.
- **Monitor.** The `monitor` setting picks the focused window's monitor (default), the pointer's, or
  the primary. Within that monitor's work area the panel sits at the bottom centre, or centre or top
  (`position`), 24 px from the edge (`lib/placement.js`), so a bottom dock never covers it.
- **Modal grab.** While open, the panel holds a modal grab. Every close path (Esc, activating a
  result, clicking outside, focus loss, a monitor change, the overview opening, the screen locking,
  disable) goes through one idempotent `close()` (`lib/lifecycle.js`).
- **Animation.** Opening slides up 16 px and fades in over 200 ms. Closing pops the grab first, makes
  the panel non-reactive, then fades it out over 200 ms. Disable destroys at once.
- **Settings.** The gear at the end of the search field, or Ctrl+,, closes the launcher and opens the
  preferences window. It is hidden in dmenu mode.

## Searching

### Routing (`lib/router.js`)

1. In dmenu mode, the dmenu candidates are the only source.
2. Otherwise a query that starts with the provider prefix (`provider-prefix`, default `/`) followed
   by a trigger word goes to that provider; the longest matching trigger wins.
3. A bare `/` lists the providers; Enter on one fills in its prefix.
4. Anything else is a global search: apps, plus the providers that opt in to global search once the
   query is at least 2 characters long (the calculator also needs a digit and an operator, function
   or constant).

### Ranking

- Fuzzy matching is a port of fzy (`lib/fzy.js`): an exact match scores 1024, no match scores -inf.
- Apps (`lib/appScore.js`): a name match scores fzy x 5, plus 500 when the name starts with the
  query, plus 3000, so any name match outranks every other field. A localized or alternate name
  match adds 1500. Otherwise the best of generic name x 2, keywords x 0.8, categories x 0.3, app id
  x 1.5 and exec x 1. At most 50 app results.
- Usage (`lib/ranking.js`): with an empty query, results sort by launch count x 0.1; with a query the
  usage boost is capped at 0.5, so it only breaks near ties. The calculator always scores 10000.
  GNOME search-provider results score 1000, minus 20 per provider position and 1 per result
  position.
- Results merge with a stable sort, so ties keep each provider's own order.

### Views (`lib/views.js`)

- Tabs: Recent, Pinned, All and Categories, with `default-view` first. Ctrl+Tab and Ctrl+Shift+Tab
  cycle them, Ctrl+1..4 select one.
- Typing switches to All; the views shape only the empty-query screen.
- All: pinned apps first in pinned order, then the rest by score. Pinned: only pinned apps. Recent:
  launched apps, newest first (the last 20). Categories: a chip row of the non-empty categories;
  an app's category is the first of its desktop categories that maps to one of nine groups.
- Pins of apps that are no longer installed are skipped, not deleted, so a reinstalled app keeps its pin.
- List or grid (5 columns, `app-grid`, Ctrl+G). Result sets that mix in other providers fall back to
  the list.
- Shift+Enter or right-click opens an actions menu in place of the results: Open, New Window, the
  app's own desktop actions, and Pin / Unpin. Esc returns to the results.

## Providers

| Trigger | Provider | Behaviour |
|---|---|---|
| (global) | Apps | `Shell.AppSystem`. Enter calls `app.activate()`: it focuses a running app or starts it. Ctrl+Enter or middle-click opens a new window |
| `/calc` (also global) | Calculator | A recursive-descent parser over a fixed table of operators, functions and constants (`lib/calc.js`). No `eval`, no `Function`, no property lookups; input over 200 characters or nested deeper than 64 is refused. Enter copies the result |
| `/emo` | Emoji | Substring scoring over names and keywords (`data/emoji.json`), at most 100 results. Enter copies |
| `/win` | Windows | Open windows, most recently used first. Enter switches to the window |
| `/session` | Session | Lock, log out, suspend, switch user, restart, power off, through GNOME's `SystemActions` (GNOME's own confirmation dialogs apply) |
| (global) | GNOME search providers | Loaded through the shell's `remoteSearch.js`, so GNOME Settings → Search (enabled list and order) applies. `excluded-search-providers` removes more (default: GNOME Calculator). At most 5 results each, from 2 characters |
| `/wall` | Wallpapers | Images (jpg, jpeg, png, webp, svg, avif, jxl) in `wallpaper-dir` (default `~/Pictures/Wallpapers`), up to 4 folders deep and 5000 files, listed once per open, at most 50 shown. Enter sets `picture-uri` and `picture-uri-dark` |
| `/<prefix>` | Command entries | The user's own entries from `commands.json` (below) |

### Command entries

- Defined in `~/.config/conjure-launcher/commands.json`, edited by hand or in Settings → Commands; both
  use the same file and the same validation (`lib/commands.js`, `lib/builtins.js`). The README has
  the format.
- Each entry is validated on its own. An invalid one is skipped and named in the log and in
  Settings; a prefix that collides with a built-in or another entry is invalid.
- `command` runs at most once per open, under `setsid`, with a 2 s limit, 1 MiB of output and 500
  candidates. A timeout, or closing the launcher, kills its whole process group.
- `exec` runs as `sh -c <exec> conjure-launcher <selection> <query>`. `{selection}` and `{query}`
  are rewritten to `"$1"` and `"$2"` before `sh` sees them, so candidate text is always an argument
  and never shell syntax. With no `exec`, Enter copies the selection.
- `freeform` offers the typed text itself, listed after the real matches.
- The file is watched and reloaded 200 ms after it changes. An unreadable or invalid file keeps
  the last good entries and logs the path and error. A missing file means no entries.
- The Settings editor never overwrites a file that does not parse, or one that changed on disk since
  it was read (etag); it keeps keys it does not know; writes are atomic (`common/commandsStore.js`).

### dmenu mode

- While enabled, the extension owns `org.excelsies.ConjureLauncher` on the session bus, with
  `Dmenu(prompt s, candidates as) -> (selection s, picked b)`.
- The launcher opens scoped to the candidates: no tabs, the prompt as the hint, at most 500 shown.
  Enter returns the chosen line; with no match, the typed text.
- Every pending call is answered exactly once: Esc and the other closes return `picked=false`,
  disable returns an error, and a newer call cancels the older one.
- `conjure-dmenu [-p prompt]` reads candidates from stdin and prints the choice. It exits 0 on a
  pick, 1 on cancel and 2 when the extension is not running.
- Any process of the same user on the session bus can open a menu and read the choice. That is the
  ordinary trust boundary between a user's own processes; it cannot run commands.

## Auto-paste

Off by default (`auto-paste`). When on, a result that copies (calculator, emoji, command entries
without `exec`) is also pasted into the window that was focused before the launcher opened: Ctrl+Shift+V
for terminals, Ctrl+V otherwise. After closing, the launcher waits up to 300 ms for focus to return to
that window. If focus lands anywhere else, or nothing was focused, nothing is typed
(`lib/paste.js`, `shell/autoPaste.js`).

## Theming

Every colour, corner radius and the font come from theme tokens, which are GSettings keys
(`theme-*`). The public contract is in `docs/theming.md`.

- **Following the system.** With every colour key empty (the default), the tokens resolve to Ubuntu
  Light or Ubuntu Dark from the system's style (`color-scheme`), with the accent colour GNOME Shell
  draws. `shell/systemStyle.js` reads `St.Settings` and the stage's theme context, and the panel
  restyles live on `notify::color-scheme` and `notify::accent-color`. Text on the accent is the
  shell's accent text colour when it reaches 4.5:1, otherwise white, otherwise black.
- **Presets** (`lib/palettes.js`): Ubuntu Light and Dark (from the Yaru shell theme), ten palettes from
  Noctalia and ten darker ones from the Gogh collection. Each is checked against a contrast floor as
  the launcher draws it: 4.5:1 for text on the accent, the background, the field and the hover fill,
  and 3:1 for secondary text.
- **Settings → Appearance** lists one "Ubuntu" entry. "Use Ubuntu's style and accent colour" (on by
  default) keeps the keys empty; turning it off writes Light or Dark as fixed values with Ubuntu
  orange (`#d34615`). Any other theme writes its values. Any key edited by hand shows "Custom".
- Tokens are applied as inline styles (`lib/theme.js` `styles()`), so a change never reloads the
  stylesheet.

## Settings

Schema `org.gnome.shell.extensions.conjure-launcher`. Theme keys are in `docs/theming.md`.

| Key | Default | Meaning |
|---|---|---|
| `toggle-launcher` | `['<Super>space']` | Open or close the launcher |
| `position` | `bottom` | `bottom`, `center` or `top` of the monitor |
| `monitor` | `focused` | `focused`, `pointer` or `primary` |
| `width` | `760` | Panel width, 560-1100 logical pixels (the height is 620) |
| `search-position` | `bottom` | Search field at the `bottom` or `top` of the panel |
| `default-view` | `recent` | `recent`, `pinned`, `all` or `categories` |
| `app-grid` | `false` | Grid instead of list |
| `pinned` | `[]` | Pinned app ids, in order |
| `provider-prefix` | `/` | Character that starts a trigger |
| `excluded-search-providers` | `['org.gnome.Calculator.desktop']` | GNOME search providers left out |
| `wallpaper-dir` | `''` | `/wall` folder; empty means `<Pictures>/Wallpapers` |
| `auto-paste` | `false` | Paste copied results into the previous window |
| `track-usage`, `sort-by-usage` | `true` | Record launches; boost frequent results |
| `debug` | `false` | Log per-query provider timings |
| `saved-toggle-application-view`, `has-saved-toggle-application-view` | | Internal: GNOME's app-grid binding while the launcher holds its shortcut |
| `history-clear-request` | `0` | Internal: Settings writes a new value to ask the extension to clear the history |

The schema's ranges and choices refuse out-of-range values, and the panel is always clamped to fit
inside the monitor's work area.

## Files

| File | Written by | Notes |
|---|---|---|
| `~/.local/state/conjure-launcher/usage.json` | the extension, on launch | Launch counts and the recent list. Written to a temporary file and renamed; saves are serialised |
| `~/.config/conjure-launcher/commands.json` | the user, or Settings → Commands | Command entries. The folder is created at enable so the file watch works at once |

## Invariants

Code comments and tests refer to these by number.

| # | Invariant | Enforced in |
|---|---|---|
| 1 | The user's app-grid binding is always recoverable: only colliding accelerators are taken, the original is saved first, restored on disable only if GNOME's key still holds what was left there, and a copy left by a crashed session is kept, not overwritten | `lib/takeover.js`, `shell/keybinding.js` |
| 2 | The modal grab is always released, on every close path, exactly once | `lib/lifecycle.js` |
| 3 | Nothing untrusted is executed: commands come only from the user's own file, candidate text is passed as arguments, and calculator input never reaches a shell or `eval` | `providers/commands.js`, `lib/calc.js` |
| 4 | A slow provider never blocks typing: queries carry a generation number and late results are dropped | `lib/queryController.js` |
| 5 | Auto-paste keystrokes go only to the window that was focused before opening | `lib/paste.js`, `shell/autoPaste.js` |
| 6 | Every dmenu call is answered exactly once | `shell/launcher.js`, `shell/dbusService.js` |

## Failure handling

| Event | Result |
|---|---|
| `usage.json` missing | History starts empty |
| `usage.json` does not parse | Moved aside as `usage.json.corrupt-<time>`; history starts empty |
| `usage.json` cannot be read (permissions, I/O) | History starts empty and nothing is written this session, so an intact file is never replaced |
| `usage.json` write fails | Logged; the data stays in memory |
| A GNOME search provider is slow | Its results are dropped for that query after 500 ms; named in the log once per session (every time with `debug`) |
| A command entry times out | Its process group is killed; no candidates from it |
| An app fails to launch | A notification names the app |
| A theme key is not a colour | Logged with the key name; that token uses its default |
| The system accent cannot be read | Logged once; Ubuntu orange is used |

## Time limits

| Limit | Value |
|---|---|
| Search-provider debounce, then timeout | 80 ms, then 500 ms (worst case 580 ms from the keystroke; app results appear at once) |
| Command entry run | 2 s |
| `commands.json` reload after a change | 200 ms |
| Open and close animations | 200 ms |
| Auto-paste wait for focus | 300 ms |

## Compared with Noctalia

The launcher follows Noctalia's launcher (layout, sizes, prefixes, fzy scoring weights, views and the
default Noctalia palette), with these differences:

- Enter focuses a running app instead of always starting a new instance, as GNOME's app grid does.
- Space types a space; it never activates.
- Tab and Shift+Tab move the selection.
- A command entry's freeform text is listed after real matches, so Enter runs the visible match.
- No avatar, power button or toolbar buttons; session actions are the `/session` provider.
- Not ported: Luau plugins, Noctalia's panel provider, and libqalculate (a built-in calculator is
  used instead).

## Testing

| Suite | Command | Covers |
|---|---|---|
| Unit | `pnpm test` | Everything in `lib/` under Node, including fzy parity with upstream cases and every palette against the contrast floor |
| GJS | `pnpm run test:gjs` | `common/commandsStore.js` against the real filesystem |
| Shell | `pnpm test:shell` | Headless GNOME Shell scripts in `tests/shell`, one sandboxed shell each |
| Packaging | `tools/ego-check.sh` | The zip's contents, the automatable extensions.gnome.org review rules, and smoke tests against the installed zip |

`pnpm run check` runs lint, unit, GJS and schema validation, and is what CI runs.

The shell runner (`tools/shell-test.sh`) gives each script its own D-Bus session, temporary XDG
directories, fixture apps and a fixture search provider. It disables the machine's own search
providers and stubs session actions, because the sandbox shares the real system bus. It fails a
script that logs GLib or GJS criticals, even when every check passed (`tools/lib/criticals.js`). The one
exemption is GNOME Shell's own UI touched after disposal while the shell shuts down: an "already
disposed" critical after the script's last check whose whole stack is in the shell's own code. Optional `<script>.setup.sh`
and `<script>.monitors` files seed settings and set the virtual monitors.

`tools/screenshots.sh` regenerates `docs/screenshots/` with the same runner, showing only a fixed set
of standard GNOME apps.

## Known limitations

- The dock's Show Apps button is not intercepted; only the shortcut is.
- For about 300 ms after enable, Mutter may still route the shortcut to the app grid, because the
  cleared binding applies asynchronously.
- If the shell dies after `toggle-launcher` was changed and before disable, the next restore
  compares against the new shortcut. The saved copy is kept, but the app-grid binding may need
  resetting by hand.
- A GNOME search provider that starts slowly (Nautilus on its first search after login, for example)
  may miss the first query and appear from the next keystroke.
- Auto-paste keystrokes are delivered asynchronously. A window that takes focus in the instant
  between the check and the delivery could receive them.
- The preferences window's widgets are not driven by automation (it is a separate GTK process). The
  logic behind them is unit-tested; the widgets are checked by screenshots.
- Settings previews the accent with libadwaita's colour, which can be a shade off from the one GNOME
  Shell draws.
- CI does not run the shell tests: hosted runners have GNOME 46, and the GNOME 50 container
  (`pnpm test:shell:container`, `ci/`) stalls on about half of its starts.
- Hot-plugging a monitor while the launcher is open is not tested headless; the close path is the
  same handler as the other monitor changes.
