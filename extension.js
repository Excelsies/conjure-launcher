// Conjure Launcher: GNOME Shell extension entry point.
//
// enable(): build the launcher, then take our keybinding (which takes over only the colliding
// part of GNOME's app-grid binding, invariant 1). disable(): the reverse, in reverse order.
// The shell calls disable() on lock and enable() again on unlock, so both must be repeatable.

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { KeybindingManager } from './shell/keybinding.js';
import { Launcher } from './shell/launcher.js';
import { AppsProvider } from './providers/apps.js';

const LOG_PREFIX = '[conjure-launcher]';

const log = msg => console.log(`${LOG_PREFIX} ${msg}`);
const logError = (msg, err) => console.error(`${LOG_PREFIX} ${msg}${err ? `: ${err.message ?? err}` : ''}`,
    ...(err?.stack ? [`\n${err.stack}`] : []));

export default class ConjureLauncherExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._providers = [new AppsProvider()];
        this.launcher = new Launcher({ settings: this._settings, providers: this._providers, log, logError });
        this.keybindings = new KeybindingManager({
            settings: this._settings, onToggle: () => this.launcher?.toggle(), log, logError,
        });
        this.keybindings.enable();
        log(`enabled (${this.metadata['version-name']})`);
    }

    disable() {
        this.keybindings?.disable();
        this.keybindings = null;
        this.launcher?.destroy();
        this.launcher = null;
        for (const p of this._providers ?? [])
            p.destroy?.();
        this._providers = null;
        this._settings = null;
        log('disabled');
    }
}
