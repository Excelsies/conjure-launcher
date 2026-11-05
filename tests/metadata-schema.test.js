// Consistency between metadata.json, the GSettings schema and the theming contract
// (docs/theming.md). These identifiers are permanent once published, so a
// silent drift between them is a release blocker.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const metadata = JSON.parse(readFileSync(join(root, 'metadata.json'), 'utf8'));
const schemaId = metadata['settings-schema'];
const schemaXml = readFileSync(join(root, 'schemas', `${schemaId}.gschema.xml`), 'utf8');

const keyNames = [...schemaXml.matchAll(/<key name="([^"]+)"/g)].map(m => m[1]);

// The documented colour roles. Renaming or removing one breaks integrations that write them.
const COLOUR_TOKENS = [
    'primary', 'on-primary', 'surface', 'surface-container', 'on-surface',
    'on-surface-variant', 'outline-variant', 'hover', 'on-hover',
];

test('uuid, schema id and schema path agree', () => {
    assert.equal(metadata.uuid, 'conjure-launcher@excelsies');
    assert.equal(schemaId, 'org.gnome.shell.extensions.conjure-launcher');
    const m = schemaXml.match(/<schema id="([^"]+)" path="([^"]+)"/);
    assert.ok(m, 'schema element not found');
    assert.equal(m[1], schemaId);
    assert.equal(m[2], '/org/gnome/shell/extensions/conjure-launcher/');
});

test('targets GNOME Shell 50+ only', () => {
    assert.ok(metadata['shell-version'].length > 0);
    for (const v of metadata['shell-version'])
        assert.ok(Number(v) >= 50, `unexpected shell-version ${v}`);
});

test('every colour token has a key that defaults to empty (= built-in palette)', () => {
    for (const token of COLOUR_TOKENS) {
        const re = new RegExp(`<key name="theme-${token}" type="s">\\s*<default>''</default>`);
        assert.match(schemaXml, re, `theme-${token} missing or not defaulting to ''`);
    }
});

test('no undocumented theme-* keys', () => {
    const documented = new Set([
        ...COLOUR_TOKENS.map(t => `theme-${t}`),
        'theme-radius-scale', 'theme-font-family', 'theme-overrides-locked',
    ]);
    const extra = keyNames.filter(k => k.startsWith('theme-') && !documented.has(k));
    assert.deepEqual(extra, []);
});

test('the saved-binding restore has an explicit presence flag', () => {
    // Invariant 1: "no saved copy" must be distinguishable from "the user's binding was empty".
    assert.ok(keyNames.includes('saved-toggle-application-view'));
    assert.ok(keyNames.includes('has-saved-toggle-application-view'));
});

test('schema keys are unique', () => {
    assert.equal(new Set(keyNames).size, keyNames.length);
});
