// Conjure Launcher: GNOME Shell extension entry point.
//
// enable(): build the launcher, then take our keybinding (which takes over only the colliding
// part of GNOME's app-grid binding, invariant 1). disable(): the reverse, in reverse order.
// The shell calls disable() on lock and enable() again on unlock, so both must be repeatable.

import GLib from 'gi://GLib';

import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

import { KeybindingManager } from './shell/keybinding.js';
import { Launcher } from './shell/launcher.js';
import { AppsProvider } from './providers/apps.js';
import { CalcProvider } from './providers/calc.js';
import { EmojiProvider } from './providers/emoji.js';
import { WindowsProvider } from './providers/windows.js';
import { SessionProvider } from './providers/session.js';
import { SearchProvidersBridge } from './providers/searchProviders.js';
import { WallpaperProvider } from './providers/wallpaper.js';
import { CommandsRegistry } from './providers/commands.js';
import { ConjureDBusService } from './shell/dbusService.js';

const LOG_PREFIX = '[conjure-launcher]';

const log = msg => console.log(`${LOG_PREFIX} ${msg}`);
const logError = (msg, err) => console.error(`${LOG_PREFIX} ${msg}${err ? `: ${err.message ?? err}` : ''}`,
    ...(err?.stack ? [`\n${err.stack}`] : []));

export default class ConjureLauncherExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        // Order: apps first; the triggered providers appear in the "/" overview in this order.
        this._providers = [
            new AppsProvider(),
            new CalcProvider(),
            new EmojiProvider(GLib.build_filenamev([this.path, 'data', 'emoji.json']), logError),
            new WindowsProvider(),
            new SessionProvider(),
            new WallpaperProvider(this._settings),
            new SearchProvidersBridge({ settings: this._settings, log, logError }),
        ];
        // Built-in triggers, fixed before user command entries are added to the same list.
        const reserved = this._providers.map(p => p.trigger).filter(Boolean);
        this.commands = new CommandsRegistry({ providers: this._providers, reservedPrefixes: () => reserved, log, logError });
        this.launcher = new Launcher({ settings: this._settings, providers: this._providers, log, logError });
        this.dbus = new ConjureDBusService({ dmenu: (prompt, lines) => this.launcher.dmenu(prompt, lines), logError });
        this.keybindings = new KeybindingManager({
            settings: this._settings, onToggle: () => this.launcher?.toggle(), log, logError,
        });
        this.keybindings.enable();
        log(`enabled (${this.metadata['version-name']})`);
    }

    disable() {
        this.dbus?.destroy();
        this.dbus = null;
        this.keybindings?.disable();
        this.keybindings = null;
        this.launcher?.destroy();
        this.launcher = null;
        this.commands?.destroy();
        this.commands = null;
        for (const p of this._providers ?? [])
            p.destroy?.();
        this._providers = null;
        this._settings = null;
        log('disabled');
    }
}
