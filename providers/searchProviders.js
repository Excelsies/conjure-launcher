// GNOME search providers (files, Settings, Characters, Software, ...) in global search, through
// the shell's own remoteSearch.js, so the user's Search settings (enabled list and order) apply.
//
// Budget (docs/architecture.md, Time limits): wait DEBOUNCE_MS after the last keystroke, then give
// every provider TIMEOUT_MS to answer GetInitialResultSet + GetResultMetas. A provider that is
// late or fails contributes nothing to this query; a newer query cancels the D-Bus calls.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as RemoteSearch from 'resource:///org/gnome/shell/ui/remoteSearch.js';

import { remoteResultScore } from '../lib/ranking.js';

export const DEBOUNCE_MS = 80;
export const TIMEOUT_MS = 500;
export const MAX_PER_PROVIDER = 5;
const MIN_CHARS = 2;

function delay(ms, token) {
    return new Promise(resolve => {
        // Clear the id when the timer fires: removing a source that already ran is a GLib error.
        let id = GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
            id = 0;
            resolve(true);
            return GLib.SOURCE_REMOVE;
        });
        token.onCancel(() => {
            if (id)
                GLib.source_remove(id);
            id = 0;
            resolve(false);
        });
    });
}

export class SearchProvidersBridge {
    /** @param {{settings: Gio.Settings, log: Function, logError: Function}} opts  (our settings) */
    constructor({ settings, log, logError }) {
        this.id = 'gnome-search';
        this.displayName = 'GNOME search';
        this.trackUsage = false;
        this._settings = settings;
        this._log = log;
        this._logError = logError;
        this._searchSettings = new Gio.Settings({ schema_id: 'org.gnome.desktop.search-providers' });
        this._providers = null;
        this._timedOut = new Set();
        const reload = () => (this._providers = null);
        this._ids = [
            [this._searchSettings, this._searchSettings.connect('changed', reload)],
            [settings, settings.connect('changed::excluded-search-providers', reload)],
        ];
    }

    destroy() {
        for (const [obj, id] of this._ids)
            obj.disconnect(id);
        this._ids = [];
        this._providers = null;
    }

    _load() {
        const excluded = new Set(this._settings.get_strv('excluded-search-providers'));
        try {
            return RemoteSearch.loadRemoteSearchProviders(this._searchSettings)
                .filter(p => !excluded.has(p.appInfo.get_id()));
        } catch (e) {
            this._logError('cannot load GNOME search providers', e);
            return [];
        }
    }

    query(text, token) {
        const terms = text.trim().split(/\s+/).filter(Boolean);
        if (text.trim().length < MIN_CHARS)
            return [];
        this._providers ??= this._load();
        if (!this._providers.length)
            return [];
        return this._search(terms, token);
    }

    async _search(terms, token) {
        if (!await delay(DEBOUNCE_MS, token))
            return [];
        const cancellable = new Gio.Cancellable();
        token.onCancel(() => cancellable.cancel());
        let timedOut = false;
        const timer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, TIMEOUT_MS, () => {
            timedOut = true;
            cancellable.cancel();
            return GLib.SOURCE_REMOVE;
        });

        const providers = this._providers;
        const perProvider = await Promise.all(providers.map(async (p, pi) => {
            try {
                const ids = p.filterResults(await p.getInitialResultSet(terms, cancellable), MAX_PER_PROVIDER);
                if (!ids.length || cancellable.is_cancelled())
                    return { p, results: [], done: !cancellable.is_cancelled() };
                const metas = await p.getResultMetas(ids, cancellable);
                return {
                    p, done: !cancellable.is_cancelled(),
                    results: metas.map((m, ri) => ({
                        id: `${p.id}:${m.id}`, title: m.name ?? '', subtitle: m.description || p.appInfo.get_name(),
                        meta: m, remote: p, terms, score: remoteResultScore(pi, ri),
                    })),
                };
            } catch (e) {
                this._logError(`search provider ${p.id} failed`, e);
                return { p, results: [], done: true };
            }
        }));
        if (!timedOut)
            GLib.source_remove(timer);

        if (timedOut && !token.cancelled) {
            for (const { p, done } of perProvider) {
                // Once per provider per session (or every time with debug), so a slow provider
                // is visible without flooding the journal.
                if (!done && (this._settings.get_boolean('debug') || !this._timedOut.has(p.id))) {
                    this._timedOut.add(p.id);
                    this._log(`search provider ${p.id} did not answer within ${TIMEOUT_MS} ms; its results were skipped`);
                }
            }
        }
        return perProvider.flatMap(x => x.results);
    }

    createIcon(result, size) {
        // Results without their own icon show the provider app's icon (as in GNOME's overview).
        const own = result.meta?.createIcon?.(size);
        if (own)
            return own;
        const gicon = result.remote?.appInfo?.get_icon();
        return gicon ? new St.Icon({ gicon, icon_size: size }) : null;
    }

    activate(result) {
        result.remote.activateResult(result.meta.id, result.terms);
    }
}
