// Colour themes (D17): every shipped palette is complete, valid and readable as the launcher draws it,
// and choosing / recognising a palette round-trips through the theme settings.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PALETTES, DEFAULT_PALETTE_ID, matchPalette, paletteValues } from '../lib/palettes.js';
import { COLOUR_TOKENS, parseColour, resolveTheme } from '../lib/theme.js';

// WCAG 2.x relative luminance and contrast ratio, written here independently of the generator.
function luminance(hex) {
    const { r, g, b } = parseColour(hex);
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

test('twenty palettes (Noctalia set plus ten darker ones), the current one first, ids unique', () => {
    assert.equal(PALETTES.length, 20);
    assert.equal(PALETTES.filter(p => p.source === 'gogh').length, 10);
    assert.equal(PALETTES[0].id, DEFAULT_PALETTE_ID);
    assert.equal(new Set(PALETTES.map(p => p.id)).size, PALETTES.length);
});

test('the Noctalia palette is exactly the built-in default', () => {
    assert.deepEqual({ ...PALETTES[0].colours }, { ...COLOUR_TOKENS });
});

test('every palette has all nine roles as valid colours', () => {
    for (const p of PALETTES) {
        assert.deepEqual(Object.keys(p.colours).sort(), Object.keys(COLOUR_TOKENS).sort(), p.name);
        assert.deepEqual(resolveTheme(p.colours).invalid, [], p.name);
    }
});

test('every palette meets the contrast floor as the launcher draws it', () => {
    for (const p of PALETTES) {
        for (const [fg, bg, min] of FLOOR) {
            const ratio = contrast(p.colours[fg], p.colours[bg]);
            assert.ok(ratio >= min, `${p.name}: ${fg} on ${bg} is ${ratio.toFixed(2)}:1, under ${min}:1`);
        }
    }
});

test('choosing a palette, then reading it back, recognises it', () => {
    for (const p of PALETTES)
        assert.equal(matchPalette(paletteValues(p.id)), p.id, p.name);
});

test('Noctalia is stored as empty values (the default), so empty settings match it', () => {
    assert.ok(Object.values(paletteValues(DEFAULT_PALETTE_ID)).every(v => v === ''));
    assert.equal(matchPalette({}), DEFAULT_PALETTE_ID);
});

test('a hand-picked colour makes it Custom (no match); matching ignores case and spaces', () => {
    const dracula = paletteValues('dracula');
    assert.equal(matchPalette({ ...dracula, primary: '#123456' }), null);
    assert.equal(matchPalette(Object.fromEntries(Object.entries(dracula).map(([k, v]) => [k, ` ${v.toUpperCase()} `]))), 'dracula');
    assert.throws(() => paletteValues('nope'));
});

test('the added themes are darker than the median of the original set', () => {
    const lum = p => luminance(p.colours['surface']);
    const original = PALETTES.filter(p => p.source !== 'gogh').map(lum).sort((a, b) => a - b);
    const median = original[Math.floor(original.length / 2)];
    for (const p of PALETTES.filter(x => x.source === 'gogh'))
        assert.ok(lum(p) < median, `${p.name} background is not darker than the original median`);
});
