# Publishing to extensions.gnome.org

Uploading needs the maintainer's extensions.gnome.org account, so it is a manual step. Everything
before it is scripted.

1. `pnpm run check && pnpm test:shell` passes on a clean tree.
2. `tools/ego-check.sh` passes. It:
   - builds `dist/conjure-launcher@excelsies.shell-extension.zip`;
   - checks the zip has only runtime files plus `LICENSE` and `THIRD_PARTY_NOTICES.md`;
   - checks the automatable review rules: no legacy `imports.*`, no `eval`, no GNOME objects
     created at import time, no shell libraries in the preferences process, no extension
     constructor, required metadata, and an MIT licence;
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
   - **Session bus:** while enabled it owns `org.excelsies.ConjureLauncher` (dmenu mode) and
     releases it in `disable()`.
   - **Clipboard and keystrokes:** auto-paste is off by default. When on, it sends Ctrl+V (or
     Ctrl+Shift+V) only to the window that was focused before the launcher opened.
   - `bin/conjure-dmenu` is a GJS client script. Nothing in the zip is compiled.
