// The launcher controller: wires the modal lifecycle, the query controller, the panel, the providers
// and the launch history together. Every close path goes through this._lifecycle.close(reason).

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { PanelLifecycle } from '../lib/lifecycle.js';
import { QueryController } from '../lib/queryController.js';
import { resolveTheme, styles, systemDefaults, COLOR_TOKENS } from '../lib/theme.js';
import { panelRect } from '../lib/placement.js';
import { togglePin, movePin } from '../lib/views.js';
import { wantsNewWindow } from '../lib/appActivation.js';
import { LauncherPanel, PANEL_HEIGHT } from '../ui/panel.js';
import { UsageFile } from './usageFile.js';
import { DmenuProvider } from '../providers/dmenu.js';
import { AutoPaste } from './autoPaste.js';
import { SystemStyle } from './systemStyle.js';

const THEME_KEYS = [...Object.keys(COLOR_TOKENS).map(k => `theme-${k}`), 'theme-radius-scale', 'theme-font-family'];

export class Launcher {
    /**
     * @param {{settings: import('gi://Gio').Settings, providers: object[],
     *          log: (m: string) => void, logError: (m: string, e: unknown) => void}} opts
     */
    constructor({ settings, providers, log, logError, openSettings = null }) {
        this._openSettings = openSettings;
        this._settings = settings;
        this._providers = providers;
        this._log = log;
        this._logError = logError;
        this._panel = null;
        this._fading = new Set();  // closed panels still fading out; destroyed on disable
        this._dmenu = null;        // {resolve, reject, prompt} while a Dmenu call is pending
        this._previousWindow = null;  // focused before opening; the only auto-paste target
        this.autoPaste = new AutoPaste({ settings, log });
        this._signals = [];

        this._usage = new UsageFile(GLib.build_filenamev([GLib.get_user_state_dir(), 'conjure-launcher']),
            { log, logError });
        this._usageLoaded = this._usage.load();

        this.systemStyle = new SystemStyle({ onChange: () => this._restyle() });
        this._styles = this._computeStyles();
        this._settingsIds = [settings.connect('changed', (_s, key) => {
            if (THEME_KEYS.includes(key)) {
                this._restyle();
            } else if (key === 'app-grid') {
                this._panel?.setGrid(settings.get_boolean('app-grid'));
            } else if (key === 'pinned') {
                this._requery();
            } else if (key === 'history-clear-request') {
                // Written by the preferences window (a separate process): the usage file is ours.
                this._usage.model.clear();
                this._usage.save();
                this._log('launch history cleared');
                this._requery();
            }
        })];

        this._query = new QueryController({
            providers,
            prefixChar: () => settings.get_string('provider-prefix'),
            sortByUsage: () => settings.get_boolean('sort-by-usage'),
            usageWeight: (pid, id) => this._usage.model.weight(pid, id),
            onResults: (results, info) => this._panel?.setResults(this._decorate(results), info),
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

    /**
     * dmenu mode: open scoped to the candidates; resolves {picked, selection} exactly once.
     * A newer call answers the older one as not picked; disable rejects.
     */
    dmenu(prompt, lines) {
        return new Promise((resolve, reject) => {
            this._finishDmenu({ picked: false, selection: '' });
            this._lifecycle.close('dmenu');
            this._dmenu = { resolve, reject, prompt };
            this._query.setScope(new DmenuProvider(lines));
            if (!this._lifecycle.open())
                this._finishDmenu(null, new Error('the launcher could not open'));
        });
    }

    _finishDmenu(answer, error = null) {
        const pending = this._dmenu;
        if (!pending)
            return;
        this._dmenu = null;
        if (error)
            pending.reject(error);
        else
            pending.resolve(answer);
    }

    open() {
        return this._lifecycle.open();
    }

    close(reason) {
        this._lifecycle.close(reason);
    }

    destroy() {
        this.autoPaste.destroy();
        this._lifecycle.close('disable');
        for (const panel of [...this._fading])
            panel.destroy();
        this._fading.clear();
        for (const id of this._settingsIds)
            this._settings.disconnect(id);
        this._settingsIds = [];
        this.systemStyle.destroy();
    }

    _restyle() {
        this._styles = this._computeStyles();
        this._panel?.applyStyles(this._styles);
    }

    _computeStyles() {
        const values = {};
        for (const name of Object.keys(COLOR_TOKENS))
            values[name] = this._settings.get_string(`theme-${name}`);
        values['radius-scale'] = this._settings.get_double('theme-radius-scale');
        values['font-family'] = this._settings.get_string('theme-font-family');
        const theme = resolveTheme(values, systemDefaults(this.systemStyle.get()));
        for (const key of theme.invalid)
            this._log(`theme-${key} has an invalid value; using the default`);
        return styles(theme);
    }

    _push() {
        if (Main.overview.visible)
            Main.overview.hide();
        this._previousWindow = global.display.focus_window;
        const monitor = this._chooseMonitor();
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
            scoped: Boolean(this._dmenu),
            prompt: this._dmenu?.prompt ?? '',
            searchPosition: this._settings.get_string('search-position'),
            defaultView: this._settings.get_string('default-view'),
            grid: this._settings.get_boolean('app-grid'),
            pinned: () => this._settings.get_strv('pinned'),
            createIcon: (result, size) => this._createIcon(result, size),
            onQuery: text => this._query.setQuery(text),
            onActivate: (result, opts) => this._activate(result, opts),
            onActions: result => this._providerFor(result)?.actions?.(result) ?? [],
            onRunAction: (result, actionId) => this._runAction(result, actionId),
            onTogglePin: result => this._togglePin(result),
            onMovePin: (result, delta) => this._movePin(result, delta),
            onToggleGrid: () => this._settings.set_boolean('app-grid', !this._settings.get_boolean('app-grid')),
            onCancel: reason => this._lifecycle.close(reason),
            onGone: p => this._fading.delete(p),
            onOpenSettings: this._openSettings ? () => {
                this._lifecycle.close('settings');
                this._openSettings();
            } : null,
        });
        panel.build(monitor, rect);
        this.lastRect = rect;
        const grab = Main.pushModal(panel.backdrop, { actionMode: Shell.ActionMode.POPUP });
        this._panel = panel;
        return grab;
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
        this._query.setScope(null);
        // A dmenu call still waiting gets its answer on every close path.
        if (reason === 'disable')
            this._finishDmenu(null, new Error('Conjure Launcher was disabled'));
        else
            this._finishDmenu({ picked: false, selection: '' });
        for (const p of this._providers)
            p.onClose?.();
        // The grab is already released (PanelLifecycle pops before onClose); what remains is the
        // fade-out. disable() must not leave actors behind, so it skips the animation.
        const animate = reason !== 'disable';
        if (this._panel && animate)
            this._fading.add(this._panel);
        this._panel?.dismiss({ animate });
        this._panel = null;
        if (this._settings.get_boolean('debug'))
            this._log(`closed (${reason})`);
    }

    /** The monitor to open on (setting "monitor"): focused (default), pointer, or primary. */
    _chooseMonitor() {
        const lm = Main.layoutManager;
        const mode = this._settings.get_string('monitor');
        if (mode === 'primary')
            return lm.primaryMonitor;
        if (mode === 'pointer')
            return lm.currentMonitor ?? lm.primaryMonitor;
        const win = global.display.focus_window;
        if (win && win.get_monitor() >= 0)
            return lm.monitors[win.get_monitor()] ?? lm.primaryMonitor;
        return lm.currentMonitor ?? lm.primaryMonitor;
    }

    _createIcon(result, size) {
        if (result.badge)
            return new St.Label({ text: result.badge, style: `font-size: ${Math.round(size * 0.7)}px;`, y_align: 2 /* CENTER */ });
        if (result.iconName)
            return new St.Icon({ icon_name: result.iconName, icon_size: Math.round(size * 0.6) });
        return this._providerFor(result)?.createIcon?.(result, size) ?? null;
    }

    /** Add the per-result state the views need: pinned, recentIndex. */
    _decorate(results) {
        const pinned = new Set(this._settings.get_strv('pinned'));
        return results.map(r => ({
            ...r,
            pinned: r.providerId === 'apps' && pinned.has(r.id),
            recentIndex: this._usage.model.recentIndex(r.providerId, r.id),
        }));
    }

    _requery() {
        if (this._panel)
            this._query.setQuery(this._panel.text);
    }

    _togglePin(result) {
        if (result.providerId !== 'apps')
            return;
        const next = togglePin(this._settings.get_strv('pinned'), result.id);
        if (!this._settings.set_strv('pinned', next))
            this._logError(`could not save pinned apps (setting not writable)`, null);
    }

    _movePin(result, delta) {
        const pinned = this._settings.get_strv('pinned');
        const next = movePin(pinned, result.id, delta);
        if (next.some((id, i) => id !== pinned[i]) && !this._settings.set_strv('pinned', next))
            this._logError('could not save pinned apps (setting not writable)', null);
    }

    _recordUsage(provider, result) {
        if (provider.trackUsage && this._settings.get_boolean('track-usage')) {
            this._usage.model.record(provider.id, result.id);
            this._usage.save();
        }
    }

    _runAction(result, actionId) {
        const provider = this._providerFor(result);
        this._lifecycle.close('activate');
        try {
            provider.runAction(result, actionId);
        } catch (e) {
            this._logError(`action ${actionId} on ${result.providerId}:${result.id} failed`, e);
            Main.notifyError('Conjure Launcher', `Could not run "${actionId}" for ${result.title}: ${e.message}`);
            return;
        }
        this._recordUsage(provider, result);
    }

    _providerFor(result) {
        return this._providers.find(p => p.id === result.providerId);
    }

    _activate(result, { alternate }) {
        if (this._dmenu) {
            const pending = this._dmenu;
            this._dmenu = null;
            this._lifecycle.close('activate');
            pending.resolve({ picked: true, selection: result.raw });
            return;
        }
        // A result that rewrites the input (the provider overview) keeps the launcher open.
        if (typeof result.query === 'string') {
            this._panel?.setText(result.query);
            return;
        }
        const provider = this._providerFor(result);
        // Close first so the modal grab is gone and the launched window can take focus.
        this._lifecycle.close('activate');
        if (!provider) {
            this._logError(`no provider ${result.providerId} for result ${result.id}`, null);
            return;
        }
        const previous = this._previousWindow;
        try {
            provider.activate(result, { newWindow: wantsNewWindow(this._settings.get_string('running-app-action'), alternate) });
            if (result.copies)
                this.autoPaste.after(previous, { copied: true });
        } catch (e) {
            this._logError(`activating ${result.providerId}:${result.id} failed`, e);
            Main.notifyError('Conjure Launcher', `Could not open ${result.title}: ${e.message}`);
            return;
        }
        this._recordUsage(provider, result);
    }
}
