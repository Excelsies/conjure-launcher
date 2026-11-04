# Design brief: Conjure Launcher

Status: APPROVED 2026-11-04 with decisions D1-D6 (section 12).

## 1. Goal and non-goals
- **Goal:** a GNOME Shell 50+ extension that provides a Noctalia-style launcher. It searches apps
  and other sources, uses fuzzy ranking, and is fully keyboard-driven. It replaces "Show Apps" on
  `Super+Space` and on the dock button.
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
| Core logic (pure JS, no `gi://` imports, unit-tested under node) | `lib/fzy.js`, `lib/router.js`, `lib/ranking.js`, `lib/usage.js` | core |
| Shell integration | `extension.js`, `shell/keybinding.js`, `shell/showApps.js`, `shell/modal.js` | core |
| UI | `ui/panel.js`, `ui/row.js`, `ui/grid.js`, `ui/nav.js`, `ui/contextMenu.js`, `stylesheet.css` | core |
| Providers | `providers/apps.js` (core); `windows.js`, `session.js`, `calc.js`, `emoji.js`, `searchProviders.js` (GNOME SearchProvider2 bridge), `commands.js` (dmenu-style entries), `wallpaper.js` | apps core, rest separable |
| Settings | `schemas/*.gschema.xml`, `prefs.js` (libadwaita) | core |
| Tooling | `tools/install.sh`, `tools/devkit.sh`, `tools/pack.sh`, ESLint config, `node --test` | core |
| dmenu CLI over D-Bus | `bin/conjure-launcher-dmenu`, D-Bus interface | separable |

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
   - Calculator input is never passed to a shell.
   - If `qalc` is used, it runs through `Gio.Subprocess` with an argv array and its file and command
     functions disabled, as Noctalia does.
4. **A slow provider never blocks typing.** Providers are async and run under a per-query generation
   counter; results for an older generation are dropped.

## 5. State and ownership
| State | Writer | Readers | Reset |
|---|---|---|---|
| `saved-toggle-application-view` (gsettings) | `keybinding.js` on enable | `keybinding.js` on disable | erased after restore |
| Usage counts and recent list (`~/.local/state/conjure-launcher/usage.json`) | `usage.js` on activation | ranking, the Recent view | user "clear history" action; the recent list is capped at 20 per provider |
| Pinned list (gsettings `pinned`) | context menu, prefs | Pinned view | user |
| Query generation counter | panel | providers' callbacks | incremented on every input change and on close |
| Panel open flag and modal grab | `modal.js` | keybinding toggle | `close()` |

## 6. Failure table
| Call | On error / empty | Side | Why |
|---|---|---|---|
| Reading `usage.json` | log a warning and start with empty usage, without overwriting the file until the first successful write | open | ranking still works; history is not destroyed |
| Writing `usage.json` | write to a temporary file and rename it; on error, log and keep the data in memory | open | a write that fails must not corrupt the file |
| A SearchProvider2 D-Bus call | 500ms timeout, then drop that provider's results for this query | open | the same as the GNOME overview |
| `qalc` spawn | hide the calculator result | open | it is advisory |
| `app.launch` throws | show a notification naming the app id, and keep the launcher closed | n/a | it is visible to the user |

## 7. Races and ordering
- Typing while providers are still working is handled by the generation counter (invariant 4).
- Pressing the keybinding while the panel is closing: toggle reads the open flag, and `close()` sets
  it synchronously before the animation starts.
- Activation launches the app first and records usage second. A failed usage write never blocks the
  launch.

## 8. Time budget
- Input debounce: 0ms for the app provider (in memory) and 80ms for D-Bus and subprocess providers.
- Search-provider timeout: 500ms. qalc timeout: 200ms, as in Noctalia.
- Animations: 200ms open and close.
- Worst case from keystroke to complete results: 80 + 500 = 580ms. App results always appear within
  one frame.

## 9. Rollout
- Install with `tools/install.sh` into `~/.local/share/gnome-shell/extensions/<uuid>`. Development
  runs in `gnome-shell --devkit`; that flag is present, but the mutter devkit viewer may need the
  `mutter-dev-bin` package. Verify this before Phase 0 ends.
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
- CI: a GitHub Actions job running ESLint and `node --test`, once there is a remote.

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

Estimated size: 3-4k lines of JS. That is less than Noctalia's 6.5k lines of C++, because GNOME
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

Known gaps:
- **CI does not run the shell integration tests.** GitHub's runner images ship GNOME 46, which
  cannot load a Shell 50 extension. A GNOME 50 container (`ci/shell-tests.Dockerfile`) runs them,
  but about half of the shell starts stall before `startup-complete` (measured 2 of 6 full runs
  passing). Already done: logind/UPower mocks, a system bus, removing the PipeWire-dependent
  screencast service, and reaping leftover helpers between scripts. The stall's root cause is not
  found. Until it is, run `pnpm test:shell` locally before pushing.
- **The dock's "Show Apps" button is not intercepted.** Only Super+Space is taken over (D2).
- **Rebinding while crashed:** if the shell dies after `toggle-launcher` was rebound and before
  disable, the next restore compares against the new accelerators. The saved copy is still kept,
  so nothing is lost, but the app-grid key may need resetting by hand. Rare; not handled.
- **First ~300 ms after enable:** Mutter applies the cleared app-grid key asynchronously, so a
  press in that window can still open the app grid (measured headless). Not reachable by a person
  at login or unlock.
