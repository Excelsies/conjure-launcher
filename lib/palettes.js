// Colour themes for the launcher (decision D17). Ten dark palettes from Noctalia's
// src/theme/builtin_palettes.cpp @ 60861c9 (MIT; see THIRD_PARTY_NOTICES.md), reduced to the nine roles the
// launcher uses. Generated, then checked by tests/palettes.test.js (contrast floor on every palette).
// Light variants are not included: as the launcher draws them, each fails a contrast pair.
// Ten darker themes follow, from Gogh terminal palettes (background, foreground, 16 ANSI colours), mapped
// to the nine roles by one rule: surface = background, on-surface = foreground, accent = ANSI blue,
// hover = ANSI cyan, field = background mixed 7% toward foreground, borders = 16%, secondary text =
// ANSI bright black (or a 55% mix when that is under 3:1), and text on accent/hover by the rule below.
// Correction rule for text that is under 4.5:1 on its fill: the palette's own text colour (surface or
// on-surface) with the best contrast if one reaches 4.5:1, otherwise black or white. Applied:
//   Nord: on-hover #2e3440 -> #000000 (3.10:1 -> 5.21:1 on hover #5e81ac)

export const PALETTES = Object.freeze([
    Object.freeze({ id: 'noctalia', name: 'Noctalia', colours: Object.freeze({ 'primary': '#fff59b', 'on-primary': '#0e0e43', 'surface': '#070722', 'surface-container': '#11112d', 'on-surface': '#f3edf7', 'on-surface-variant': '#7c80b4', 'outline-variant': '#21215f', 'hover': '#9bfece', 'on-hover': '#0e0e43' }) }),
    Object.freeze({ id: 'ayu', name: 'Ayu', colours: Object.freeze({ 'primary': '#e6b450', 'on-primary': '#0b0e14', 'surface': '#0b0e14', 'surface-container': '#1e222a', 'on-surface': '#d1d1c7', 'on-surface-variant': '#8e959e', 'outline-variant': '#565b66', 'hover': '#39bae6', 'on-hover': '#0b0e14' }) }),
    Object.freeze({ id: 'catppuccin', name: 'Catppuccin', colours: Object.freeze({ 'primary': '#cba6f7', 'on-primary': '#11111b', 'surface': '#1e1e2e', 'surface-container': '#313244', 'on-surface': '#cdd6f4', 'on-surface-variant': '#a3b4eb', 'outline-variant': '#4c4f69', 'hover': '#94e2d5', 'on-hover': '#11111b' }) }),
    Object.freeze({ id: 'dracula', name: 'Dracula', colours: Object.freeze({ 'primary': '#bd93f9', 'on-primary': '#282a36', 'surface': '#282a36', 'surface-container': '#44475a', 'on-surface': '#f8f8f2', 'on-surface-variant': '#d6d8e0', 'outline-variant': '#5a5e77', 'hover': '#8be9fd', 'on-hover': '#003543' }) }),
    Object.freeze({ id: 'eldritch', name: 'Eldritch', colours: Object.freeze({ 'primary': '#37f499', 'on-primary': '#171928', 'surface': '#212337', 'surface-container': '#292e42', 'on-surface': '#ebfafa', 'on-surface-variant': '#abb4da', 'outline-variant': '#3b4261', 'hover': '#a48cf2', 'on-hover': '#171928' }) }),
    Object.freeze({ id: 'gruvbox', name: 'Gruvbox', colours: Object.freeze({ 'primary': '#b8bb26', 'on-primary': '#282828', 'surface': '#282828', 'surface-container': '#3c3836', 'on-surface': '#fbf1c7', 'on-surface-variant': '#ebdbb2', 'outline-variant': '#57514e', 'hover': '#83a598', 'on-hover': '#282828' }) }),
    Object.freeze({ id: 'kanagawa', name: 'Kanagawa', colours: Object.freeze({ 'primary': '#76946a', 'on-primary': '#1f1f28', 'surface': '#1f1f28', 'surface-container': '#2a2a37', 'on-surface': '#c8c093', 'on-surface-variant': '#717c7c', 'outline-variant': '#363646', 'hover': '#7e9cd8', 'on-hover': '#1f1f28' }) }),
    Object.freeze({ id: 'nord', name: 'Nord', colours: Object.freeze({ 'primary': '#8fbcbb', 'on-primary': '#2e3440', 'surface': '#2e3440', 'surface-container': '#3b4252', 'on-surface': '#eceff4', 'on-surface-variant': '#d8dee9', 'outline-variant': '#505a70', 'hover': '#5e81ac', 'on-hover': '#000000' }) }),
    Object.freeze({ id: 'rose-pine', name: 'Rosé Pine', colours: Object.freeze({ 'primary': '#ebbcba', 'on-primary': '#191724', 'surface': '#191724', 'surface-container': '#26233a', 'on-surface': '#e0def4', 'on-surface-variant': '#908caa', 'outline-variant': '#403d52', 'hover': '#524f67', 'on-hover': '#e0def4' }) }),
    Object.freeze({ id: 'tokyo-night', name: 'Tokyo Night', colours: Object.freeze({ 'primary': '#7aa2f7', 'on-primary': '#16161e', 'surface': '#1a1b26', 'surface-container': '#24283b', 'on-surface': '#c0caf5', 'on-surface-variant': '#9aa5ce', 'outline-variant': '#353d57', 'hover': '#9ece6a', 'on-hover': '#16161e' }) }),
    // Darker themes (owner request, 2026-11-04): from the Gogh collection as bundled with Ptyxis 50.1
    // (MIT/Apache-2.0; see THIRD_PARTY_NOTICES.md), mapped by the rule in the header. Darkest first.
    Object.freeze({ id: 'one-half-black', name: 'One Half Black', source: 'gogh', colours: Object.freeze({ 'primary': '#61afef', 'on-primary': '#000000', 'surface': '#000000', 'surface-container': '#0f1010', 'on-surface': '#dcdfe4', 'on-surface-variant': '#797b7d', 'outline-variant': '#232424', 'hover': '#56b6c2', 'on-hover': '#000000' }) }),
    Object.freeze({ id: 'moonfly', name: 'Moonfly', source: 'gogh', colours: Object.freeze({ 'primary': '#80a0ff', 'on-primary': '#080808', 'surface': '#080808', 'surface-container': '#151515', 'on-surface': '#bdbdbd', 'on-surface-variant': '#949494', 'outline-variant': '#252525', 'hover': '#79dac8', 'on-hover': '#080808' }) }),
    Object.freeze({ id: 'gotham', name: 'Gotham', source: 'gogh', colours: Object.freeze({ 'primary': '#195465', 'on-primary': '#98d1ce', 'surface': '#0a0f14', 'surface-container': '#141d21', 'on-surface': '#98d1ce', 'on-surface-variant': '#587a7a', 'outline-variant': '#212e32', 'hover': '#33859d', 'on-hover': '#0a0f14' }) }),
    Object.freeze({ id: 'jellybeans', name: 'Jellybeans', source: 'gogh', colours: Object.freeze({ 'primary': '#97bedc', 'on-primary': '#121212', 'surface': '#121212', 'surface-container': '#202020', 'on-surface': '#dedede', 'on-surface-variant': '#bdbdbd', 'outline-variant': '#333333', 'hover': '#00988e', 'on-hover': '#121212' }) }),
    Object.freeze({ id: 'night-owl', name: 'Night Owl', source: 'gogh', colours: Object.freeze({ 'primary': '#82aaff', 'on-primary': '#011627', 'surface': '#011627', 'surface-container': '#102435', 'on-surface': '#d6deeb', 'on-surface-variant': '#768493', 'outline-variant': '#233646', 'hover': '#21c7a8', 'on-hover': '#011627' }) }),
    Object.freeze({ id: 'aura', name: 'Aura', source: 'gogh', colours: Object.freeze({ 'primary': '#a277ff', 'on-primary': '#15141b', 'surface': '#15141b', 'surface-container': '#24232a', 'on-surface': '#edecee', 'on-surface-variant': '#6d6d6d', 'outline-variant': '#38373d', 'hover': '#61ffca', 'on-hover': '#15141b' }) }),
    Object.freeze({ id: 'oxocarbon-dark', name: 'Oxocarbon', source: 'gogh', colours: Object.freeze({ 'primary': '#33b1ff', 'on-primary': '#161616', 'surface': '#161616', 'surface-container': '#262626', 'on-surface': '#ffffff', 'on-surface-variant': '#969696', 'outline-variant': '#3b3b3b', 'hover': '#3ddbd9', 'on-hover': '#161616' }) }),
    Object.freeze({ id: 'oceanic-next', name: 'Oceanic Next', source: 'gogh', colours: Object.freeze({ 'primary': '#5486c0', 'on-primary': '#121b21', 'surface': '#121b21', 'surface-container': '#1d262c', 'on-surface': '#b3b8c3', 'on-surface-variant': '#6b717a', 'outline-variant': '#2c343b', 'hover': '#50a5a4', 'on-hover': '#121b21' }) }),
    Object.freeze({ id: 'molokai', name: 'Molokai', source: 'gogh', colours: Object.freeze({ 'primary': '#d08010', 'on-primary': '#1b1d1e', 'surface': '#1b1d1e', 'surface-container': '#262829', 'on-surface': '#bbbbbb', 'on-surface-variant': '#737474', 'outline-variant': '#353637', 'hover': '#d0a843', 'on-hover': '#1b1d1e' }) }),
    Object.freeze({ id: 'tomorrow-night', name: 'Tomorrow Night', source: 'gogh', colours: Object.freeze({ 'primary': '#81a2be', 'on-primary': '#1d1f21', 'surface': '#1d1f21', 'surface-container': '#292b2d', 'on-surface': '#c5c8c6', 'on-surface-variant': '#797c7c', 'outline-variant': '#383a3b', 'hover': '#8abeb7', 'on-hover': '#1d1f21' }) }),
]);

export const DEFAULT_PALETTE_ID = 'noctalia';

/**
 * Which palette the current token values match, or null ("Custom"). Empty values mean the
 * built-in default (Noctalia), matching how the theme keys are read.
 * @param {Record<string, string>} values  token name (without "theme-") -> setting value
 */
export function matchPalette(values) {
    const def = PALETTES.find(p => p.id === DEFAULT_PALETTE_ID).colours;
    const effective = name => (values[name] ?? '').trim().toLowerCase() || def[name];
    const found = PALETTES.find(p => Object.entries(p.colours).every(([name, hex]) => effective(name) === hex));
    return found?.id ?? null;
}

/**
 * The setting values that select a palette. Noctalia writes empty values (the built-in default,
 * so a future default change still applies); others write their hex values.
 */
export function paletteValues(id) {
    const p = PALETTES.find(x => x.id === id);
    if (!p)
        throw new Error(`unknown palette ${id}`);
    return Object.fromEntries(Object.entries(p.colours).map(([name, hex]) => [name, id === DEFAULT_PALETTE_ID ? '' : hex]));
}
