// Keeps a copy of the user's theme while no application overrides it, and writes it back when the user turns
// "Keep my colors" on while one does (lib/themeOverride.js has the decisions).
import GLib from 'gi://GLib';

import { SAVED_KEYS, SAVED_DOUBLE_KEYS, SAVED_STRING_KEYS, copyToSave, overridingApp, restoreValues } from '../lib/themeOverride.js';

const SAVE_DELAY_MS = 200;  // one copy after a preset's nine key writes, not nine
const SOURCE_KEY = 'theme-override-source';
const LOCK_KEY = 'theme-overrides-locked';
const SAVED_KEY = 'saved-user-theme';

export class ThemeOverrideWatcher {
    /** @param {{settings: Gio.Settings, log: (m: string) => void}} opts */
    constructor({ settings, log }) {
        this._settings = settings;
        this._log = log;
        this._saveId = 0;
        this._ids = [
            ...SAVED_KEYS.map(key => settings.connect(`changed::${key}`, () => this._scheduleSave())),
            settings.connect(`changed::${LOCK_KEY}`, () => this._onLockChanged()),
        ];
        this._save();
    }

    _scheduleSave() {
        if (this._saveId)
            GLib.source_remove(this._saveId);
        this._saveId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, SAVE_DELAY_MS, () => {
            this._saveId = 0;
            this._save();
            return GLib.SOURCE_REMOVE;
        });
    }

    _save() {
        const values = Object.fromEntries([
            ...SAVED_STRING_KEYS.map(key => [key, this._settings.get_string(key)]),
            ...SAVED_DOUBLE_KEYS.map(key => [key, this._settings.get_double(key)]),
        ]);
        const copy = copyToSave(values, this._settings.get_string(SOURCE_KEY));
        if (!copy)
            return;
        const packed = new GLib.Variant('a{sv}', Object.fromEntries(Object.entries(copy).map(
            ([key, value]) => [key, new GLib.Variant(SAVED_DOUBLE_KEYS.includes(key) ? 'd' : 's', value)])));
        if (!packed.equal(this._settings.get_value(SAVED_KEY)))
            this._settings.set_value(SAVED_KEY, packed);
    }

    _onLockChanged() {
        if (!this._settings.get_boolean(LOCK_KEY))
            return;
        const app = overridingApp(this._settings.get_string(SOURCE_KEY));
        if (!app)
            return;
        // The marker goes first, so the values written below are saved as the user's own again.
        this._settings.reset(SOURCE_KEY);
        const values = restoreValues(this._settings.get_value(SAVED_KEY).recursiveUnpack());
        for (const [key, value] of Object.entries(values)) {
            if (SAVED_DOUBLE_KEYS.includes(key))
                this._settings.set_double(key, value);
            else
                this._settings.set_string(key, value);
        }
        this._log(`restored the saved theme; ${app} no longer overrides it`);
    }

    destroy() {
        if (this._saveId) {
            GLib.source_remove(this._saveId);
            this._saveId = 0;
        }
        for (const id of this._ids)
            this._settings.disconnect(id);
        this._ids = [];
    }
}
