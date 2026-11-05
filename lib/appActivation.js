// What Enter or a click does with an app that is already open (setting running-app-action): open a new window
// (the default) or switch to it. Ctrl+Enter and middle-click do the other one. An app that is not running starts
// either way, and one that cannot open a second window switches (providers/apps.js).

export const RUNNING_APP_ACTIONS = Object.freeze(['new-window', 'switch']);

/**
 * @param {string} setting  running-app-action ('new-window' or 'switch'; anything else means the default)
 * @param {boolean} alternate  Ctrl or middle-click was held
 * @returns {boolean} whether to ask for a new window
 */
export function wantsNewWindow(setting, alternate) {
    const byDefault = setting !== 'switch';
    return alternate ? !byDefault : byDefault;
}
