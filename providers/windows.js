// Open windows: "/win <title or app>", most recently used first; Enter switches to the window.

import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { score as fuzzy, isMatch } from '../lib/fzy.js';

export class WindowsProvider {
    constructor() {
        this.id = 'windows';
        this.trigger = 'win';
        this.displayName = 'Open windows';
        this.icon = 'focus-windows-symbolic';
        this.trackUsage = false;
        this._tracker = Shell.WindowTracker.get_default();
    }

    query(text) {
        const q = text.trim().toLowerCase();
        const windows = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
        const out = [];
        windows.forEach((win, i) => {
            const app = this._tracker.get_window_app(win);
            const appName = app?.get_name() ?? '';
            const title = win.get_title() || appName || 'Window';
            const s = q ? fuzzy(q, `${title} ${appName}`.toLowerCase()) : -i;
            if (q && !isMatch(s))
                return;
            const ws = win.get_workspace();
            const parts = [appName, ws ? `Workspace ${ws.index() + 1}` : null, win.minimized ? 'Minimised' : null];
            out.push({ id: `window-${win.get_stable_sequence()}`, title, subtitle: parts.filter(Boolean).join('  ·  '),
                window: win, app, score: s });
        });
        return out.sort((a, b) => b.score - a.score);
    }

    createIcon(result, size) {
        return result.app?.create_icon_texture(size) ?? null;
    }

    activate(result) {
        // The window may have closed while the launcher was open.
        if (!result.window?.get_compositor_private())
            throw new Error('that window has closed');
        Main.activateWindow(result.window);
    }
}
