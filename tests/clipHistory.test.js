// Clipboard history (lib/clipHistory.js). Invariant 7: a copy marked secret is never stored. Each fail-closed
// condition is witnessed on its own, with a positive case beside it.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ClipHistory, shouldStore, preview, clampLimit, SECRET_HINT_MIME, MAX_ENTRY_CHARS } from '../lib/clipHistory.js';

const TEXT = ['text/plain;charset=utf-8', 'UTF8_STRING'];

test('ordinary text is stored', () => {
    assert.equal(shouldStore(TEXT, 'hello'), true);
    assert.equal(shouldStore(['STRING'], 'hello'), true);
});

test('invariant 7: a copy with the password-manager hint is never stored, whatever its value', () => {
    assert.equal(shouldStore([...TEXT, SECRET_HINT_MIME], 'hunter2'), false);
    assert.equal(shouldStore([SECRET_HINT_MIME, ...TEXT], 'hunter2'), false);
});

test('fails closed: no text type, blank text, unreadable text, oversized text, bad MIME list', () => {
    assert.equal(shouldStore(['image/png'], 'x'), false);
    assert.equal(shouldStore(TEXT, '   \n '), false);
    assert.equal(shouldStore(TEXT, null), false);
    assert.equal(shouldStore(TEXT, 'a'.repeat(MAX_ENTRY_CHARS + 1)), false);
    assert.equal(shouldStore(TEXT, 'a'.repeat(MAX_ENTRY_CHARS)), true);
    assert.equal(shouldStore(undefined, 'x'), false);
});

test('newest first, a repeated copy moves to the top, and the limit holds', () => {
    const h = new ClipHistory(10);
    for (let i = 0; i < 12; i++)
        h.add(`t${i}`, i);
    assert.equal(h.items().length, 10);
    assert.equal(h.items()[0].text, 't11');
    h.add('t5', 99);
    assert.deepEqual(h.items().slice(0, 2).map(i => i.text), ['t5', 't11']);
    assert.equal(h.items().filter(i => i.text === 't5').length, 1);
    h.setLimit(10);
    h.clear();
    assert.deepEqual(h.items(), []);
});

test('the limit is clamped to 10-200 and defaults to 50', () => {
    assert.equal(clampLimit(5), 10);
    assert.equal(clampLimit(500), 200);
    assert.equal(clampLimit(70), 70);
    assert.equal(clampLimit('x'), 50);
});

test('the preview is the first non-blank line, collapsed and cut', () => {
    assert.equal(preview('\n\n  hello   world  \nsecond'), 'hello world');
    assert.equal(preview('x'.repeat(200), 10), `${'x'.repeat(9)}…`);
});
