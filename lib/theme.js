// Theme tokens (docs/theming.md). Every colour, radius and font in the UI is derived here, so
// an integration that writes the theme-* GSettings keys restyles the whole panel.

/** Ubuntu's own orange as GNOME Shell draws it (Ubuntu's St), tuned for white text. Not the brand #E95420. */
export const UBUNTU_ORANGE = '#d34615';

/**
 * Ubuntu's look (decision D18), from the Yaru GNOME Shell theme (gnome-shell.css, popup menu and entry):
 * light from Yaru, dark from Yaru-dark. Hover is Yaru's 10% overlay flattened onto the surface.
 */
export const UBUNTU = Object.freeze({
    light: Object.freeze({
        'primary': UBUNTU_ORANGE,
        'on-primary': '#ffffff',
        'surface': '#ffffff',
        'surface-container': '#ededed',
        'on-surface': '#222222',
        'on-surface-variant': '#7b7b7b',
        'outline-variant': '#ededed',
        'hover': '#e9e9e9',
        'on-hover': '#222222',
    }),
    dark: Object.freeze({
        'primary': UBUNTU_ORANGE,
        'on-primary': '#ffffff',
        'surface': '#36363a',
        'surface-container': '#414144',
        'on-surface': '#ffffff',
        'on-surface-variant': '#9b9b9d',
        'outline-variant': '#424247',
        'hover': '#4e4e52',
        'on-hover': '#ffffff',
    }),
});

/**
 * The colour roles, with the defaults used when nothing is known about the system (Ubuntu Light,
 * orange). At runtime the defaults come from systemDefaults().
 */
export const COLOUR_TOKENS = UBUNTU.light;

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

/** WCAG 2.x contrast ratio of two opaque colours (alpha ignored). */
export function contrastRatio(a, b) {
    const lum = ({ r, g, b: bl }) => {
        const lin = v => {
            const c = v / 255;
            return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
    };
    const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

function toHex({ r, g, b }) {
    return `#${[r, g, b].map(v => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Text colour for a fill: the preferred colour if it reaches 4.5:1, otherwise white if that does,
 * otherwise black (black or white always reaches 4.58:1 on an opaque fill).
 */
export function textOn(fillHex, preferredHex) {
    const fill = parseColour(fillHex);
    for (const candidate of [preferredHex, '#ffffff']) {
        const c = parseColour(candidate);
        if (c && contrastRatio(c, fill) >= 4.5)
            return toHex(c);
    }
    return '#000000';
}

/**
 * The built-in defaults for the empty theme keys: Ubuntu, following the system (D18).
 * @param {{dark?: boolean, accent?: string|null, accentFg?: string|null}} system
 *   dark: the system prefers dark; accent / accentFg: the accent the shell draws, as #rrggbb.
 *   An accent that does not parse falls back to Ubuntu orange.
 */
export function systemDefaults({ dark = false, accent = null, accentFg = null } = {}) {
    const base = dark ? UBUNTU.dark : UBUNTU.light;
    const a = parseColour(accent ?? '');
    if (!a)
        return base;
    const primary = toHex(a);
    return Object.freeze({ ...base, 'primary': primary, 'on-primary': textOn(primary, accentFg) });
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
 * @param {Record<string, string>} defaults  the value for each empty token (systemDefaults())
 * @returns {{colours: Record<string, {r,g,b,a}>, radiusScale: number, fontFamily: string,
 *            invalid: string[]}}
 */
export function resolveTheme(values = {}, defaults = COLOUR_TOKENS) {
    const colours = {};
    const invalid = [];
    for (const name of Object.keys(COLOUR_TOKENS)) {
        const fallback = defaults[name] ?? COLOUR_TOKENS[name];
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
