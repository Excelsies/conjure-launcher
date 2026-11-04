// GSettings adapters for lib/takeover.js. set* return false when the key is not writable
// (an administrator lock); GSettings itself returns false from set_* in that case.

import Gio from 'gi://Gio';

export const GNOME_KEYBINDINGS_SCHEMA = 'org.gnome.shell.keybindings';
export const GNOME_APP_VIEW_KEY = 'toggle-application-view';

export function gnomeAppViewAdapter(settings = new Gio.Settings({ schema_id: GNOME_KEYBINDINGS_SCHEMA })) {
    return {
        get: () => settings.get_strv(GNOME_APP_VIEW_KEY),
        set: v => settings.is_writable(GNOME_APP_VIEW_KEY) && settings.set_strv(GNOME_APP_VIEW_KEY, v),
    };
}

export function savedBindingAdapter(settings) {
    return {
        getSaved: () => settings.get_strv('saved-toggle-application-view'),
        setSaved: v => settings.is_writable('saved-toggle-application-view') &&
            settings.set_strv('saved-toggle-application-view', v),
        hasSaved: () => settings.get_boolean('has-saved-toggle-application-view'),
        setHasSaved: b => settings.is_writable('has-saved-toggle-application-view') &&
            settings.set_boolean('has-saved-toggle-application-view', b),
    };
}
