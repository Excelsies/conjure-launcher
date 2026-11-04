// Applications provider: GNOME's installed apps (Shell.AppSystem), filtered the same way as the
// app grid (NoDisplay/OnlyShowIn via should_show, plus parental controls), scored with
// Noctalia's weights (lib/appScore.js).

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as ParentalControlsManager from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';

import { scoreApp, MAX_APP_RESULTS } from '../lib/appScore.js';
import { isMatch } from '../lib/fzy.js';

function lower(s) {
    return (s ?? '').toLowerCase();
}

export class AppsProvider {
    constructor() {
        this.id = 'apps';
        this.trackUsage = true;
        this._appSys = Shell.AppSystem.get_default();
        this._parental = ParentalControlsManager.getDefault();
        this._entries = null;
        this._changedIds = [
            this._appSys.connect('installed-changed', () => (this._entries = null)),
            this._parental.connect('app-filter-changed', () => (this._entries = null)),
        ];
    }

    destroy() {
        this._appSys.disconnect(this._changedIds[0]);
        this._parental.disconnect(this._changedIds[1]);
        this._entries = null;
    }

    _load() {
        const entries = [];
        for (const info of this._appSys.get_installed()) {
            let id;
            try {
                id = info.get_id();  // throws on invalid file-name encodings, as in appDisplay.js
            } catch {
                continue;
            }
            if (!id || !info.should_show() || !this._parental.shouldShowApp(info))
                continue;
            const name = info.get_display_name() ?? info.get_name() ?? id;
            const raw = typeof info.get_string === 'function' ? info.get_string('Name') : null;
            const exec = info.get_executable() ?? '';
            entries.push({
                id,
                name,
                subtitle: info.get_generic_name?.() || info.get_description() || '',
                score: {
                    nameLower: lower(name),
                    altNamesLower: raw && lower(raw) !== lower(name) ? [lower(raw)] : [],
                    genericLower: lower(info.get_generic_name?.()),
                    keywordsLower: (info.get_keywords?.() ?? []).map(lower),
                    categoriesLower: lower(info.get_categories?.()).split(';').filter(Boolean),
                    idLower: lower(id.replace(/\.desktop$/, '')),
                    execLower: lower(GLib.path_get_basename(exec)),
                },
            });
        }
        entries.sort((a, b) => a.name.localeCompare(b.name));
        return entries;
    }

    query(text) {
        this._entries ??= this._load();
        const pattern = text.trim().toLowerCase();
        const toResult = (e, score) => ({ id: e.id, title: e.name, subtitle: e.subtitle, score });

        if (!pattern)
            return this._entries.map(e => toResult(e, 0));

        const out = [];
        for (const e of this._entries) {
            const s = scoreApp(pattern, e.score);
            if (isMatch(s))
                out.push(toResult(e, s));
        }
        out.sort((a, b) => b.score - a.score);
        return out.slice(0, MAX_APP_RESULTS);
    }

    createIcon(result, size) {
        return this._appSys.lookup_app(result.id)?.create_icon_texture(size) ?? null;
    }

    /**
     * GNOME's convention (appDisplay.js AppIcon.activate): focus or start the app; with
     * newWindow and the app already running, open another window.
     */
    activate(result, { newWindow = false } = {}) {
        const app = this._appSys.lookup_app(result.id);
        if (!app)
            throw new Error(`app ${result.id} is no longer installed`);
        if (newWindow && app.can_open_new_window() && app.state === Shell.AppState.RUNNING)
            app.open_new_window(-1);
        else
            app.activate();
    }
}
