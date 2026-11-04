// Session actions: "/session" (lock, log out, suspend, switch user, restart, power off) through
// GNOME's own SystemActions, so each shows GNOME's usual confirmation where it has one.

import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

import { searchSession, SESSION_ACTIONS } from '../lib/session.js';

export class SessionProvider {
    constructor() {
        this.id = 'session';
        this.trigger = 'session';
        this.displayName = 'Session actions';
        this.icon = 'system-shutdown-symbolic';
        this.trackUsage = false;
        this._actions = SystemActions.getDefault();
    }

    query(text) {
        return searchSession(text, a => Boolean(this._actions[a.can]));
    }

    activate(result) {
        const action = SESSION_ACTIONS.find(a => a.id === result.id);
        if (!action)
            throw new Error(`unknown session action ${result.id}`);
        this._actions[action.run]();
    }
}
