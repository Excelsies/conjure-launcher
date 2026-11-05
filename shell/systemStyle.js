// The system's light/dark style and accent colour, as GNOME Shell itself uses them (decision D18).
// The empty theme keys resolve against this, so the default Ubuntu theme follows the system live.
import St from 'gi://St';

const hex = c => `#${[c.red, c.green, c.blue].map(v => v.toString(16).padStart(2, '0')).join('')}`;

export class SystemStyle {
    /**
     * @param {{onChange: () => void, logError: (m: string, e?: unknown) => void}} opts
     */
    constructor({ onChange, logError }) {
        this._logError = logError;
        this._loggedAccentFailure = false;
        this._settings = St.Settings.get();
        // Measured on GNOME Shell 50: inside notify::accent-color the theme context already holds
        // the new accent, so no later signal is needed.
        this._ids = ['notify::color-scheme', 'notify::accent-color']
            .map(signal => this._settings.connect(signal, () => onChange()));
    }

    /** @returns {{dark: boolean, accent: string|null, accentFg: string|null}} */
    get() {
        // Ubuntu's Appearance "Dark" writes prefer-dark and "Light" writes default; anything but
        // prefer-dark is light.
        const dark = this._settings.color_scheme === St.SystemColorScheme.PREFER_DARK;
        try {
            const [accent, fg] = St.ThemeContext.get_for_stage(global.stage).get_accent_color();
            return { dark, accent: hex(accent), accentFg: hex(fg) };
        } catch (e) {
            // Fall back to Ubuntu orange (systemDefaults), logged once; the panel still opens.
            if (!this._loggedAccentFailure)
                this._logError('could not read the system accent colour; using Ubuntu orange', e);
            this._loggedAccentFailure = true;
            return { dark, accent: null, accentFg: null };
        }
    }

    destroy() {
        for (const id of this._ids)
            this._settings.disconnect(id);
        this._ids = [];
    }
}
