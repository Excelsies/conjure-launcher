# Theming contract

Conjure Launcher draws every colour, corner radius and font from a set of **theme tokens**. The
default palette is Noctalia's dark palette. Any program can override tokens by writing the
launcher's GSettings keys; the panel restyles live, with no reload.

This file is the public interface. Key names, types and meanings below are stable: renaming or
removing one is a breaking change.

Schema: `org.gnome.shell.extensions.conjure-launcher`
(path `/org/gnome/shell/extensions/conjure-launcher/`).

## Colour tokens

Type `s`. The empty string (the default) means "use the built-in value". Accepted formats:
`#rgb`, `#rrggbb`, `#rrggbbaa`. An unparseable value is logged with its key name and that one token
falls back to its default. The rest of the theme is unaffected.

| Key | Used for | Built-in default |
|---|---|---|
| `theme-primary` | Selected row fill, focus accents | `#fff59b` |
| `theme-on-primary` | Text and glyphs on `primary` | `#0e0e43` |
| `theme-surface` | Panel background | `#070722` |
| `theme-surface-container` | Search toolbar and card backgrounds | `#11112d` |
| `theme-on-surface` | Primary text | `#f3edf7` |
| `theme-on-surface-variant` | Subtitles, hints, inactive glyphs | `#7c80b4` |
| `theme-outline-variant` | 1px card and panel borders | `#21215f` |
| `theme-hover` | Hovered row fill | `#9bfece` |
| `theme-on-hover` | Text on `hover` | `#0e0e43` |

## Other tokens

| Key | Type | Meaning | Default |
|---|---|---|---|
| `theme-radius-scale` | `d` (0.0-3.0) | Multiplies every corner radius (base radii 3 / 6 / 9 / 12 px) | `1.0` |
| `theme-font-family` | `s` | Font family; empty uses the system interface font | `''` |
| `theme-overrides-locked` | `b` | The user asked integrations not to change tokens | `false` |

## Presets

Settings → Appearance offers 20 built-in themes (`lib/palettes.js`). Picking one writes the nine
colour keys above, exactly as an integration would. The default theme, Noctalia, writes empty
strings. The picker shows "Custom" when the keys match no preset. A preset is not a separate
setting, so an integration that writes the keys simply replaces it. The picker does not check
`theme-overrides-locked`: the lock is there to protect what the user chose, and the picker is the
user choosing.

## Rules for integrations

1. **Check the lock first.** If `theme-overrides-locked` is `true`, do not write any `theme-*` key.
   The lock is advisory; GSettings cannot enforce it.
2. **Write only what you own.** Set only the tokens you want to drive. Leave the others empty so the
   launcher's defaults apply.
3. **Reset by writing the empty string** (or `gsettings reset`), never by writing a copy of the
   default value; that way a future default change still reaches the user.
4. **Never write other keys** in this schema. They are the launcher's own state.

## Example

```sh
schema=org.gnome.shell.extensions.conjure-launcher
if [ "$(gsettings get $schema theme-overrides-locked)" = "false" ]; then
    gsettings set $schema theme-primary '#89b4fa'
    gsettings set $schema theme-radius-scale 1.5
fi
```

From GJS, the same applies through `new Gio.Settings({schema_id: 'org.gnome.shell.extensions.conjure-launcher'})`.
Look the schema up first with `Gio.SettingsSchemaSource.get_default().lookup(id, true)`, because the
launcher may not be installed.
