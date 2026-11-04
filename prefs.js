// Conjure Launcher preferences (libadwaita). Runs in the Extensions app's process, not in the
// shell: it only reads and writes this extension's GSettings. Launch history belongs to the
// shell process, so "Clear history" sends a request through a setting (history-clear-request).

import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import { COLOUR_TOKENS } from './lib/theme.js';
import { rgbaToHex, hexToRgba } from './lib/prefsHelpers.js';
import { upsertEntry, removeEntry, errorsFor, suggestId } from './lib/commandsDoc.js';
import { CommandsStore } from './common/commandsStore.js';

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
        window.add(this._commandsPage(window));
        window.add(this._historyPage(settings));
        window.add(this._appearancePage(settings));
        // Test hook (headless screenshots): open on a given page.
        const page = GLib.getenv('CONJURE_PREFS_PAGE');
        if (page)
            window.set_visible_page_name(page);
    }

    _generalPage(settings) {
        const page = new Adw.PreferencesPage({ title: 'General', icon_name: 'preferences-system-symbolic', name: 'general' });

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

    /**
     * Commands editor (design brief section 20): edits ~/.config/conjure-launcher/commands.json,
     * the file the extension watches. Validation is the extension's own; a file that does not
     * parse, or that changed on disk since it was read, is never overwritten.
     */
    _commandsPage(window) {
        const page = new Adw.PreferencesPage({ title: 'Commands', icon_name: 'utilities-terminal-symbolic', name: 'commands' });
        const store = new CommandsStore();
        let doc = null;

        const head = new Adw.PreferencesGroup({
            title: 'Command entries',
            description: 'Your own providers: type /<prefix> in the launcher. Saved in ~/.config/conjure-launcher/commands.json; changes apply as soon as you save.',
        });
        const status = new Adw.ActionRow({ title: '', visible: false, css_classes: ['error'], use_markup: false });
        head.add(status);
        const fileRow = new Adw.ActionRow({ title: 'commands.json', subtitle: store.path });
        const openFile = new Gtk.Button({ label: 'Open file', valign: Gtk.Align.CENTER });
        openFile.connect('clicked', () => {
            const file = Gio.File.new_for_path(store.path);
            if (!file.query_exists(null))
                store.save(doc ?? { version: 1, entries: [] });
            new Gtk.FileLauncher({ file }).launch(window, null, null);
        });
        fileRow.add_suffix(openFile);
        head.add(fileRow);
        page.add(head);

        const list = new Adw.PreferencesGroup({ title: 'Entries' });
        const add = new Gtk.Button({ icon_name: 'list-add-symbolic', tooltip_text: 'Add a command', valign: Gtk.Align.CENTER, css_classes: ['flat'] });
        add.connect('clicked', () => this._editCommand(window, store, doc, null, refresh));
        list.set_header_suffix(add);
        page.add(list);
        let rows = [];

        const refresh = () => {
            for (const r of rows)
                list.remove(r);
            rows = [];
            const loaded = store.load();
            if (loaded.state === 'invalid' || loaded.state === 'unreadable') {
                doc = null;
                status.title = `The file cannot be read: ${loaded.error}. Fix it with Open file; it will not be overwritten.`;
                status.visible = true;
                add.sensitive = false;
                return;
            }
            status.visible = false;
            add.sensitive = true;
            doc = loaded.doc;
            if (!doc.entries.length) {
                const empty = new Adw.ActionRow({ title: 'No command entries yet', subtitle: 'Add one with +, or see the README for examples' });
                rows.push(empty);
                list.add(empty);
            }
            doc.entries.forEach((entry, i) => {
                const errs = errorsFor(doc, i);
                const what = entry?.command ? 'lists candidates' : 'runs with the typed text';
                const row = new Adw.ActionRow({
                    title: GLib.markup_escape_text(String(entry?.label || entry?.id || `entry ${i + 1}`), -1),
                    subtitle: GLib.markup_escape_text(errs.length ? errs.join('; ') : `/${entry.prefix} · ${what}`, -1),
                });
                if (errs.length)
                    row.add_css_class('error');
                const edit = new Gtk.Button({ icon_name: 'document-edit-symbolic', tooltip_text: 'Edit', valign: Gtk.Align.CENTER, css_classes: ['flat'] });
                edit.connect('clicked', () => this._editCommand(window, store, doc, i, refresh));
                const del = new Gtk.Button({ icon_name: 'user-trash-symbolic', tooltip_text: 'Delete', valign: Gtk.Align.CENTER, css_classes: ['flat'] });
                del.connect('clicked', () => {
                    const confirm = new Adw.AlertDialog({ heading: `Delete "${entry?.label || entry?.id}"?`, body: 'It is removed from commands.json.' });
                    confirm.add_response('cancel', 'Cancel');
                    confirm.add_response('delete', 'Delete');
                    confirm.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);
                    confirm.connect('response', (_d, response) => {
                        if (response === 'delete')
                            this._saveCommands(window, store, removeEntry(doc, i), refresh);
                    });
                    confirm.present(window);
                });
                row.add_suffix(edit);
                row.add_suffix(del);
                rows.push(row);
                list.add(row);
            });
        };

        // Reload when the file is edited elsewhere (e.g. with Open file) while prefs are open.
        const monitor = Gio.File.new_for_path(store.path).monitor_file(Gio.FileMonitorFlags.WATCH_MOVES, null);
        let pending = 0;
        monitor.connect('changed', () => {
            if (pending)
                GLib.source_remove(pending);
            pending = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 300, () => {
                pending = 0;
                refresh();
                return GLib.SOURCE_REMOVE;
            });
        });
        page.connect('destroy', () => {
            if (pending)
                GLib.source_remove(pending);
            monitor.cancel();
        });
        window._commandsMonitor = monitor;
        refresh();
        return page;
    }

    _saveCommands(window, store, next, refresh) {
        const r = store.save(next);
        if (!r.ok)
            window.add_toast(new Adw.Toast({ title: r.conflict ? 'commands.json changed on disk; reloaded it. Please try again.' : `Not saved: ${r.error}`, timeout: 5 }));
        refresh();
        return r.ok;
    }

    _editCommand(window, store, doc, index, refresh) {
        if (!doc)
            return;
        const entry = index === null ? {} : doc.entries[index] ?? {};
        const dialog = new Adw.Dialog({ title: index === null ? 'Add command' : 'Edit command', content_width: 560 });
        const view = new Adw.ToolbarView();
        const header = new Adw.HeaderBar({ show_end_title_buttons: false, show_start_title_buttons: false });
        const cancel = new Gtk.Button({ label: 'Cancel' });
        const save = new Gtk.Button({ label: 'Save', css_classes: ['suggested-action'] });
        header.pack_start(cancel);
        header.pack_end(save);
        view.add_top_bar(header);

        const form = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup();
        const text = (title, key, hint = '') => {
            const row = new Adw.EntryRow({ title: hint ? `${title} — ${hint}` : title, text: typeof entry[key] === 'string' ? entry[key] : '' });
            group.add(row);
            return row;
        };
        const label = text('Label', 'label');
        const prefix = text('Prefix', 'prefix', 'typed as /prefix');
        const id = text('Id', 'id', 'a-z, 0-9, -');
        const command = text('Command', 'command', 'prints one choice per line (optional)');
        const exec = text('Run on Enter', 'exec', '{selection} and {query}, unquoted (optional)');
        const icon = text('Icon name', 'icon', 'optional');
        const freeform = new Adw.SwitchRow({ title: 'Also offer the typed text', active: entry.freeform === true });
        const global = new Adw.SwitchRow({ title: 'Show in normal search too', active: entry.global === true });
        group.add(freeform);
        group.add(global);
        if (index === null) {
            label.connect('changed', () => {
                if (!id._edited)
                    id.text = suggestId(doc, label.text);
            });
            id.connect('changed', () => {
                if (id.text !== suggestId(doc, label.text))
                    id._edited = true;
            });
        }
        const problems = new Gtk.Label({ wrap: true, xalign: 0, css_classes: ['error'], margin_top: 12, visible: false });
        group.add(problems);
        form.add(group);
        view.set_content(form);
        dialog.set_child(view);

        cancel.connect('clicked', () => dialog.close());
        save.connect('clicked', () => {
            const fields = {
                id: id.text, label: label.text, prefix: prefix.text, command: command.text,
                exec: exec.text, icon: icon.text, freeform: freeform.active, global: global.active,
            };
            const next = upsertEntry(doc, index, fields);
            const errs = errorsFor(next, index ?? next.entries.length - 1);
            if (errs.length) {
                problems.label = errs.map(e => e.replace(/^entry \d+( \([^)]*\))?: /, '')).join('\n');
                problems.visible = true;
                return;
            }
            if (this._saveCommands(window, store, next, refresh))
                dialog.close();
        });
        dialog.present(window);
    }

    _historyPage(settings) {
        const page = new Adw.PreferencesPage({ title: 'History', icon_name: 'document-open-recent-symbolic', name: 'history' });
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
        const page = new Adw.PreferencesPage({ title: 'Appearance', icon_name: 'applications-graphics-symbolic', name: 'appearance' });

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
