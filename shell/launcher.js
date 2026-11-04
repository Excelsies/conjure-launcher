// The launcher controller: wires the modal lifecycle (invariant 2), the query controller
// (invariant 4), the panel, the providers and the launch history together. Every close path
// goes through this._lifecycle.close(reason).

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { PanelLifecycle } from '../lib/lifecycle.js';
import { QueryController } from '../lib/queryController.js';
import { resolveTheme, styles, COLOUR_TOKENS } from '../lib/theme.js';
import { panelRect } from '../lib/placement.js';
import { LauncherPanel, PANEL_HEIGHT } from '../ui/panel.js';
import { UsageFile } from './usageFile.js';

const THEME_KEYS = [...Object.keys(COLOUR_TOKENS).map(k => `theme-${k}`), 'theme-radius-scale', 'theme-font-family'];

export class Launcher {
    /**
     * @param {{settings: import('gi://Gio').Settings, providers: object[],
     *          log: (m: string) => void, logError: (m: string, e: unknown) => void}} opts
     */
    constructor({ settings, providers, log, logError }) {
        this._settings = settings;
        this._providers = providers;
        this._log = log;
        this._logError = logError;
        this._panel = null;
        this._signals = [];

        this._usage = new UsageFile(GLib.build_filenamev([GLib.get_user_state_dir(), 'conjure-launcher']),
            { log, logError });
        this._usageLoaded = this._usage.load();

        this._styles = this._computeStyles();
        this._settingsIds = [settings.connect('changed', (_s, key) => {
            if (THEME_KEYS.includes(key)) {
                this._styles = this._computeStyles();
                this._panel?.applyStyles(this._styles);
            }
        })];

        this._query = new QueryController({
            providers,
            prefixChar: () => settings.get_string('provider-prefix'),
            sortByUsage: () => settings.get_boolean('sort-by-usage'),
            usageCount: (pid, id) => this._usage.model.count(pid, id),
            onResults: (results, info) => this._panel?.setResults(results, info),
            logError,
        });

        this._lifecycle = new PanelLifecycle({
            push: () => this._push(),
            pop: grab => Main.popModal(grab),
            onOpen: () => this._onOpen(),
            onClose: reason => this._onClose(reason),
            logError,
        });
    }

    get isOpen() {
        return this._lifecycle.isOpen;
    }

    /** Test hook. */
    get panel() {
        return this._panel;
    }

    /** Test hook: resolves once the launch history has been read. */
    get usageReady() {
        return this._usageLoaded;
    }

    get usage() {
        return this._usage;
    }

    toggle() {
        return this._lifecycle.toggle();
    }

    open() {
        return this._lifecycle.open();
    }

    close(reason) {
        this._lifecycle.close(reason);
    }

    destroy() {
        this._lifecycle.close('disable');
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];
    }

    _computeStyles() {
        const values = {};
        for (const name of Object.keys(COLOUR_TOKENS))
            values[name] = this._settings.get_string(`theme-${name}`);
        values['radius-scale'] = this._settings.get_double('theme-radius-scale');
        values['font-family'] = this._settings.get_string('theme-font-family');
        const theme = resolveTheme(values);
        for (const key of theme.invalid)
            this._log(`theme-${key} has an invalid value; using the default`);
        return styles(theme);
    }

    _push() {
        if (Main.overview.visible)
            Main.overview.hide();
        const monitor = Main.layoutManager.focusMonitor ?? Main.layoutManager.primaryMonitor;
        if (!monitor)
            throw new Error('no monitor to open on');
        const rect = panelRect({
            monitor,
            workArea: Main.layoutManager.getWorkAreaForMonitor(monitor.index),
            width: this._settings.get_int('width'),
            height: PANEL_HEIGHT,
            position: this._settings.get_string('position'),
        });
        const panel = new LauncherPanel({
            styles: this._styles,
            createIcon: (result, size) => this._providerFor(result)?.createIcon?.(result, size) ?? null,
            onQuery: text => this._query.setQuery(text),
            onActivate: (result, opts) => this._activate(result, opts),
            onCancel: reason => this._lifecycle.close(reason),
        });
        panel.build(monitor, rect);
        this.lastRect = rect;
        try {
            const grab = Main.pushModal(panel.backdrop, { actionMode: Shell.ActionMode.POPUP });
            this._panel = panel;
            return grab;
        } catch (e) {
            panel.destroy();
            throw e;
        }
    }

    _onOpen() {
        const backdrop = this._panel.backdrop;
        this._signals = [
            [global.stage, global.stage.connect('notify::key-focus', () => {
                const focus = global.stage.get_key_focus();
                if (!focus || !backdrop.contains(focus))
                    this._lifecycle.close('focus-lost');
            })],
            [Main.layoutManager, Main.layoutManager.connect('monitors-changed', () => this._lifecycle.close('monitors-changed'))],
            [Main.sessionMode, Main.sessionMode.connect('updated', () => {
                if (Main.sessionMode.isLocked)
                    this._lifecycle.close('locked');
            })],
            [Main.overview, Main.overview.connect('showing', () => this._lifecycle.close('overview'))],
        ];
        this._panel.present();
        this._query.setQuery('');
    }

    _onClose(reason) {
        for (const [obj, id] of this._signals)
            obj.disconnect(id);
        this._signals = [];
        this._query.cancel();
        this._panel?.destroy();
        this._panel = null;
        if (this._settings.get_boolean('debug'))
            this._log(`closed (${reason})`);
    }

    _providerFor(result) {
        return this._providers.find(p => p.id === result.providerId);
    }

    _activate(result, { newWindow }) {
        const provider = this._providerFor(result);
        // Close first so the modal grab is gone and the launched window can take focus.
        this._lifecycle.close('activate');
        if (!provider) {
            this._logError(`no provider ${result.providerId} for result ${result.id}`, null);
            return;
        }
        try {
            provider.activate(result, { newWindow });
        } catch (e) {
            this._logError(`activating ${result.providerId}:${result.id} failed`, e);
            Main.notifyError('Conjure Launcher', `Could not open ${result.title}: ${e.message}`);
            return;
        }
        if (provider.trackUsage && this._settings.get_boolean('track-usage')) {
            this._usage.model.record(provider.id, result.id);
            this._usage.save();
        }
    }
}
