// Auto-paste: after a copying result, paste into the
// window that was focused before the launcher opened, and only into that window.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';

import { pasteChord, shouldPaste } from '../lib/paste.js';

const FOCUS_WAIT_MS = 300;

export class AutoPaste {
    constructor({ settings, log }) {
        this._settings = settings;
        this._log = log;
        this._keyboard = null;
        this._pending = [];
    }

    destroy() {
        for (const cancel of this._pending.splice(0))
            cancel();
        this._keyboard = null;  // the virtual device is released with its last reference
    }

    /** Send a key chord through a virtual keyboard (replaceable in tests). */
    send(chord) {
        this._keyboard ??= Clutter.get_default_backend().get_default_seat()
            .create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
        const now = () => GLib.get_monotonic_time();
        const syms = chord.map(name => Clutter[`KEY_${name}`]);
        for (const k of syms)
            this._keyboard.notify_keyval(now(), k, Clutter.KeyState.PRESSED);
        for (const k of [...syms].reverse())
            this._keyboard.notify_keyval(now(), k, Clutter.KeyState.RELEASED);
    }

    /**
     * Called after the launcher closed on a copying result. Resolves true if it pasted.
     * @param {Meta.Window|null} previous  the window focused before the launcher opened
     */
    after(previous, { copied }) {
        if (!this._settings.get_boolean('auto-paste') || !copied || !previous)
            return Promise.resolve(false);
        return new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done)
                    return;
                done = true;
                global.display.disconnect(focusId);
                if (timer)
                    GLib.source_remove(timer);
                timer = 0;
                this._pending = this._pending.filter(c => c !== cancel);
                const current = global.display.focus_window;
                if (shouldPaste({ enabled: true, copied, previous, current })) {
                    this.send(pasteChord(previous.get_wm_class()));
                    resolve(true);
                } else {
                    this._log(`auto-paste skipped: focus is not back on the window it was copied for`);
                    resolve(false);
                }
            };
            const cancel = () => {
                done = true;
                global.display.disconnect(focusId);
                if (timer)
                    GLib.source_remove(timer);
                timer = 0;
                resolve(false);
            };
            const focusId = global.display.connect('notify::focus-window', () => {
                if (global.display.focus_window === previous)
                    finish();
            });
            let timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, FOCUS_WAIT_MS, () => {
                timer = 0;
                finish();
                return GLib.SOURCE_REMOVE;
            });
            this._pending.push(cancel);
            if (global.display.focus_window === previous)
                finish();
        });
    }
}
