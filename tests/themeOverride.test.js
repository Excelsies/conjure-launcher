// An application overriding the theme: when Settings hides the appearance controls, when the user's theme may
// be saved, and what a saved copy restores.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SAVED_KEYS, appearanceOverridden, copyToSave, overridingApp, restoreValues } from '../lib/themeOverride.js';
import { COLOR_TOKENS } from '../lib/theme.js';

test('an application name, trimmed, or null for empty and whitespace', () => {
    assert.equal(overridingApp('  Chromancy Theming '), 'Chromancy Theming');
    for (const none of ['', '   ', null, undefined])
        assert.equal(overridingApp(none), null, String(none));
});

test('settings hide only while an application overrides and the lock is off', () => {
    assert.equal(appearanceOverridden({ locked: false, source: 'Chromancy Theming' }), true);
    assert.equal(appearanceOverridden({ locked: true, source: 'Chromancy Theming' }), false);
    assert.equal(appearanceOverridden({ locked: false, source: '' }), false);
    assert.equal(appearanceOverridden({ locked: false, source: '  ' }), false);
    assert.equal(appearanceOverridden({ locked: true, source: '' }), false);
});

test('the saved copy covers the nine colors, roundness and font', () => {
    assert.deepEqual([...SAVED_KEYS].sort(), [...Object.keys(COLOR_TOKENS).map(t => `theme-${t}`),
        'theme-font-family', 'theme-radius-scale'].sort());
});

test('the user theme is saved only while no application overrides it', () => {
    const values = { 'theme-primary': '#112233', 'theme-radius-scale': 1.5 };
    assert.deepEqual(copyToSave(values, ''), values);
    assert.notEqual(copyToSave(values, ''), values, 'a copy, not the caller\'s object');
    assert.equal(copyToSave(values, 'Chromancy Theming'), null);
});

test('restoring writes known keys of the right type only, with roundness kept in range', () => {
    assert.deepEqual(restoreValues({}), {});
    assert.deepEqual(restoreValues(null), {});
    assert.deepEqual(restoreValues({ 'theme-primary': '#112233', 'theme-font-family': '', 'theme-radius-scale': 2 }),
        { 'theme-primary': '#112233', 'theme-font-family': '', 'theme-radius-scale': 2 });
    assert.deepEqual(restoreValues({ 'theme-primary': 5, 'theme-radius-scale': '2', 'debug': true, 'pinned': ['x'] }), {});
    assert.deepEqual(restoreValues({ 'theme-radius-scale': 9 }), { 'theme-radius-scale': 3 });
    assert.deepEqual(restoreValues({ 'theme-radius-scale': -1 }), { 'theme-radius-scale': 0 });
    assert.deepEqual(restoreValues({ 'theme-radius-scale': NaN }), {});
});
