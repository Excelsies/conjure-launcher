// Keeps a copy of the user's theme while no application overrides it. Turning "Keep my colors" on while an
// application overrides the theme saves the application's theme and writes the user's back; turning it off
// again hands the application's theme back (lib/themeOverride.js has the decisions).
import GLib from 'gi://GLib';

import {
    SAVED_KEYS, SAVED_DOUBLE_KEYS, SAVED_STRING_KEYS, copyToSave, handBackPlan, overridingApp, restoreValues,
} from '../lib/themeOverride.js';

const SAVE_DELAY_MS = 200;  // one copy after a preset's nine key writes, not nine
const SOURCE_KEY = 'theme-override-source';
const LOCK_KEY = 'theme-overrides-locked';
const SAVED_KEY = 'saved-user-theme';
const SAVED_APP_KEY = 'saved-app-theme';

const pack = values => new GLib.Variant('a{sv}', Object.fromEntries(Object.entries(values).map(
    ([key, value]) => [key, new GLib.Variant(SAVED_DOUBLE_KEYS.includes(key) ? 'd' : 's', value)])));

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

    _readValues() {
        return Object.fromEntries([
            ...SAVED_STRING_KEYS.map(key => [key, this._settings.get_string(key)]),
            ...SAVED_DOUBLE_KEYS.map(key => [key, this._settings.get_double(key)]),
        ]);
    }

    _write(values) {
        for (const [key, value] of Object.entries(values)) {
            if (SAVED_DOUBLE_KEYS.includes(key))
                this._settings.set_double(key, value);
            else
                this._settings.set_string(key, value);
        }
    }

    _save() {
        const copy = copyToSave(this._readValues(), this._settings.get_string(SOURCE_KEY));
        if (!copy)
            return;
        const packed = pack(copy);
        if (!packed.equal(this._settings.get_value(SAVED_KEY)))
            this._settings.set_value(SAVED_KEY, packed);
    }

    _onLockChanged() {
        if (this._settings.get_boolean(LOCK_KEY))
            this._takeBack();
        else
            this._handBack();
    }

    _takeBack() {
        const app = overridingApp(this._settings.get_string(SOURCE_KEY));
        if (!app)
            return;
        // The application's theme is kept first, so turning the lock off can hand it back.
        this._settings.set_value(SAVED_APP_KEY, pack({ ...this._readValues(), [SOURCE_KEY]: app }));
        // The save these writes schedule runs after this handler, with no name set, so they count as the user's.
        this._settings.reset(SOURCE_KEY);
        this._write(restoreValues(this._settings.get_value(SAVED_KEY).recursiveUnpack()));
        this._log(`restored the saved theme; ${app} no longer overrides it`);
    }

    _handBack() {
        const plan = handBackPlan(this._settings.get_value(SAVED_APP_KEY).recursiveUnpack());
        if (!plan)
            return;
        // The save these writes schedule runs after this handler and sees the name, so they never count as the user's.
        this._settings.set_string(SOURCE_KEY, plan.name);
        this._write(plan.values);
        this._settings.reset(SAVED_APP_KEY);
        this._log(`handed the theme back to ${plan.name}`);
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
