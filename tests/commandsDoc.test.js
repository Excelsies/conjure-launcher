// The prefs editor's document model for commands.json.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDoc, validateDoc, errorsFor, upsertEntry, removeEntry, moveEntry, serializeDoc, suggestId, emptyDoc } from '../lib/commandsDoc.js';
import { BUILTIN_TRIGGERS } from '../lib/builtins.js';

test('parse: empty text is an empty document; malformed text is an error, not an empty doc', () => {
    assert.deepEqual(parseDoc('').doc, emptyDoc());
    assert.deepEqual(parseDoc(null).doc, emptyDoc());
    assert.equal(parseDoc('{ nope').ok, false);
    assert.equal(parseDoc('{"version":2,"entries":[]}').ok, false);
    assert.equal(parseDoc('[]').ok, false);
});

test('editing keeps unknown keys, drops cleared fields, never mutates the input', () => {
    const doc = { version: 1, note: 'mine', entries: [{ id: 'ssh', prefix: 'ssh', exec: 'x {selection}', comment: 'keep me', freeform: true }] };
    const frozen = JSON.stringify(doc);
    const next = upsertEntry(doc, 0, { id: 'ssh', prefix: 'ssh', label: 'SSH', exec: 'y {selection}', freeform: false, icon: '' });
    assert.equal(JSON.stringify(doc), frozen);
    assert.deepEqual(next.entries[0], { comment: 'keep me', id: 'ssh', prefix: 'ssh', label: 'SSH', exec: 'y {selection}' });
    assert.equal(next.note, 'mine');
});

test('add, remove, move', () => {
    let doc = emptyDoc();
    doc = upsertEntry(doc, null, { id: 'a', prefix: 'a', exec: 'x' });
    doc = upsertEntry(doc, null, { id: 'b', prefix: 'b', exec: 'x' });
    doc = moveEntry(doc, 1, 0);
    assert.deepEqual(doc.entries.map(e => e.id), ['b', 'a']);
    assert.equal(moveEntry(doc, 0, 5), doc, 'out-of-range moves are ignored');
    doc = removeEntry(doc, 0);
    assert.deepEqual(doc.entries.map(e => e.id), ['a']);
});

test('validation matches the extension, including built-in prefixes', () => {
    for (const builtin of BUILTIN_TRIGGERS) {
        const doc = upsertEntry(emptyDoc(), null, { id: 'x', prefix: builtin, exec: 'x' });
        assert.match(errorsFor(doc, 0).join(), /already used/, builtin);
    }
    const doc = { version: 1, entries: [{ id: 'ok', prefix: 'ok', exec: 'x' }, { id: 'BAD', prefix: 'b', exec: 'x' }] };
    assert.deepEqual(errorsFor(doc, 0), []);
    assert.equal(errorsFor(doc, 1).length, 1);
    assert.equal(validateDoc(doc).length, 1);
});

test('serialized documents parse back identically', () => {
    const doc = upsertEntry(emptyDoc(), null, { id: 'g', prefix: 'g', label: 'Web', exec: 'xdg-open https://x/?q={query}' });
    assert.deepEqual(parseDoc(serializeDoc(doc)).doc, doc);
    assert.ok(serializeDoc(doc).endsWith('\n'));
});

test('suggestId makes a valid, unique id from a label', () => {
    const doc = upsertEntry(emptyDoc(), null, { id: 'ssh-hosts', prefix: 's', exec: 'x' });
    assert.equal(suggestId(emptyDoc(), 'SSH hosts!'), 'ssh-hosts');
    assert.equal(suggestId(doc, 'SSH hosts'), 'ssh-hosts-2');
    assert.equal(suggestId(doc, '***'), 'command');
});
