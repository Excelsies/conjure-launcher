// Owns our toggle-launcher binding and the app-grid takeover (invariant 1, lib/takeover.js).

import Gio from 'gi://Gio';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { takeOver, restore, normalizeAccel } from '../lib/takeover.js';
import { gnomeAppViewAdapter, savedBindingAdapter, GNOME_KEYBINDINGS_SCHEMA, GNOME_APP_VIEW_KEY } from './settingsAdapters.js';

export const TOGGLE_KEY = 'toggle-launcher';

// Schemas whose keys can hold an accelerator that would swallow ours before it reaches us.
const CONFLICT_SCHEMAS = [
    'org.gnome.desktop.wm.keybindings',
    'org.gnome.shell.keybindings',
    'org.gnome.mutter.keybindings',
    'org.gnome.mutter.wayland.keybindings',
    'org.gnome.settings-daemon.plugins.media-keys',
];

/**
 * Find other bindings that hold one of our accelerators. Read-only: changing them is the
 * user's decision (invariant 1, docs/architecture.md). A schema that is not installed is skipped.
 * @returns {string[]} "schema key" pairs
 */
export function findConflicts(ours) {
    const wanted = new Set(ours.map(normalizeAccel).filter(Boolean));
    const source = Gio.SettingsSchemaSource.get_default();
    const out = [];
    for (const id of CONFLICT_SCHEMAS) {
        const schema = source?.lookup(id, true);
        if (!schema)
            continue;
        const settings = new Gio.Settings({ settings_schema: schema });
        for (const key of schema.list_keys()) {
            if (id === GNOME_KEYBINDINGS_SCHEMA && key === GNOME_APP_VIEW_KEY)
                continue;
            const type = schema.get_key(key).get_value_type().dup_string();
            const values = type === 'as' ? settings.get_strv(key) : type === 's' ? [settings.get_string(key)] : [];
            if (values.some(v => wanted.has(normalizeAccel(v))))
                out.push(`${id} ${key}`);
        }
    }
    return out;
}

export class KeybindingManager {
    /**
     * @param {{settings: Gio.Settings, onToggle: () => void, log: (m: string) => void,
     *          logError: (m: string, e?: unknown) => void}} opts
     */
    constructor({ settings, onToggle, log, logError }) {
        this._settings = settings;
        this._onToggle = onToggle;
        this._log = log;
        this._logError = logError;
        this._gnome = gnomeAppViewAdapter();
        this._saved = savedBindingAdapter(settings);
        this._ours = [];
        this._changedId = 0;
        this.conflicts = [];
    }

    enable() {
        this._ours = this._settings.get_strv(TOGGLE_KEY);
        this._take();
        const action = Main.wm.addKeybinding(TOGGLE_KEY, this._settings, Meta.KeyBindingFlags.IGNORE_AUTOREPEAT,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW | Shell.ActionMode.POPUP,
            () => this._onToggle());
        if (action === Meta.KeyBindingAction.NONE)
            this._logError(`could not register ${this._ours.join(', ')} for ${TOGGLE_KEY}`);
        this._changedId = this._settings.connect(`changed::${TOGGLE_KEY}`, () => this._rebind());
    }

    disable() {
        if (this._changedId) {
            this._settings.disconnect(this._changedId);
            this._changedId = 0;
        }
        Main.wm.removeKeybinding(TOGGLE_KEY);
        const r = restore(this._gnome, this._saved, this._ours);
        if (r.reason && r.reason !== 'nothing saved')
            this._log(`toggle-application-view: ${r.reason}`);
        Gio.Settings.sync();
    }

    _take() {
        const t = takeOver(this._gnome, this._saved, this._ours);
        if (!t.ok)
            this._logError(`left ${GNOME_APP_VIEW_KEY} alone (${t.reason}); ${this._ours.join(', ')} may still open the app grid`);
        Gio.Settings.sync();
        this.conflicts = findConflicts(this._ours);
        for (const c of this.conflicts)
            this._log(`${this._ours.join(', ')} is also bound to ${c}; the launcher will not receive it until that binding is changed`);
    }

    /** The user rebound toggle-launcher: give back what we took with the old accelerators. */
    _rebind() {
        restore(this._gnome, this._saved, this._ours);
        this._ours = this._settings.get_strv(TOGGLE_KEY);
        this._take();
    }
}
