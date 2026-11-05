import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rgbaToHex, hexToRgba, ubuntuControls, themeForFollow } from '../lib/prefsHelpers.js';
import { matchPalette, paletteValues } from '../lib/palettes.js';
import { systemDefaults } from '../lib/theme.js';
import { COLOUR_TOKENS } from '../lib/theme.js';

test('rgbaToHex: opaque uses #rrggbb, translucent adds alpha', () => {
    assert.equal(rgbaToHex({ red: 1, green: 245 / 255, blue: 155 / 255, alpha: 1 }), '#fff59b');
    assert.equal(rgbaToHex({ red: 0, green: 0, blue: 0, alpha: 0.5 }), '#00000080');
    assert.equal(rgbaToHex({ red: 2, green: -1, blue: 0.5 }), '#ff0080', 'out-of-range channels are clamped');
});

test('hexToRgba: empty or invalid values show the default', () => {
    const d = hexToRgba('', COLOUR_TOKENS['primary']);
    assert.equal(rgbaToHex(d), '#d34615');
    assert.equal(rgbaToHex(hexToRgba('nope', '#010203')), '#010203');
    assert.equal(rgbaToHex(hexToRgba('#89b4fa', '#000000')), '#89b4fa');
});

test('round trip for every default token', () => {
    for (const [name, hex] of Object.entries(COLOUR_TOKENS))
        assert.equal(rgbaToHex(hexToRgba(hex, '#000000')), hex, name);
});

test('swatchMarkup: one block per role, normalised hex, invalid values skipped', async () => {
    const { swatchMarkup, SWATCH_ROLES } = await import('../lib/prefsHelpers.js');
    const html = swatchMarkup({ ...COLOUR_TOKENS, primary: '#ABC' });
    assert.equal((html.match(/<span /g) ?? []).length, SWATCH_ROLES.length);
    assert.match(html, /background="#aabbcc"/);
    const hostile = swatchMarkup({ ...COLOUR_TOKENS, primary: '"><b>x</b><span x="' });
    assert.equal((hostile.match(/<span /g) ?? []).length, SWATCH_ROLES.length - 1);
    assert.doesNotMatch(hostile, /<b>/);
});

test('Ubuntu controls: following shows the switch on and hides Light / Dark; a fixed variant shows both', () => {
    assert.deepEqual(ubuntuControls('ubuntu'), { ubuntu: true, follow: true, styleVisible: false, styleDark: false });
    assert.deepEqual(ubuntuControls('ubuntu-light'), { ubuntu: true, follow: false, styleVisible: true, styleDark: false });
    assert.deepEqual(ubuntuControls('ubuntu-dark'), { ubuntu: true, follow: false, styleVisible: true, styleDark: true });
    for (const other of ['noctalia', 'dracula', null])
        assert.deepEqual(ubuntuControls(other), { ubuntu: false, follow: false, styleVisible: false, styleDark: false }, String(other));
});

test('the follow switch: off fixes what the system shows now, on follows again, and each round-trips', () => {
    for (const dark of [false, true]) {
        const defaults = systemDefaults({ dark, accent: '#7764d8', accentFg: '#ffffff' });
        const off = themeForFollow(false, dark);
        assert.equal(off, dark ? 'ubuntu-dark' : 'ubuntu-light');
        assert.equal(matchPalette(paletteValues(off), defaults), off);
        assert.equal(paletteValues(off)['primary'], '#d34615', 'off uses Ubuntu orange, not the system accent');
        assert.equal(matchPalette(paletteValues(themeForFollow(true, dark)), defaults), 'ubuntu');
    }
});
