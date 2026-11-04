// Pure helpers for prefs.js (kept here so node can test them).

import { parseColour } from './theme.js';

function hex2(n) {
    return Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
}

/**
 * GTK colour (channels 0..1) to the hex form the theme keys store. Opaque colours use
 * #rrggbb; translucent ones #rrggbbaa.
 */
export function rgbaToHex({ red, green, blue, alpha = 1 }) {
    const base = `#${hex2(red * 255)}${hex2(green * 255)}${hex2(blue * 255)}`;
    return alpha >= 0.999 ? base : `${base}${hex2(alpha * 255)}`;
}

/** Theme hex (or empty = default) to GTK channels 0..1, using the fallback when empty/invalid. */
export function hexToRgba(value, fallbackHex) {
    const c = parseColour(value) ?? parseColour(fallbackHex);
    return { red: c.r / 255, green: c.g / 255, blue: c.b / 255, alpha: c.a };
}

/** The colours a theme preview shows, in order: accent, background, field, text, hover. */
export const SWATCH_ROLES = Object.freeze(['primary', 'surface', 'surface-container', 'on-surface', 'hover']);

/**
 * Pango markup for a row of colour swatches (each a coloured block of two em spaces). Values that
 * are not valid colours are skipped, so nothing user-supplied can reach the markup unparsed.
 * @param {Record<string, string>} colours  role -> hex
 */
export function swatchMarkup(colours) {
    return SWATCH_ROLES
        .map(role => parseColour(colours[role]))
        .filter(Boolean)
        .map(({ r, g, b }) => `<span background="#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}">\u2003\u2003</span>`)
        .join(' ');
}
