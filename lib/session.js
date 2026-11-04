// Session actions (/session), with Noctalia's search aliases
// (src/launcher/session_provider.cpp aliasesForAction @ 60861c9) plus switch user.

import { score as fuzzy, isMatch } from './fzy.js';

export const SESSION_ACTIONS = Object.freeze([
    { id: 'lock', title: 'Lock Screen', icon: 'system-lock-screen-symbolic', aliases: 'lock screen session', can: 'canLockScreen', run: 'activateLockScreen' },
    { id: 'logout', title: 'Log Out', icon: 'system-log-out-symbolic', aliases: 'logout log out sign out exit session', can: 'canLogout', run: 'activateLogout' },
    { id: 'suspend', title: 'Suspend', icon: 'weather-clear-night-symbolic', aliases: 'suspend sleep pause', can: 'canSuspend', run: 'activateSuspend' },
    { id: 'switch-user', title: 'Switch User', icon: 'system-switch-user-symbolic', aliases: 'switch user change user', can: 'canSwitchUser', run: 'activateSwitchUser' },
    { id: 'restart', title: 'Restart', icon: 'system-reboot-symbolic', aliases: 'reboot restart', can: 'canRestart', run: 'activateRestart' },
    { id: 'power-off', title: 'Power Off', icon: 'system-shutdown-symbolic', aliases: 'shutdown shut down power off poweroff', can: 'canPowerOff', run: 'activatePowerOff' },
]);

/**
 * @param {string} text
 * @param {(action) => boolean} available  e.g. a => systemActions[a.can]
 */
export function searchSession(text, available) {
    const query = text.trim().toLowerCase();
    const out = [];
    SESSION_ACTIONS.forEach((a, i) => {
        if (!available(a))
            return;
        let s;
        if (query) {
            s = Math.max(fuzzy(query, a.title.toLowerCase()) * 2, fuzzy(query, a.aliases));
            if (!isMatch(s))
                return;
        } else {
            s = -i;  // fixed order when browsing
        }
        out.push({ id: a.id, title: a.title, subtitle: 'Session', iconName: a.icon, score: s });
    });
    return out.sort((x, y) => y.score - x.score);
}
