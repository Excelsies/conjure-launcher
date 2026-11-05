// Open windows: "/win <title or app>", most recently used first; Enter switches to the window.
// Shift+Enter or right-click offers: switch to, minimize or restore, move to another workspace, close.
// Close asks the window to close (Meta.Window.delete), so the app's own "save changes?" prompt applies.

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
            const parts = [appName, ws ? `Workspace ${ws.index() + 1}` : null, win.minimized ? 'Minimized' : null];
            out.push({ id: `window-${win.get_stable_sequence()}`, title, subtitle: parts.filter(Boolean).join('  ·  '),
                window: win, app, score: s });
        });
        return out.sort((a, b) => b.score - a.score);
    }

    createIcon(result, size) {
        return result.app?.create_icon_texture(size) ?? null;
    }

    activate(result) {
        Main.activateWindow(this._live(result));
    }

    /** The window, if it is still open (it may have closed while the launcher was open). */
    _live(result) {
        if (!result.window?.get_compositor_private())
            throw new Error('that window has closed');
        return result.window;
    }

    /** @returns {{id: string, label: string, icon?: string}[]} */
    actions(result) {
        const win = result.window;
        if (!win?.get_compositor_private())
            return [];
        const out = [{ id: 'switch', label: 'Switch To', icon: 'media-playback-start-symbolic' }];
        if (win.minimized)
            out.push({ id: 'unminimize', label: 'Restore', icon: 'window-restore-symbolic' });
        else if (win.can_minimize())
            out.push({ id: 'minimize', label: 'Minimize', icon: 'window-minimize-symbolic' });
        const current = win.get_workspace()?.index() ?? -1;
        const count = global.workspace_manager.get_n_workspaces();
        if (!win.is_on_all_workspaces()) {
            for (let i = 0; i < count; i++) {
                if (i !== current)
                    out.push({ id: `move:${i}`, label: `Move to Workspace ${i + 1}`, icon: 'go-next-symbolic' });
            }
        }
        if (win.can_close())
            out.push({ id: 'close', label: 'Close', icon: 'window-close-symbolic' });
        return out;
    }

    runAction(result, actionId) {
        const win = this._live(result);
        if (actionId === 'switch') {
            Main.activateWindow(win);
        } else if (actionId === 'minimize') {
            win.minimize();
        } else if (actionId === 'unminimize') {
            win.unminimize();
            Main.activateWindow(win);
        } else if (actionId === 'close') {
            win.delete(global.get_current_time());
        } else if (actionId.startsWith('move:')) {
            const index = Number(actionId.slice('move:'.length));
            if (!Number.isInteger(index) || index < 0 || index >= global.workspace_manager.get_n_workspaces())
                throw new Error(`no workspace ${index + 1}`);
            win.change_workspace_by_index(index, false);
        } else {
            throw new Error(`unknown action ${actionId}`);
        }
    }
}
