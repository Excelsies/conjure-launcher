import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rgbaToHex, hexToRgba } from '../lib/prefsHelpers.js';
import { COLOUR_TOKENS } from '../lib/theme.js';

test('rgbaToHex: opaque uses #rrggbb, translucent adds alpha', () => {
    assert.equal(rgbaToHex({ red: 1, green: 245 / 255, blue: 155 / 255, alpha: 1 }), '#fff59b');
    assert.equal(rgbaToHex({ red: 0, green: 0, blue: 0, alpha: 0.5 }), '#00000080');
    assert.equal(rgbaToHex({ red: 2, green: -1, blue: 0.5 }), '#ff0080', 'out-of-range channels are clamped');
});

test('hexToRgba: empty or invalid values show the default', () => {
    const d = hexToRgba('', COLOUR_TOKENS['primary']);
    assert.equal(rgbaToHex(d), '#fff59b');
    assert.equal(rgbaToHex(hexToRgba('nope', '#010203')), '#010203');
    assert.equal(rgbaToHex(hexToRgba('#89b4fa', '#000000')), '#89b4fa');
});

test('round trip for every default token', () => {
    for (const [name, hex] of Object.entries(COLOUR_TOKENS))
        assert.equal(rgbaToHex(hexToRgba(hex, '#000000')), hex, name);
});
