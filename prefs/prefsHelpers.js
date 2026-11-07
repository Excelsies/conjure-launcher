// Pure helpers for prefs.js (kept here so node can test them).

import { parseColor } from '../lib/theme.js';
import { FOLLOW_SYSTEM_ID, PALETTES } from './palettes.js';

const UBUNTU_IDS = Object.freeze([FOLLOW_SYSTEM_ID, ...PALETTES.filter(p => p.family === 'ubuntu').map(p => p.id)]);

function hex2(n) {
    return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
}

/**
 * GTK color (channels 0..1) to the hex form the theme keys store. Opaque colors use
 * #rrggbb; translucent ones #rrggbbaa.
 */
export function rgbaToHex({ red, green, blue, alpha = 1 }) {
    const base = `#${hex2(red * 255)}${hex2(green * 255)}${hex2(blue * 255)}`;
    return alpha >= 0.999 ? base : `${base}${hex2(alpha * 255)}`;
}

/** Theme hex (or empty = default) to GTK channels 0..1, using the fallback when empty/invalid. */
export function hexToRgba(value, fallbackHex) {
    const c = parseColor(value) ?? parseColor(fallbackHex);
    return { red: c.r / 255, green: c.g / 255, blue: c.b / 255, alpha: c.a };
}

/** The colors a theme preview shows, in order: accent, background, field, text, hover. */
export const SWATCH_ROLES = Object.freeze(['primary', 'surface', 'surface-container', 'on-surface', 'hover']);

/**
 * Pango markup for a row of color swatches (each a colored block of two em spaces). Values that
 * are not valid colors are skipped, so nothing user-supplied can reach the markup unparsed.
 * @param {Record<string, string>} colors  role -> hex
 */
export function swatchMarkup(colors) {
    return SWATCH_ROLES
        .map(role => parseColor(colors[role]))
        .filter(Boolean)
        .map(({ r, g, b }) => `<span background="#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}">\u2003\u2003</span>`)
        .join(' ');
}

/**
 * The Ubuntu controls in Settings → Appearance for the theme the keys currently select.
 * @param {string|null} id  matchPalette() of the current values
 * @returns {{ubuntu: boolean, follow: boolean, styleVisible: boolean, styleDark: boolean}}
 *   ubuntu: "System" is the ticked entry and the follow switch is shown; follow: the switch is on;
 *   styleVisible: the Light / Dark row is shown; styleDark: it shows Dark.
 */
export function ubuntuControls(id) {
    const ubuntu = UBUNTU_IDS.includes(id);
    return { ubuntu, follow: id === FOLLOW_SYSTEM_ID, styleVisible: ubuntu && id !== FOLLOW_SYSTEM_ID, styleDark: id === 'ubuntu-dark' };
}

/**
 * The theme to write when the follow switch is flipped: on follows the system; off fixes the variant
 * the system shows now (with Ubuntu orange).
 */
export function themeForFollow(on, systemDark) {
    if (on)
        return FOLLOW_SYSTEM_ID;
    return systemDark ? 'ubuntu-dark' : 'ubuntu-light';
}
