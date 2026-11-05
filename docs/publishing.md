# Publishing to extensions.gnome.org

Uploading needs the maintainer's extensions.gnome.org account, so it is a manual step. Everything
before it is scripted.

1. `pnpm run check && pnpm test:shell` passes on a clean tree.
2. `tools/ego-check.sh` passes. It:
   - builds `dist/conjure-launcher@excelsies.shell-extension.zip`;
   - checks the zip has only runtime files plus `LICENSE` and `THIRD_PARTY_NOTICES.md`;
   - checks the automatable review rules: no legacy `imports.*`, no `eval`, no GNOME objects
     created at import time, no shell libraries in the preferences process, no extension
     constructor, required metadata, and an MIT license;
   - installs the **zip** into a headless sandbox and runs smoke tests against it.
3. Bump `version-name` in `metadata.json`. The site assigns the integer `version`.
4. Upload the zip at https://extensions.gnome.org/upload/.
5. Review notes worth adding to the upload, because reviewers will ask:
   - **Keybinding:** it changes `org.gnome.shell.keybindings toggle-application-view` only when
     that accelerator equals the launcher's own. It saves the original first and restores it on
     disable.
   - **Subprocesses:** the only ones run are the user's own commands from
     `~/.config/conjure-launcher/commands.json` (as `sh -c`; selection text is passed as
     arguments, never pasted into the script), `setsid`/`kill` to stop them, and `xdg`-style
     launches the user configured.
   - **Launches:** apps through `Shell.App`, GNOME Settings pages through their desktop entries
     (`/set`), and recent files through `Gio.AppInfo.launch_default_for_uri` (`/rec`). Closing a
     window from `/win` uses `Meta.Window.delete`, so the app's own "save changes?" prompt applies.
   - **Session bus:** while enabled it owns `org.excelsies.ConjureLauncher` (dmenu mode) and
     releases it in `disable()`.
   - **Clipboard and keystrokes:** auto-paste is off by default. When on, it sends Ctrl+V (or
     Ctrl+Shift+V) only to the window that was focused before the launcher opened.
   - **Clipboard history:** while enabled, it watches the clipboard (Mutter's selection
     `owner-changed`, not the primary selection) and keeps up to 200 text copies in memory only;
     nothing is written to disk, and `disable()` clears it. Copies that carry
     `x-kde-passwordManagerHint` (password managers' secret marker) are never read. It can be
     turned off in Settings.
   - **Files written:** `~/.local/state/conjure-launcher/usage.json` (launch history),
     `~/.config/conjure-launcher/` (created for the user's command entries), and thumbnails of
     wallpapers under `~/.cache/thumbnails/large/`, as the freedesktop thumbnail standard describes.
     It reads GTK's `~/.local/share/recently-used.xbel` for `/rec`.
   - `bin/conjure-dmenu` is a GJS client script. Nothing in the zip is compiled.
