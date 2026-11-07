// The system's light/dark style and accent color, as GNOME Shell itself uses them.
// Empty theme keys resolve against these, so the System theme follows the system live.
import St from 'gi://St';

const hex = c => `#${[c.red, c.green, c.blue].map(v => v.toString(16).padStart(2, '0')).join('')}`;

export class SystemStyle {
    /** @param {{onChange: () => void}} opts */
    constructor({ onChange }) {
        this._settings = St.Settings.get();
        // The theme context already holds the new accent when notify::accent-color fires.
        this._ids = ['notify::color-scheme', 'notify::accent-color']
            .map(signal => this._settings.connect(signal, () => onChange()));
    }

    /** @returns {{dark: boolean, accent: string, accentFg: string}} */
    get() {
        // Appearance "Dark" writes prefer-dark and "Light" writes default; anything but prefer-dark is light.
        const dark = this._settings.color_scheme === St.SystemColorScheme.PREFER_DARK;
        const [accent, fg] = St.ThemeContext.get_for_stage(global.stage).get_accent_color();
        return { dark, accent: hex(accent), accentFg: hex(fg) };
    }

    destroy() {
        for (const id of this._ids)
            this._settings.disconnect(id);
        this._ids = [];
    }
}
