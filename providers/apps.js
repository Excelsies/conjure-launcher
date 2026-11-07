// Applications provider: GNOME's installed apps (Shell.AppSystem), filtered the same way as the
// app grid (NoDisplay/OnlyShowIn via should_show, plus parental controls), scored with
// Noctalia's weights (lib/appScore.js).

import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as ParentalControlsManager from 'resource:///org/gnome/shell/misc/parentalControlsManager.js';

import { scoreApp, MAX_APP_RESULTS } from '../lib/appScore.js';
import { typoScore } from '../lib/typo.js';
import { categoryFor } from '../lib/views.js';
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
            const raw = info.get_string('Name');
            const exec = info.get_executable() ?? '';
            const categoryTokens = (info.get_categories() ?? '').split(';').filter(Boolean);
            entries.push({
                id,
                name,
                category: categoryFor(categoryTokens),
                subtitle: info.get_generic_name() || info.get_description() || '',
                score: {
                    nameLower: lower(name),
                    altNamesLower: raw && lower(raw) !== lower(name) ? [lower(raw)] : [],
                    genericLower: lower(info.get_generic_name()),
                    keywordsLower: (info.get_keywords() ?? []).map(lower),
                    categoriesLower: lower(info.get_categories()).split(';').filter(Boolean),
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
        const toResult = (e, score) => ({ id: e.id, title: e.name, subtitle: e.subtitle, category: e.category, score });

        if (!pattern)
            return this._entries.map(e => toResult(e, 0));

        const out = [];
        for (const e of this._entries) {
            let s = scoreApp(pattern, e.score);
            if (!isMatch(s))
                s = typoScore(pattern, e.score.nameLower);  // listed, but below every real match
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
     * Context-menu entries: open, a new window when supported, then the app's desktop actions.
     * @returns {{id: string, label: string, icon?: string}[]}
     */
    actions(result) {
        const app = this._appSys.lookup_app(result.id);
        if (!app)
            return [];
        const out = [{ id: 'open', label: app.state === Shell.AppState.RUNNING ? 'Switch To' : 'Open', icon: 'media-playback-start-symbolic' }];
        if (app.can_open_new_window())
            out.push({ id: 'new-window', label: 'New Window', icon: 'window-new-symbolic' });
        const info = app.get_app_info();
        for (const action of info?.list_actions() ?? []) {
            if (action === 'new-window')
                continue;  // already offered above, with GNOME's own handling
            out.push({ id: `action:${action}`, label: info.get_action_name(action) ?? action });
        }
        return out;
    }

    runAction(result, actionId) {
        const app = this._appSys.lookup_app(result.id);
        if (!app)
            throw new Error(`app ${result.id} is no longer installed`);
        if (actionId === 'open')
            app.activate();
        else if (actionId === 'new-window')
            app.open_new_window(-1);
        else if (actionId.startsWith('action:'))
            app.launch_action(actionId.slice('action:'.length), global.get_current_time(), -1);
        else
            throw new Error(`unknown action ${actionId}`);
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
