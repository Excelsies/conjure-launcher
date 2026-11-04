// Theme tokens (docs/theming.md). Every colour, radius and font in the UI is derived here, so
// an integration that writes the theme-* GSettings keys restyles the whole panel.

export const COLOUR_TOKENS = Object.freeze({
    'primary': '#fff59b',
    'on-primary': '#0e0e43',
    'surface': '#070722',
    'surface-container': '#11112d',
    'on-surface': '#f3edf7',
    'on-surface-variant': '#7c80b4',
    'outline-variant': '#21215f',
    'hover': '#9bfece',
    'on-hover': '#0e0e43',
});

export const RADIUS = Object.freeze({ sm: 3, md: 6, lg: 9, xl: 12 });
export const RADIUS_SCALE_MAX = 3;

/**
 * Parse #rgb, #rrggbb or #rrggbbaa. Returns null for anything else.
 * @returns {{r: number, g: number, b: number, a: number} | null}
 */
export function parseColour(value) {
    if (typeof value !== 'string')
        return null;
    const v = value.trim();
    let m = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(v);
    if (m)
        return { r: parseInt(m[1] + m[1], 16), g: parseInt(m[2] + m[2], 16), b: parseInt(m[3] + m[3], 16), a: 1 };
    m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})?$/i.exec(v);
    if (m) {
        return {
            r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16),
            a: m[4] === undefined ? 1 : Math.round(parseInt(m[4], 16) / 255 * 1000) / 1000,
        };
    }
    return null;
}

/** St's CSS parser understands rgba(); it does not accept 8-digit hex. */
export function toCss({ r, g, b, a }, alphaMultiplier = 1) {
    const alpha = Math.round(a * alphaMultiplier * 1000) / 1000;
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Resolve settings values into a complete token set. A missing or empty value uses the
 * default; an invalid one also uses the default and is reported, so the caller can log the
 * key name. Never throws.
 * @param {Record<string, unknown>} values  keyed by token name (without "theme-")
 * @returns {{colours: Record<string, {r,g,b,a}>, radiusScale: number, fontFamily: string,
 *            invalid: string[]}}
 */
export function resolveTheme(values = {}) {
    const colours = {};
    const invalid = [];
    for (const [name, fallback] of Object.entries(COLOUR_TOKENS)) {
        const raw = values[name];
        let c = null;
        if (typeof raw === 'string' && raw.trim() !== '') {
            c = parseColour(raw);
            if (!c)
                invalid.push(name);
        }
        colours[name] = c ?? parseColour(fallback);
    }

    let radiusScale = values['radius-scale'];
    if (typeof radiusScale !== 'number' || !Number.isFinite(radiusScale) ||
        radiusScale < 0 || radiusScale > RADIUS_SCALE_MAX) {
        if (radiusScale !== undefined)
            invalid.push('radius-scale');
        radiusScale = 1;
    }

    let fontFamily = values['font-family'];
    // Reject anything that could break out of the CSS declaration it is placed in.
    if (typeof fontFamily !== 'string' || /[;{}:"\\\n\r]/.test(fontFamily)) {
        if (fontFamily !== undefined)
            invalid.push('font-family');
        fontFamily = '';
    }

    return { colours, radiusScale, fontFamily: fontFamily.trim(), invalid };
}

function radius(theme, size) {
    return Math.round(RADIUS[size] * theme.radiusScale * 10) / 10;
}

function font(theme) {
    return theme.fontFamily ? ` font-family: "${theme.fontFamily}";` : '';
}

/**
 * Inline style strings for each themed element. St has no CSS variables, so the UI applies
 * these with actor.set_style() and re-applies them when a token changes.
 */
export function styles(theme) {
    const c = theme.colours;
    return {
        panel: `background-color: ${toCss(c['surface'])}; border: 1px solid ${toCss(c['outline-variant'])}; ` +
            `border-radius: ${radius(theme, 'xl')}px; padding: 8px; color: ${toCss(c['on-surface'])};${font(theme)}`,
        toolbar: `background-color: ${toCss(c['surface-container'])}; border: 1px solid ${toCss(c['outline-variant'])}; ` +
            `border-radius: ${radius(theme, 'lg')}px; padding: 14px;`,
        entry: `color: ${toCss(c['on-surface'])}; caret-color: ${toCss(c['primary'])}; ` +
            `selection-background-color: ${toCss(c['primary'], 0.35)}; selected-color: ${toCss(c['on-surface'])}; ` +
            `background-color: transparent; border: none; box-shadow: none; font-size: 14px;${font(theme)}`,
        entryHint: `color: ${toCss(c['on-surface-variant'])};`,
        row: `border-radius: ${radius(theme, 'md')}px; padding: 4px 8px; background-color: transparent;`,
        rowHover: `border-radius: ${radius(theme, 'md')}px; padding: 4px 8px; background-color: ${toCss(c['hover'])};`,
        rowSelected: `border-radius: ${radius(theme, 'md')}px; padding: 4px 8px; background-color: ${toCss(c['primary'])};`,
        title: `color: ${toCss(c['on-surface'])}; font-size: 14px; font-weight: 600;`,
        titleHover: `color: ${toCss(c['on-hover'])}; font-size: 14px; font-weight: 600;`,
        titleSelected: `color: ${toCss(c['on-primary'])}; font-size: 14px; font-weight: 600;`,
        subtitle: `color: ${toCss(c['on-surface-variant'])}; font-size: 13px;`,
        subtitleHover: `color: ${toCss(c['on-hover'], 0.7)}; font-size: 13px;`,
        subtitleSelected: `color: ${toCss(c['on-primary'], 0.7)}; font-size: 13px;`,
        empty: `color: ${toCss(c['on-surface-variant'])}; font-size: 14px; padding: 24px;`,
        tab: `border-radius: ${radius(theme, 'md')}px; padding: 6px 10px; background-color: transparent;`,
        tabActive: `border-radius: ${radius(theme, 'md')}px; padding: 6px 10px; background-color: ${toCss(c['primary'])};`,
        tabText: `color: ${toCss(c['on-surface-variant'])}; font-size: 13px;`,
        tabTextActive: `color: ${toCss(c['on-primary'])}; font-size: 13px; font-weight: 600;`,
        chip: `border-radius: ${radius(theme, 'lg')}px; padding: 4px 10px; border: 1px solid ${toCss(c['outline-variant'])}; ` +
            `color: ${toCss(c['on-surface-variant'])}; background-color: transparent; font-size: 12px;`,
        chipActive: `border-radius: ${radius(theme, 'lg')}px; padding: 4px 10px; border: 1px solid ${toCss(c['primary'])}; ` +
            `color: ${toCss(c['on-surface'])}; background-color: ${toCss(c['surface-container'])}; font-size: 12px;`,
    };
}
