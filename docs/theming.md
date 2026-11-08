# Theming contract

Conjure Launcher draws every color, corner radius and font from a set of **theme tokens**. The
default is the System theme (colors from Ubuntu's Yaru theme), following the system: System Light or System Dark from the system's style,
with the shell's accent color. Any program can override tokens by writing the
launcher's GSettings keys; the panel restyles live, with no reload.

This file is the public interface. Key names, types and meanings below are stable: renaming or
removing one is a breaking change.

Schema: `org.gnome.shell.extensions.conjure-launcher`
(path `/org/gnome/shell/extensions/conjure-launcher/`).

## Color tokens

Type `s`. The empty string (the default) means "use the built-in value", which follows the system:
it is the System Light value, or the System Dark value when `org.gnome.desktop.interface color-scheme`
is `prefer-dark`, and `primary` is the accent color GNOME Shell draws (Settings → Appearance), live.
An empty key keeps following the system while others are set. Accepted formats:
`#rgb`, `#rrggbb`, `#rrggbbaa`. An unparseable value is logged with its key name and that one token
falls back to its default. The rest of the theme is unaffected.

| Key | Used for | Built-in default: Light / Dark |
|---|---|---|
| `theme-primary` | Selected row fill, focus accents | the system accent color |
| `theme-on-primary` | Text and glyphs on `primary` | the shell's accent text color if it reaches 4.5:1, else white, else black |
| `theme-surface` | Panel background | `#ffffff` / `#36363a` |
| `theme-surface-container` | Search toolbar and card backgrounds | `#ededed` / `#414144` |
| `theme-on-surface` | Primary text | `#222222` / `#ffffff` |
| `theme-on-surface-variant` | Subtitles, hints, inactive glyphs | `#7b7b7b` / `#9b9b9d` |
| `theme-outline-variant` | 1px card and panel borders | `#ededed` / `#424247` |
| `theme-hover` | Hovered row fill | `#e9e9e9` / `#4e4e52` |
| `theme-on-hover` | Text on `hover` | `#222222` / `#ffffff` |

## Other tokens

| Key | Type | Meaning | Default |
|---|---|---|---|
| `theme-radius-scale` | `d` (0.0-3.0) | Multiplies every corner radius (base radii 3 / 6 / 9 / 12 px) | `1.0` |
| `theme-font-family` | `s` | Font family; empty uses the system interface font | `''` |
| `theme-overrides-locked` | `b` | The user asked integrations not to change tokens ("Keep my colors") | `false` |
| `theme-override-source` | `s` | Display name of the application currently driving the tokens; empty when none | `''` |

## When an application overrides the theme

An integration that drives the tokens names itself in `theme-override-source`. While that key is set and
`theme-overrides-locked` is off, Settings → Appearance shows only a notice naming the application and the
"Keep my colors" switch.

While no application overrides the theme, the launcher keeps a copy of the user's tokens (the nine colors,
`theme-radius-scale` and `theme-font-family`) in its own key, `saved-user-theme`. Turning "Keep my colors" on
while an application overrides the theme clears `theme-override-source` and writes that copy back, so the
user gets their own theme again, and every appearance setting shows. This needs the launcher to be enabled;
with no copy saved yet, the current values stay.

## Presets

Settings → Appearance offers System plus 21 built-in themes (`prefs/palettes.js`). Picking one writes
the nine color keys above, exactly as an integration would. "System" with "Use the system style and
accent color" on (the default) writes empty strings, so it follows the system; with it off, System
Light or System Dark is written as fixed values with an orange accent (`#d34615`). The picker shows "Custom" when the
keys match no preset. A preset is not a separate
setting, so an integration that writes the keys simply replaces it. The picker does not check
`theme-overrides-locked`: the lock is there to protect what the user chose, and the picker is the
user choosing.

## Rules for integrations

1. **Check the lock first.** If `theme-overrides-locked` is `true`, do not write any `theme-*` key,
   except to reset your own `theme-override-source`. The lock is advisory; GSettings cannot enforce it.
2. **Name yourself before writing tokens.** Set `theme-override-source` to your application's display
   name first, then write the tokens, and reset it when you stop driving the theme. The launcher saves the
   user's theme only while this key is empty, so writing tokens before it would save yours as theirs.
   Launchers older than this key do not have it: check `has_key('theme-override-source')` on the schema
   before writing it.
3. **Write only what you own.** Set only the tokens you want to drive. Leave the others empty so the
   launcher's defaults apply.
4. **Reset by writing the empty string** (or `gsettings reset`), never by writing a copy of the
   default value; that way a future default change still reaches the user.
5. **Never write other keys** in this schema, `saved-user-theme` included. They are the launcher's own state.

## Example

```sh
schema=org.gnome.shell.extensions.conjure-launcher
if [ "$(gsettings get $schema theme-overrides-locked)" = "false" ]; then
    gsettings set $schema theme-override-source 'My Theme App'
    gsettings set $schema theme-primary '#89b4fa'
    gsettings set $schema theme-radius-scale 1.5
fi

# Stopping: hand the theme back.
gsettings reset $schema theme-override-source
```

From GJS, the same applies through `new Gio.Settings({schema_id: 'org.gnome.shell.extensions.conjure-launcher'})`.
Look the schema up first with `Gio.SettingsSchemaSource.get_default().lookup(id, true)`, because the
launcher may not be installed.
