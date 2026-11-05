// GNOME Settings pages: "/set <page>" lists Settings panels (Wi-Fi, Displays, Sound...) from their desktop
// entries (category X-GNOME-Settings-Panel, hidden from the app grid) and Enter opens that page directly.

import Gio from 'gi://Gio';
import St from 'gi://St';

import { score as fuzzy, isMatch } from '../lib/fzy.js';

const PANEL_CATEGORY = 'X-GNOME-Settings-Panel';

export class SettingsPanelsProvider {
    constructor() {
        this.id = 'settings-panels';
        this.trigger = 'set';
        this.displayName = 'Settings pages';
        this.icon = 'org.gnome.Settings-symbolic';
        this.trackUsage = true;
        this._panels = null;
    }

    onClose() {
        this._panels = null;  // re-read on the next open (installed panels can change)
    }

    _list() {
        this._panels ??= Gio.AppInfo.get_all()
            .filter(info => (info.get_categories?.() ?? '').split(';').includes(PANEL_CATEGORY))
            .map(info => ({
                info, name: info.get_name(), nameLower: info.get_name().toLowerCase(),
                keywordsLower: (info.get_keywords?.() ?? []).map(k => k.toLowerCase()),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
        return this._panels;
    }

    query(text) {
        const q = text.trim().toLowerCase();
        const out = [];
        for (const p of this._list()) {
            let s = 0;
            if (q) {
                const name = fuzzy(q, p.nameLower);
                const kw = Math.max(-Infinity, ...p.keywordsLower.map(k => fuzzy(q, k) * 0.8));
                s = isMatch(name) ? name * 2 + 1000 : kw;
                if (!isMatch(s))
                    continue;
            }
            out.push({ id: p.info.get_id(), title: p.name, subtitle: 'Settings', info: p.info, score: s });
        }
        return out.sort((a, b) => b.score - a.score);
    }

    createIcon(result, size) {
        return new St.Icon({ gicon: result.info.get_icon() ?? Gio.ThemedIcon.new(this.icon), icon_size: size });
    }

    /** Separate so tests can record launches instead of opening Settings. */
    launch(info) {
        info.launch([], global.create_app_launch_context(0, -1));
    }

    activate(result) {
        this.launch(result.info);
    }
}
