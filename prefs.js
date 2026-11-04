// Conjure Launcher preferences (libadwaita). Runs in the Extensions app's process, not in the
// shell: it only reads and writes this extension's GSettings. Launch history belongs to the
// shell process, so "Clear history" sends a request through a setting (history-clear-request).

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { COLOUR_TOKENS } from './lib/theme.js';
import { rgbaToHex, hexToRgba } from './lib/prefsHelpers.js';

const TOKEN_LABELS = {
    'primary': ['Accent', 'Selected row and active tab'],
    'on-primary': ['Text on accent', 'Text on the selected row'],
    'surface': ['Background', 'Panel background'],
    'surface-container': ['Search field background', 'Search field and chips'],
    'on-surface': ['Text', 'Titles and typed text'],
    'on-surface-variant': ['Secondary text', 'Descriptions, hints, inactive tabs'],
    'outline-variant': ['Borders', 'Panel and field outlines'],
    'hover': ['Hover', 'Row under the pointer'],
    'on-hover': ['Text on hover', 'Text on the row under the pointer'],
};

/** Keep a widget in sync with a setting for the widget's lifetime. */
function watch(settings, key, widget, sync) {
    sync();
    const id = settings.connect(`changed::${key}`, sync);
    widget.connect('destroy', () => settings.disconnect(id));
}

function comboRow(settings, key, title, subtitle, items) {
    const row = new Adw.ComboRow({ title, subtitle, model: Gtk.StringList.new(items.map(([, label]) => label)) });
    watch(settings, key, row, () => {
        const i = items.findIndex(([value]) => value === settings.get_string(key));
        if (i >= 0 && row.selected !== i)
            row.selected = i;
    });
    row.connect('notify::selected', () => {
        const value = items[row.selected]?.[0];
        if (value && value !== settings.get_string(key))
            settings.set_string(key, value);
    });
    return row;
}

function switchRow(settings, key, title, subtitle) {
    const row = new Adw.SwitchRow({ title, subtitle });
    settings.bind(key, row, 'active', 0 /* Gio.SettingsBindFlags.DEFAULT */);
    return row;
}

export default class ConjureLauncherPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;  // keep alive with the window
        window.set_default_size(640, 720);
        window.add(this._generalPage(settings));
        window.add(this._historyPage(settings));
        window.add(this._appearancePage(settings));
    }

    _generalPage(settings) {
        const page = new Adw.PreferencesPage({ title: 'General', icon_name: 'preferences-system-symbolic' });

        const placement = new Adw.PreferencesGroup({ title: 'Placement' });
        placement.add(comboRow(settings, 'position', 'Position on screen', 'Where the launcher opens',
            [['bottom', 'Bottom centre'], ['center', 'Centre'], ['top', 'Top centre']]));
        placement.add(comboRow(settings, 'monitor', 'Monitor', 'Which screen it opens on',
            [['focused', 'Focused window'], ['pointer', 'Pointer'], ['primary', 'Primary']]));
        placement.add(comboRow(settings, 'search-position', 'Search field', 'Inside the launcher',
            [['bottom', 'Bottom'], ['top', 'Top']]));
        const width = Adw.SpinRow.new_with_range(560, 1100, 10);
        width.title = 'Width';
        width.subtitle = 'In pixels';
        settings.bind('width', width, 'value', 0);
        placement.add(width);
        page.add(placement);

        const content = new Adw.PreferencesGroup({ title: 'Content' });
        content.add(comboRow(settings, 'default-view', 'Opening view', 'Shown before you type; its tab comes first',
            [['recent', 'Recent'], ['pinned', 'Pinned'], ['all', 'All'], ['categories', 'Categories']]));
        content.add(switchRow(settings, 'app-grid', 'Grid layout', 'Large icons in rows of five (Ctrl+G in the launcher)'));
        const prefix = new Adw.EntryRow({ title: 'Provider prefix (e.g. / for /calc)', show_apply_button: true });
        watch(settings, 'provider-prefix', prefix, () => {
            if (prefix.text !== settings.get_string('provider-prefix'))
                prefix.text = settings.get_string('provider-prefix');
        });
        prefix.connect('apply', () => settings.set_string('provider-prefix', prefix.text.trim()));
        content.add(prefix);
        content.add(switchRow(settings, 'auto-paste', 'Paste copied results',
            'After Enter copies a calculator result or emoji, paste it into the window you were in'));
        const walls = new Adw.EntryRow({ title: 'Wallpaper folder for /wall (empty: Pictures/Wallpapers)', show_apply_button: true });
        watch(settings, 'wallpaper-dir', walls, () => {
            if (walls.text !== settings.get_string('wallpaper-dir'))
                walls.text = settings.get_string('wallpaper-dir');
        });
        walls.connect('apply', () => settings.set_string('wallpaper-dir', walls.text.trim()));
        content.add(walls);
        page.add(content);

        const keys = new Adw.PreferencesGroup({
            title: 'Shortcut',
            description: 'GTK accelerator syntax, e.g. <Super>space. If the app grid used the same shortcut, it gets it back when you change this.',
        });
        const shortcut = new Adw.EntryRow({ title: 'Open the launcher', show_apply_button: true });
        watch(settings, 'toggle-launcher', shortcut, () => {
            const current = settings.get_strv('toggle-launcher')[0] ?? '';
            if (shortcut.text !== current)
                shortcut.text = current;
            shortcut.remove_css_class('error');
        });
        shortcut.connect('apply', () => {
            const [ok, key, mods] = Gtk.accelerator_parse(shortcut.text.trim());
            if (!ok || !key) {
                shortcut.add_css_class('error');
                return;
            }
            shortcut.remove_css_class('error');
            settings.set_strv('toggle-launcher', [Gtk.accelerator_name(key, mods)]);
        });
        keys.add(shortcut);
        page.add(keys);
        return page;
    }

    _historyPage(settings) {
        const page = new Adw.PreferencesPage({ title: 'History', icon_name: 'document-open-recent-symbolic' });
        const group = new Adw.PreferencesGroup({ title: 'Launch history', description: 'Kept on this computer only.' });
        group.add(switchRow(settings, 'track-usage', 'Remember launches', 'Needed for the Recent view'));
        group.add(switchRow(settings, 'sort-by-usage', 'Boost frequently used apps', 'Rank apps you open often higher'));
        const clear = new Adw.ActionRow({ title: 'Clear history', subtitle: 'Forget recent and frequently used apps' });
        const button = new Gtk.Button({ label: 'Clear', valign: Gtk.Align.CENTER, css_classes: ['destructive-action'] });
        button.connect('clicked', () => {
            // A new value each time (microseconds), so every click is a distinct request.
            settings.set_int64('history-clear-request', GLib.get_real_time());
            clear.subtitle = 'Cleared';
        });
        clear.add_suffix(button);
        group.add(clear);
        page.add(group);
        return page;
    }

    _appearancePage(settings) {
        const page = new Adw.PreferencesPage({ title: 'Appearance', icon_name: 'applications-graphics-symbolic' });

        const colours = new Adw.PreferencesGroup({
            title: 'Colours',
            description: 'Defaults are Noctalia\'s dark palette. Other extensions may change these unless locked below.',
        });
        for (const [token, fallback] of Object.entries(COLOUR_TOKENS)) {
            const key = `theme-${token}`;
            const [title, subtitle] = TOKEN_LABELS[token] ?? [token, ''];
            const row = new Adw.ActionRow({ title, subtitle });
            const picker = new Gtk.ColorDialogButton({ dialog: new Gtk.ColorDialog({ with_alpha: true }), valign: Gtk.Align.CENTER });
            const reset = new Gtk.Button({ icon_name: 'edit-undo-symbolic', valign: Gtk.Align.CENTER, tooltip_text: 'Use the default', css_classes: ['flat'] });
            let syncing = false;
            watch(settings, key, row, () => {
                syncing = true;
                picker.rgba = new Gdk.RGBA(hexToRgba(settings.get_string(key), fallback));
                reset.sensitive = settings.get_string(key) !== '';
                syncing = false;
            });
            picker.connect('notify::rgba', () => {
                if (syncing)
                    return;
                const hex = rgbaToHex(picker.rgba);
                // Picking the default colour stores "use the default", so later default changes apply.
                settings.set_string(key, hex === fallback ? '' : hex);
            });
            reset.connect('clicked', () => settings.reset(key));
            row.add_suffix(picker);
            row.add_suffix(reset);
            colours.add(row);
        }
        page.add(colours);

        const shape = new Adw.PreferencesGroup({ title: 'Shape and text' });
        const radius = Adw.SpinRow.new_with_range(0, 3, 0.1);
        radius.title = 'Corner roundness';
        radius.subtitle = '1 is the default';
        radius.digits = 1;
        settings.bind('theme-radius-scale', radius, 'value', 0);
        shape.add(radius);
        const font = new Adw.EntryRow({ title: 'Font family (empty: system font)', show_apply_button: true });
        watch(settings, 'theme-font-family', font, () => {
            if (font.text !== settings.get_string('theme-font-family'))
                font.text = settings.get_string('theme-font-family');
        });
        font.connect('apply', () => settings.set_string('theme-font-family', font.text.trim()));
        shape.add(font);
        page.add(shape);

        const lock = new Adw.PreferencesGroup();
        lock.add(switchRow(settings, 'theme-overrides-locked', 'Keep my colours',
            'Ask other extensions not to change the theme (they are expected to honour this)'));
        page.add(lock);
        return page;
    }
}
