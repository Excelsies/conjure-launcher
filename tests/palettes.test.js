// Color themes: every shipped palette is complete, valid and readable as the launcher draws it,
// and choosing / recognizing a palette round-trips through the theme settings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTES, DEFAULT_PALETTE_ID, FOLLOW_SYSTEM_ID, matchPalette, paletteValues } from '../prefs/palettes.js';
import { COLOR_TOKENS, UBUNTU, UBUNTU_ORANGE, parseColor, resolveTheme, systemDefaults } from '../lib/theme.js';

// WCAG 2.x relative luminance and contrast ratio, written here independently of the generator.
function luminance(hex) {
    const { r, g, b } = parseColor(hex);
    const lin = v => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
}

// The pairs the launcher actually draws: selected row, normal row, hovered row, secondary text.
const FLOOR = [['on-primary', 'primary', 4.5], ['on-surface', 'surface', 4.5], ['on-hover', 'hover', 4.5],
    ['on-surface', 'surface-container', 4.5], ['on-surface-variant', 'surface', 3.0]];

test('23 palettes: Ubuntu Light and Dark first, then Jeweltone, the Noctalia set and ten darker ones; ids unique', () => {
    assert.equal(PALETTES.length, 23);
    assert.deepEqual(PALETTES.slice(0, 2).map(p => p.id), ['ubuntu-light', 'ubuntu-dark']);
    assert.equal(PALETTES.filter(p => p.family === 'ubuntu').length, 2);
    assert.deepEqual(PALETTES.slice(2, 4).map(p => p.id), ['jeweltone', 'noctalia']);
    assert.deepEqual(PALETTES.filter(p => p.source === 'conjure').map(p => p.id), ['jeweltone']);
    assert.equal(PALETTES.filter(p => p.source === 'gogh').length, 10);
    assert.equal(new Set([...PALETTES.map(p => p.id), FOLLOW_SYSTEM_ID]).size, PALETTES.length + 1);
});

test('the default is Ubuntu following the system; with no system information that is Ubuntu Light, orange', () => {
    assert.equal(DEFAULT_PALETTE_ID, FOLLOW_SYSTEM_ID);
    assert.deepEqual({ ...COLOR_TOKENS }, { ...UBUNTU.light });
    assert.equal(UBUNTU.light['primary'], UBUNTU_ORANGE);
    assert.equal(UBUNTU.dark['primary'], UBUNTU_ORANGE);
});

// Ubuntu's accent colors as its GNOME Shell draws them: libst's table in gnome-shell 50.1-0ubuntu1.4, one pair
// per accent, [dark style, light style] (measured in a headless shell: purple is #7764d8 dark and #7360d7 light;
// blue and orange matched the dark column). Ubuntu draws white text on all of them.
const UBUNTU_ACCENTS = { blue: ['#0073e5', '#0070de'], teal: ['#308280', '#2e7e7c'], green: ['#4b8501', '#488001'],
    yellow: ['#9f6c00', '#9a6800'], orange: ['#d34615', '#cb4314'], red: ['#da3450', '#d82b48'],
    pink: ['#b34cb3', '#ae4aae'], purple: ['#7764d8', '#7360d7'], slate: ['#657b69', '#627766'],
    brown: ['#92714a', '#8c6c47'] };

test('Ubuntu Light and Dark meet the contrast floor with every Ubuntu accent', () => {
    for (const dark of [false, true]) {
        for (const [name, [darkAccent, lightAccent]] of Object.entries(UBUNTU_ACCENTS)) {
            const accent = dark ? darkAccent : lightAccent;
            const c = systemDefaults({ dark, accent, accentFg: '#ffffff' });
            // White everywhere except dark-style brown, 4.49:1 with white, which the floor gives black.
            assert.equal(c['on-primary'], dark && name === 'brown' ? '#000000' : '#ffffff', `${name}: text on the accent`);
            for (const [fg, bg, min] of FLOOR) {
                const ratio = contrast(c[fg], c[bg]);
                assert.ok(ratio >= min, `Ubuntu ${dark ? 'Dark' : 'Light'} + ${name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, under ${min}:1`);
            }
        }
    }
});

test('every palette has all nine roles as valid colors', () => {
    for (const p of PALETTES) {
        assert.deepEqual(Object.keys(p.colors).sort(), Object.keys(COLOR_TOKENS).sort(), p.name);
        assert.deepEqual(resolveTheme(p.colors).invalid, [], p.name);
    }
});

test('every palette meets the contrast floor as the launcher draws it', () => {
    for (const p of PALETTES) {
        for (const [fg, bg, min] of FLOOR) {
            const ratio = contrast(p.colors[fg], p.colors[bg]);
            assert.ok(ratio >= min, `${p.name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, under ${min}:1`);
        }
    }
});

test('choosing a palette, then reading it back, recognizes it', () => {
    for (const p of PALETTES)
        assert.equal(matchPalette(paletteValues(p.id)), p.id, p.name);
});

test('following the system is stored as empty values, and only all-empty values match it', () => {
    assert.ok(Object.values(paletteValues(FOLLOW_SYSTEM_ID)).every(v => v === ''));
    assert.deepEqual(Object.keys(paletteValues(FOLLOW_SYSTEM_ID)).sort(), Object.keys(COLOR_TOKENS).sort());
    assert.equal(matchPalette({}), FOLLOW_SYSTEM_ID);
    assert.equal(matchPalette(paletteValues(FOLLOW_SYSTEM_ID), systemDefaults({ dark: true })), FOLLOW_SYSTEM_ID);
    // One key set: not following; the empty rest read as the current defaults.
    const dark = systemDefaults({ dark: true });
    assert.equal(matchPalette({ ...paletteValues(FOLLOW_SYSTEM_ID), surface: UBUNTU.dark['surface'] }, dark), 'ubuntu-dark');
    assert.equal(matchPalette({ surface: '#123456' }, dark), null);
});

test('every palette, Noctalia included, is stored as its hex values', () => {
    for (const p of PALETTES)
        assert.deepEqual(paletteValues(p.id), { ...p.colors }, p.name);
});

test('a hand-picked color makes it Custom (no match); matching ignores case and spaces', () => {
    const dracula = paletteValues('dracula');
    assert.equal(matchPalette({ ...dracula, primary: '#123456' }), null);
    assert.equal(matchPalette(Object.fromEntries(Object.entries(dracula).map(([k, v]) => [k, ` ${v.toUpperCase()} `]))), 'dracula');
    assert.throws(() => paletteValues('nope'));
});

test('the added themes are darker than the median of the original set', () => {
    const lum = p => luminance(p.colors['surface']);
    const original = PALETTES.filter(p => !p.source && !p.family).map(lum).sort((a, b) => a - b);
    assert.equal(original.length, 10);
    const median = original[Math.floor(original.length / 2)];
    for (const p of PALETTES.filter(x => x.source === 'gogh'))
        assert.ok(lum(p) < median, `${p.name} background is not darker than the original median`);
});

// The README theme gallery and the screenshot script that renders it show themes in the order the
// Settings → Appearance list shows them (PALETTES order; System appears as System Light).
test('the README theme gallery and the screenshot script follow the theme list order', () => {
    const read = rel => readFileSync(new URL(`../${rel}`, import.meta.url), 'utf8');
    const readme = [...read('README.md').matchAll(/docs\/screenshots\/theme-([a-z0-9-]+)\.png/g)].map(m => m[1]);
    const block = read('tools/screenshots-script.js').match(/for \(const id of \[([^\]]*)\]\)/);
    assert.ok(block, 'the screenshot script has no theme gallery loop');
    const script = [...block[1].matchAll(/'([a-z0-9-]+)'/g)].map(m => m[1]);
    assert.ok(readme.length >= 2 && script.length >= 2, `found ${readme.length} README and ${script.length} script themes`);
    assert.deepEqual(readme, script);
    const order = id => {
        const i = PALETTES.findIndex(p => p.id === id);
        assert.ok(i >= 0, `${id} is not a theme`);
        return i;
    };
    const indexes = readme.map(order);
    assert.deepEqual(indexes, [...indexes].sort((a, b) => a - b), `out of order: ${readme.join(', ')}`);
});
