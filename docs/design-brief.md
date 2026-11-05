# Design brief: Conjure Launcher

Status: APPROVED 2026-11-04 with decisions D1-D6, extended by D7-D17 (section 12 and the phase
specs). Phases 0-6 are built (version 0.6.0); the later sections are the records of each phase.

## 1. Goal and non-goals
- **Goal:** a GNOME Shell 50+ extension that provides a Noctalia-style launcher. It searches apps
  and other sources, uses fuzzy ranking, and is fully keyboard-driven. It opens on
  `Super+Space` in place of the "Show Apps" grid. The dock's Show Apps button is not intercepted
  (section 15).
- **Non-goals:**
  - a bar, dock or panel;
  - Noctalia's Luau plugins;
  - wallpaper-derived theming (matugen) in v1;
  - any dependency on, or integration with, another extension.
- **Tempting but separable:** a clipboard history provider, wallpaper theming, and the dmenu CLI.

## 2. Platform constraints
- Mutter does not implement `wlr-layer-shell`, so the launcher has to be a GNOME Shell extension, not
  a standalone Wayland client.
- The panel is shell chrome (an actor added with `Main.layoutManager.addTopChrome`), not a window,
  so window managers and tiling extensions never see it.
- It is self-contained, so it can be published on extensions.gnome.org and installed through
  Extension Manager.

## 3. Scope clusters
| Cluster | Files | Kind |
|---|---|---|
| Core logic (pure JS, no `gi://` imports, unit-tested under node) | `lib/*.js`: `fzy`, `router`, `ranking`, `appScore`, `usage`, `lifecycle`, `takeover`, `navigation`, `views`, `queryController`, `placement`, `theme`, `palettes`, `calc`, `emoji`, `session`, `commands`, `commandsDoc`, `paste`, `overview`, `builtins`, `prefsHelpers` | core |
| Shell integration | `extension.js`, `shell/launcher.js`, `shell/keybinding.js`, `shell/usageFile.js`, `shell/settingsAdapters.js`, `shell/clipboard.js`, `shell/autoPaste.js`, `shell/dbusService.js` | core |
| UI | `ui/panel.js`, `stylesheet.css` | core |
| Providers | `providers/apps.js` (core); `windows.js`, `session.js`, `calc.js`, `emoji.js`, `searchProviders.js` (GNOME SearchProvider2 bridge), `commands.js` (command entries), `dmenu.js`, `wallpaper.js` | apps core, rest separable |
| Settings | `schemas/*.gschema.xml`, `prefs.js` (libadwaita) | core |
| Tooling | `tools/*.sh` (install, devkit, preview, pack, ego-check, shell-test, container-shell-test, screenshots), ESLint config, `node --test`, `tests/gjs` | core |
| dmenu CLI over D-Bus | `bin/conjure-dmenu`, `shell/dbusService.js`, `providers/dmenu.js` | separable |

## 4. Invariants
1. **The user's `toggle-application-view` binding is always recoverable, and only what collides
   is taken.** (Revised 2026-11-04 after the headless test showed GNOME's default is `<Super>a`.)
   - On enable, only the accelerators in `toggle-application-view` that equal one of ours
     (`toggle-launcher`, compared after normalising modifier names) are removed. If none collide,
     nothing is saved or changed.
   - When something is removed, the original value is saved to our schema
     (`saved-toggle-application-view` plus a presence flag) before GNOME's key is written.
   - On disable, the saved value is put back only if GNOME's key still holds exactly what we left
     there. If the user changed it meanwhile, their value is kept. The copy is then erased.
   - If a saved copy exists at enable time and GNOME's key still holds what we would have left,
     the previous session died without disabling: the copy is kept, not overwritten.
   - Rebinding `toggle-launcher` restores and re-takes with the new accelerators.
   - Other bindings that hold one of our accelerators (for example GNOME's default
     `switch-input-source` on `<Super>space`) are logged with their schema and key and NOT changed;
     changing them is the user's decision.
   - Enforced in `lib/takeover.js` (pure, tested against fakes) and `shell/keybinding.js`.
2. **The modal grab is always released.** Every close path (Esc, activation, click outside, focus
   loss, monitor change, opening the overview, screen lock, `disable()`) goes through a single
   `close()` that pops the modal and is idempotent. Enforced in `lib/lifecycle.js`.
3. **Nothing that is untrusted is executed.**
   - Commands come only from the user's own settings.
   - Calculator input is never passed to a shell, and never to `eval` or `Function`: `lib/calc.js`
     parses it itself (D4; `qalc` is not used).
   - Command entries run only the user's own `exec` with the selection passed as separate
     arguments (section 18).
4. **A slow provider never blocks typing.** Providers are async and run under a per-query generation
   counter; results for an older generation are dropped.

## 5. State and ownership
| State | Writer | Readers | Reset |
|---|---|---|---|
| `saved-toggle-application-view` (gsettings) | `keybinding.js` on enable | `keybinding.js` on disable | erased after restore |
| Usage counts and recent list (`~/.local/state/conjure-launcher/usage.json`) | `usage.js` on activation | ranking, the Recent view | user "clear history" action; the recent list is capped at 20 per provider |
| Pinned list (gsettings `pinned`) | context menu, prefs | Pinned view | user |
| Query generation counter | panel | providers' callbacks | incremented on every input change and on close |
| Panel open flag and modal grab | `lib/lifecycle.js` via `shell/launcher.js` | keybinding toggle | `close()` |

## 6. Failure table
| Call | On error / empty | Side | Why |
|---|---|---|---|
| Reading `usage.json` | log a warning and start with empty usage, without overwriting the file until the first successful write | open | ranking still works; history is not destroyed |
| Writing `usage.json` | write to a temporary file and rename it; on error, log and keep the data in memory | open | a write that fails must not corrupt the file |
| A SearchProvider2 D-Bus call | 500ms timeout, then drop that provider's results for this query | open | the same as the GNOME overview |
| `app.launch` throws | show a notification naming the app id, and keep the launcher closed | n/a | it is visible to the user |

## 7. Races and ordering
- Typing while providers are still working is handled by the generation counter (invariant 4).
- Pressing the keybinding while the panel is closing: toggle reads the open flag, and `close()` sets
  it synchronously before the animation starts.
- Activation launches the app first and records usage second. A failed usage write never blocks the
  launch.

## 8. Time budget
- Input debounce: 0ms for the app provider (in memory) and 80ms for D-Bus and subprocess providers.
- Search-provider timeout: 500ms.
- Animations: 200ms open and close.
- Worst case from keystroke to complete results: 80 + 500 = 580ms. App results always appear within
  one frame.

## 9. Rollout
- Install with `tools/install.sh` into `~/.local/share/gnome-shell/extensions/<uuid>`. Development
  runs in `gnome-shell --devkit` (`tools/devkit.sh`, `tools/preview.sh`); the viewer comes from the
  `mutter-dev-bin` package (installed and verified in Phase 0). Automated tests run headless.
- Rollback: disable the extension. Invariant 1 restores `Super+Space`.
- A bad setting value (for example a width outside the allowed range) is clamped with a warning and
  must not throw in `enable()`.

## 10. Visibility
- Every log line is prefixed `[conjure-launcher]` and goes to the journal (`journalctl --user -f
  /usr/bin/gnome-shell`). Provider errors name the provider id and the query generation.
- A `debug` setting adds per-query timing for each provider.

## 11. Test plan
- `lib/` unit tests under `node --test`:
  - fzy parity against the upstream C, using a table of cases copied from the upstream fzy tests;
  - router prefix and longest-match routing;
  - ranking merge and usage boost;
  - usage file corruption and missing-file handling.
- Mutation probes for each invariant in section 4:
  - remove the "keep an existing saved copy" branch, and a test must fail;
  - skip the modal pop in one close path, and a test must fail;
  - remove the generation check, and a test must fail.
- Devkit session smoke checklist:
  - open, type, launch;
  - Esc, click outside, and lock while open;
  - disable while open;
  - check that `Super+Space` is restored after disable.
- CI: `.github/workflows` runs `pnpm run check` (ESLint, unit tests, GJS tests, schema). The shell
  tests run locally only (section 15, known gaps).

## 12. Decisions for the owner
Decisions ledger (answered 2026-11-04; do not re-ask):
- **[D1] Name/UUID.** DECIDED: display name "Conjure Launcher", UUID `conjure-launcher@excelsies`,
  settings schema `org.gnome.shell.extensions.conjure-launcher`. The UUID is permanent once
  installed or published.
- **[D2] Trigger.** DECIDED: take over `Super+Space` only. The overlay key (`Super` tap) is left
  alone.
- **[D3] Prefix style.** DECIDED: Noctalia's `/calc`, `/emo`, `/win`, `/session`. A bare `/` lists
  the providers.
- **[D4] Calculator.** DECIDED: a built-in JS evaluator. It parses the expression itself and never
  calls `eval` or `Function`. `qalc` is not used.
- **[D5] v1 provider set.** DECIDED: apps, windows, session actions, calculator, emoji, and the GNOME
  search-provider bridge. Commands/dmenu and wallpaper are deferred.
- **[D6] Theme.** DECIDED: the Noctalia palette by default, built so that another extension (for
  example a tiling extension) can override it smoothly. The design is in section 14.

- **[D7] Placement.** DECIDED (2026-11-04): bottom centre of the screen by default; `position`
  setting offers `center` and `top`. Centred horizontally on the monitor; anchored inside the
  work area so a bottom dock never covers it (`lib/placement.js`).
- **[D8] Tiling extensions.** DECIDED (2026-11-04): the launcher must stay floating under the
  owner's tiling extension. It is shell chrome, not a window, so no tiling extension can tile,
  move or resize it, and no float rule is needed (or possible: there is no window to match).
  Verified headless with the owner's tiling extension, Ubuntu Dock and DING enabled: geometry identical to the computed
  rectangle, unchanged after 1.5 s and across queries, and no window is created. The launcher
  contains no code that refers to any other extension.

## 14. Theming interface (D6)
- Every colour, radius and spacing value in the UI comes from a token. No colour is hard-coded in
  `stylesheet.css` or in the code. Tokens use Noctalia's role names: `primary`, `on-primary`,
  `surface`, `surface-container`, `on-surface`, `on-surface-variant`, `outline-variant`, `hover`,
  `on-hover`, plus `radius-scale` and `font-family`.
- **The public override API is our own gsettings schema.**
  - Each token is a key. An empty string means "use the built-in default", which is the Noctalia
    palette.
  - Any extension, script or `gsettings set` can write a key, and the panel restyles live on the
    `changed` signal, with no reload.
  - The launcher never reads another extension's settings. An integration writes our keys, so the
    dependency points one way and the launcher stays unaware of who is overriding it.
- An optional `theme-overrides-locked` key asks integrations to leave the tokens alone, so a palette
  the user chose by hand is not overwritten. It is **advisory**: GSettings cannot stop another
  process from writing a key, so the contract in `docs/theming.md` requires integrators to check it
  before writing.
- **Read failure:** an unparseable colour value is logged with the key name and that token falls
  back to its default. Other tokens are unaffected, and the panel still opens.
- The tokens are applied as an inline style on the panel root (St supports CSS on actors), so a
  token change never requires reloading the stylesheet.
- Documentation of the key list goes in `docs/theming.md`, which is the contract integrators code
  against. Renaming a key is a breaking change.

## 13. Work plan
| Phase | Deliverable | Rough size |
|---|---|---|
| 0 | Scaffold, schema, install/devkit scripts, lint and test runner | ~0.5 day |
| 1 | MVP: fzy, router, usage, apps provider, list UI, `Super+Space` takeover, modal and close paths, focused monitor | ~2-3 days |
| 2 | Noctalia look: nav tabs (Recent/Pinned/All/Categories), grid mode, context menu (actions, pin), animations, theme tokens, prefs | ~2-3 days |
| 3 | Providers: windows, session, calculator, emoji, search-provider bridge | ~2 days |
| 4 | Commands/dmenu entries, D-Bus dmenu CLI, wallpaper | ~1-2 days |
| 5 | Multi-monitor polish, auto-paste, extensions.gnome.org packaging | ~1 day |
| 6 | Commands editor in prefs (D13) | ~0.5 day |

All six phases are done. After them: the settings gear and Ctrl+, (D12, amended), colour themes
(D17) and the screenshot tool.

Estimated size: 3-4k lines of JS (actual after Phase 6: about 4.6k, excluding tests). That is less than Noctalia's 6.5k lines of C++, because GNOME
already provides app discovery and launching (`Shell.AppSystem`), search providers, and the
clipboard (`St.Clipboard`).

## 15. Phase 1 record (2026-11-04)

Deviations from Noctalia, chosen deliberately:
- **Enter follows GNOME, not Noctalia.** Enter focuses the app or starts it (`app.activate()`, as
  the app grid does). Ctrl+Enter or middle-click opens a new window when the app is already
  running. Noctalia always runs the desktop entry.
- **Space never activates.** Noctalia binds Space to "validate"; in a search field it has to type
  a space ("visual studio").
- **The search field is at the top** (Noctalia's code default is bottom; its example config says
  top). The setting is Phase 2.
- **Tab / Shift+Tab move the selection** (Noctalia cycles focus; Phase 1 has one focusable widget).

Seen in screenshots, deferred to Phase 2: the text cursor overlaps the first letter of the
placeholder text in the empty search field.

Known gaps:
- **CI does not run the shell integration tests.** GitHub's runner images ship GNOME 46, which
  cannot load a Shell 50 extension. A GNOME 50 container (`ci/shell-tests.Dockerfile`) runs them,
  but about half of the shell starts stall before `startup-complete` (measured 2 of 6 full runs
  passing). Already done: logind/UPower mocks, a system bus, removing the PipeWire-dependent
  screencast service, and reaping leftover helpers between scripts. The stall's root cause is not
  found. Until it is, run `pnpm test:shell` locally before pushing. **Accepted by the owner
  (2026-11-04): no CI job for the shell tests.**
- **The dock's "Show Apps" button is not intercepted.** Only Super+Space is taken over (D2).
- **Rebinding while crashed:** if the shell dies after `toggle-launcher` was rebound and before
  disable, the next restore compares against the new accelerators. The saved copy is still kept,
  so nothing is lost, but the app-grid key may need resetting by hand. Rare; not handled.
- **First ~300 ms after enable:** Mutter applies the cleared app-grid key asynchronously, so a
  press in that window can still open the app grid (measured headless). Not reachable by a person
  at login or unlock.

## 16. Phase 2 spec (2026-11-04)

Decisions (answered 2026-11-04; do not re-ask):
- **[D9] Search field position:** bottom by default (Noctalia's code default); `search-position`
  setting offers `top`.
- **[D10] Opening view:** Recent by default; `default-view` setting offers pinned, all, categories.
- **[D11] Layout:** list by default; grid (5 columns) via the `app-grid` setting or Ctrl+G.
- **[D12] Toolbar:** no avatar, no power button, no sort/grid/settings buttons. "We only want the
  launcher." Session actions stay a `/session` provider (Phase 3). Settings live in prefs.
  **Amended 2026-11-04 by the owner:** a small gear at the end of the search field (and Ctrl+,)
  closes the launcher and opens Settings. It is hidden in dmenu mode.

Behaviour (from Noctalia `applyActiveCategory` and `onInputChanged` @ 60861c9):
- Tabs: Recent / Pinned / All / Categories, with the default view first. Ctrl+Tab and
  Ctrl+Shift+Tab cycle them, Ctrl+1..4 select one, and clicking works too.
- Typing switches to All (Noctalia does the same): views shape only the empty-query screen.
- All (empty query): pinned apps first in pinned order, then the rest by score.
  Pinned: only pinned apps, in pinned order. Recent: launched apps, newest first.
  Categories: a chip row of the non-empty categories (Ctrl+Left/Right or click); an app's
  category is the first of its desktop Categories that maps to one of Noctalia's nine.
- Context menu (Shift+Enter or right-click) replaces the list inline. It offers Open, New Window
  (when the app supports it), the app's desktop actions, and Pin/Unpin. Esc returns to the
  results; it does not close the launcher.
- Grid: Up/Down move by a row, Left/Right by one.
- Animations: open slides up 16px and fades in (200 ms, ease-out-cubic). Close fades and slides
  down (200 ms, ease-in-quad). A view change slides the results by min(12% width, 72px) and
  fades from 0.78. All of these honour GNOME's enable-animations setting.

State:
| State | Writer | Readers | Reset |
|---|---|---|---|
| `pinned` (as) | context menu, prefs | views, ranking order | user (Unpin) |
| `app-grid` (b) | Ctrl+G, prefs | panel | user |
| `history-clear-request` (x, unix time) | prefs "Clear history" | extension clears the usage model and saves | each request is a new value, so nothing to reset |
| Active view and category | panel | panel | every open starts at `default-view` |

- Pinned ids that are no longer installed are skipped in every view, not deleted: an app that
  is reinstalled keeps its pin.

Invariant 2 extended: the close animation runs on actors that no longer hold the grab. The
grab is popped first and the actor is made non-reactive, then it animates out. `disable()`
destroys immediately, with no animation.

Phase 2 record (2026-11-04):
- Mutation probes: views M21-M23 and integration I5, I6 and I8 all killed.
  - I7 (disable fades instead of destroying) is an equivalent mutant. Fading panels are tracked
    and destroyed on disable, so no actor outlives `disable()` either way. The strict check
    ("no backdrop at all right after disable") is witnessed by I8.
- Visual review (headless screenshots) found and fixed two defects: an invisible action icon on
  the selected row, and tabs of unequal width.

## 17. Phase 3 record (2026-11-04)

Providers: `/calc` (also global for input with a digit and an operator, function or constant),
`/emo`, `/win`, `/session`, the `/` overview, and GNOME search providers in global search.

- **Calculator (D4):** a recursive-descent parser over a fixed table of functions and constants.
  It has no eval and no object lookups; input over 200 characters or nested deeper than 64 is
  rejected. Results score 10000 (always first).
- **Session actions:** run through GNOME's SystemActions, so GNOME's own confirmation dialogs
  apply.
  - Tests replace every activate* method with a recorder before anything runs, and abort if that
    fails. The headless sandbox shares the machine's system bus, so a real suspend or power off
    from a test would act on the real computer.
- **GNOME search providers:**
  - Loaded through the shell's remoteSearch.js, so GNOME's Search settings (enabled list and
    order) apply. `excluded-search-providers` (default: GNOME Calculator) removes more.
  - Budget: 80 ms debounce, then 500 ms for GetInitialResultSet and GetResultMetas together. A
    newer query cancels the D-Bus calls.
  - A late provider is named in the log once per session (every time with `debug`).
  - Score: 1000 minus 20 per provider position minus the result position. That is below app
    name matches and above fuzzy secondary matches; exact secondary matches can still outrank it
    (pinned by a test).
- **Test isolation:** every sandbox disables the machine's own search providers (starting
  Nautilus could start the file indexer on the real home folder). A fixture provider
  (tests/shell/fixtures) is D-Bus-activated on the sandbox bus. Its provider file sits in a
  sandbox dir prepended to XDG_DATA_DIRS, because the shell reads provider files from system data
  dirs only.

Known gap: the 500 ms budget is measured on the fixture (cold start included), not on real
providers. A provider that starts slowly (Nautilus on its first search after login, for
example) may miss the first query and appear from the next keystroke. The log line says so when
it happens. Raising the budget is a one-line change (TIMEOUT_MS) if this shows up in use.

Mutation probes: calculator M24-M27 (M25 survived first; the test it exposed was added), emoji
M28, session M29, and integration I9-I13 (debounce, timeout, exclusions, overview, grid
fallback). All are killed.

Visual review fixed two defects: symbolic result icons were invisible on the selected row, and
provider results without an icon of their own were blank (they now show the provider app's icon).

## 18. Phase 4 spec (2026-11-04)

Decisions (answered 2026-11-04; do not re-ask):
- **[D13] Command entries:** defined in `~/.config/conjure-launcher/commands.json` now. A prefs
  editor for the same file comes in a final Phase 6, so there is one source of truth.
- **[D14] dmenu CLI:** `bin/conjure-dmenu`; `tools/install.sh` symlinks it into `~/.local/bin`.
- **[D15] Wallpapers:** `/wall` reads `<XDG Pictures>/Wallpapers` recursively by default (setting
  `wallpaper-dir`) and sets both `picture-uri` and `picture-uri-dark`.
- **[D16] Auto-paste (Phase 5):** off by default.

### Command entries
- Each entry has `id`, `label`, `prefix` (the trigger word), `icon`, `command` (prints one
  candidate per line, with "title<TAB>subtitle" allowed), `exec` (with `{selection}` and
  `{query}`), `global` and `freeform`.
- Each entry is validated on its own; an invalid one is dropped and logged with its index and
  reason. A prefix that collides with a built-in or another entry is invalid.
- **Invariant 3 extended: candidate text never becomes shell syntax.** `exec` runs as
  `sh -c <exec> conjure-launcher <selection> <query>`. `{selection}` and `{query}` are rewritten
  to `"$1"` and `"$2"` before `sh` sees them, and the values travel as arguments, so a candidate
  such as `a; rm -rf ~` is a single argument. The command and exec strings come only from the
  user's own file.
- A missing `exec` copies the selection to the clipboard (Noctalia). `freeform` adds the typed
  text as a result (score 2048).
- `command` runs at most once per launcher open per entry, with a 2 s timeout (then it is
  killed), output capped at 1 MiB and 500 candidates. Closing the launcher kills a command
  still running.
- The file is watched and reloaded 200 ms after a change. An unreadable or invalid file keeps
  the last good entries and logs the path and error. A missing file means no entries.

### dmenu mode
- The extension owns `org.excelsies.ConjureLauncher` on the session bus while enabled, with
  `Dmenu(prompt s, candidates as) -> (selection s, picked b)`.
- The launcher opens scoped to the candidates: no tabs, the prompt as the hint, at most 500
  results. Enter returns the raw line; with no match, Enter returns the typed text.
- Every close path answers the pending call: Esc and the other closes return `picked=false`,
  `disable()` returns an error, and a newer Dmenu call cancels the older one. **A client is never
  left hanging.**
- `conjure-dmenu [-p prompt]` reads stdin and prints the choice. It exits 0 on a pick, 1 on
  cancel and 2 when the extension is not running.
- Trust: any process of the same user on the session bus can open a menu and read the choice.
  That is the same trust boundary as any other user process; it cannot run commands through this.

### Wallpapers
- `/wall` lists images (jpg, jpeg, png, webp, svg, avif, jxl) up to 4 directories deep and at
  most 5000 files, enumerated asynchronously once per open. Matching is fuzzy on "file name +
  folder", showing at most 50, with the image as the icon.

### State
| State | Writer | Readers | Reset |
|---|---|---|---|
| commands.json entries | user (file), Phase 6 prefs | command providers | reload on file change |
| Per-open candidate cache, running subprocess | command provider | provider | cleared on close; subprocess force-exited |
| Pending Dmenu invocation | D-Bus service | launcher close paths | answered exactly once, on any close or disable |
| `wallpaper-dir` (s) | prefs | wallpaper provider | user |

Phase 4 record (2026-11-04):
- **Command process groups:** commands run under `setsid`, and timeout and close kill the whole
  process group. Killing only the shell left its background children running (found while
  writing the close test).
- **Config folder:** `~/.config/conjure-launcher` is created at enable so the file watch works at
  once. Without the folder, GLib polls about every 4 s, which made reloads (and a first version of
  the test) slow and flaky.
- **Deviation from Noctalia:** a freeform entry's typed text is listed after real matches. In
  Noctalia it scores 2048, above every match, so Enter on "st" would run with "st" instead of the
  visible "staging".
- **Mutation probes:** M30 (values pasted into the script), M31 (no own session), M32 (prefix
  collisions), and I14-I18 (group kill, close hook, dmenu answered on close and on disable, last
  good entries kept) are all killed.
  - I15 first survived because its test was vacuous: a stale cache skipped the rerun, so there
    was nothing to kill. The test now asserts the command is running before Esc.

## 19. Phase 5 spec (2026-11-04)

- **Monitor:** a `monitor` setting chooses where the launcher opens: `focused` (default; the
  monitor of the focused window, as before), `pointer` or `primary`. Placement (D7) applies
  inside the chosen monitor's work area. A monitor change while open closes it (invariant 2).
- **Auto-paste (D16, off by default):** with `auto-paste` on, a result that copies (calculator,
  emoji, command entries without exec) is also pasted into the window that was focused before the
  launcher opened. Terminals get Ctrl+Shift+V; everything else gets Ctrl+V.
  - **Invariant 5: keystrokes only ever go to the window that was focused before opening.**
    After closing, the launcher waits up to 300 ms for focus to return to that window. If focus
    lands anywhere else, or there was no focused window, nothing is typed. This fails closed.
- **Packaging:**
  - `tools/pack.sh` builds the extensions.gnome.org zip with only runtime files.
  - `tools/ego-check.sh` checks the zip's contents and the review rules that can be automated:
    nothing created at import time, disable() undoes enable(), no compiled schemas, and licence
    compatibility.
  - Publishing (uploading to extensions.gnome.org with the owner's account) is the owner's step.
    `docs/publishing.md` is the checklist.

Phase 5 record (2026-11-04):
- **Monitor setting:** focused (default), pointer or primary, tested on two virtual monitors.
  Hot-plugging a monitor while open is not tested (virtual monitors cannot be added at run time
  headless); the `monitors-changed` close path is the same one-line handler as in Phase 1.
- **Auto-paste (invariant 5):** probes M33, M34 and I19-I21 are killed, including a bypass of the
  focus check at the call site.
  - Known limit: synthetic keys are delivered asynchronously. If another window takes focus in
    the instant between the check and the delivery, it could receive the paste. That window is
    microseconds and cannot be closed from an extension; auto-paste is off by default.
- **GLib criticals fixed:** three timers were removed after they had already fired, logging
  "Source ID … was not found" (search debounce, command timeout, auto-paste wait). Each now
  clears its id when it fires. The full suite logs 0 criticals, down from several per run.
- **Test timing under load:** with other headless shells on the machine (load average about
  10), a new test window took 3.4 s to get focus. Window tests now wait for focus (up to 10 s)
  instead of sleeping 300 ms.
- **Packaging:** `tools/ego-check.sh` runs 24 checks. The module-level check was calibrated:
  5/5 known positives caught, 0/3 negatives flagged. It also runs smoke tests (36 checks)
  against the installed zip. Version 0.5.0.

## 20. Phase 6 spec (2026-11-04): commands editor in prefs (D13)

- **One source of truth.** The editor reads and writes `~/.config/conjure-launcher/commands.json`,
  the file the extension watches. It validates with the extension's own code (lib/commands.js)
  against the same built-in prefixes (lib/builtins.js, which a test checks against the real
  provider list), so the editor and the extension cannot disagree.
- **Never destroys a hand-edited file:**
  - A file that does not parse is shown with its error and an Open file button; editing is
    disabled until it parses.
  - Saving uses the etag from the read. If the file changed on disk since, the save is refused,
    the editor reloads, and it says so.
  - Unknown keys in an entry and at the top level are kept when an entry is edited.
- Writes are atomic (g_file_replace writes a temporary file and renames it).

Phase 6 record (2026-11-04):
- **Commands page:** in Settings, with a list, add, edit, delete (with confirmation), Open file,
  and a live reload when the file changes on disk. Validation is shared with the extension
  (lib/commands.js plus lib/builtins.js; a shell test checks that builtins.js matches the
  registered providers).
- **Store (common/commandsStore.js):** atomic writes. A save is refused over an unparsed file,
  over a file changed since it was read (etag), and over a file created after a "missing" read.
  11 GJS checks run against the real filesystem; mutation probes M35-M38 are all killed.
- **Headless check:** the Commands page renders a valid entry, an exec-only entry and an invalid
  entry (shown in red with the extension's message). An unparseable file shows its error, Add
  is disabled, and the file is left byte-for-byte unchanged.
- **Known gap:** the edit dialog's widgets (typing into its fields, pressing Save) are not driven
  by automation, because the preferences run in a separate GTK process. What Save does, the
  document model and the store, is covered by the unit and GJS tests. "Open file" (Gtk.FileLauncher)
  is not exercised. Version 0.6.0.

- **[D17] Colour themes (owner request, 2026-11-04):** "include the one we have and add several more".
  Ten dark palettes from Noctalia's built-in set (Noctalia, Ayu, Catppuccin, Dracula, Eldritch, Gruvbox,
  Kanagawa, Nord, Rosé Pine, Tokyo Night), picked in Settings > Appearance. They write the same theme-*
  keys, and Noctalia writes empty values (the default).
  - Every shipped palette must pass a contrast floor as the launcher draws it, enforced by a test:
    4.5:1 for text on the accent, on the background and on the hover fill; 3:1 for secondary text.
  - Nord's hover text is corrected by the rule in lib/palettes.js.
  - Light variants are left out: as the launcher draws them, each fails a contrast pair. The owner
    confirmed (2026-11-04) that no light themes are wanted: "we have plenty".
  - **Amended (owner, 2026-11-04):** the dropdown shows swatches on every row (the separate preview
    row is gone). Ten darker themes are added from the Gogh collection as bundled with Ptyxis (MIT).
    They are mapped to the nine roles by one documented rule, and every one is darker than the
    original set's median background and passes the same contrast floor.

Post-phase record (2026-11-04):
- **Known gap, owner decision "wait and see if it happens live":** in the devkit preview (real GPU, real
  pointer, a tiling extension tiling the preview window), Clutter logged 5x "Can't update stage views actor unnamed
  [ClutterActor] ... needs an allocation" once, early in the session. It is cosmetic, and two headless
  hypotheses did not reproduce it (interaction paths, fast typing). An unverified candidate: a close
  for monitors-changed still fades out on a reconfigured stage. Revisit only if it shows up in the
  installed extension.
