// Invariant 1: the user's toggle-application-view binding is always recoverable, and only the
// accelerators that collide with ours are taken. The same flows run against real GSettings in
// tests/shell/launcher.js and tests/shell/defaults.js.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeOver, restore, normalizeAccel } from '../lib/takeover.js';
import { makeFakes } from './helpers/takeoverFakes.js';

const OURS = ['<Super>space'];

test('normalizeAccel: modifier aliases, order and case', () => {
    assert.equal(normalizeAccel('<Super>space'), '<super>space');
    assert.equal(normalizeAccel('<Mod4>Space'), '<super>space');
    assert.equal(normalizeAccel('<Shift><Primary>a'), normalizeAccel('<Control><Shift>a'));
    assert.equal(normalizeAccel('<Ctrl>a'), '<control>a');
    assert.equal(normalizeAccel(''), '');
    assert.equal(normalizeAccel('<Super>'), '');
    assert.equal(normalizeAccel(null), '');
});

test('GNOME default (<Super>a): nothing collides, nothing is saved or changed', () => {
    const { gnome, saved, state } = makeFakes(['<Super>a']);
    assert.deepEqual(takeOver(gnome, saved, OURS), { ok: true, changed: false });
    assert.deepEqual(state.gnome, ['<Super>a']);
    assert.equal(state.hasSaved, false);
    assert.deepEqual(state.writes, [], 'no setting was written');
    assert.equal(restore(gnome, saved, OURS).restored, false);
    assert.deepEqual(state.gnome, ['<Super>a']);
});

test('only the colliding accelerator is removed; disable restores the full original', () => {
    const { gnome, saved, state } = makeFakes(['<Super>a', '<Mod4>space']);
    assert.deepEqual(takeOver(gnome, saved, OURS), { ok: true, changed: true });
    assert.deepEqual(state.gnome, ['<Super>a']);
    assert.deepEqual(state.saved, ['<Super>a', '<Mod4>space']);
    assert.equal(restore(gnome, saved, OURS).restored, true);
    assert.deepEqual(state.gnome, ['<Super>a', '<Mod4>space']);
    assert.equal(state.hasSaved, false);
    assert.deepEqual(state.saved, []);
});

test('write order: copy, then flag, then GNOME key', () => {
    const { gnome, saved, state } = makeFakes(['<Super>space']);
    takeOver(gnome, saved, OURS);
    assert.deepEqual(state.writes, ['saved', 'flag', 'gnome']);
});

test('crash recovery: a surviving copy is not overwritten on the next enable', () => {
    const { gnome, saved, state } = makeFakes(['<Super>space']);
    takeOver(gnome, saved, OURS);
    // The shell dies here without disable(). Next login runs enable() again.
    const second = takeOver(gnome, saved, OURS);
    assert.equal(second.ok, true);
    assert.deepEqual(state.saved, ['<Super>space'], 'copy must survive the second takeover');
    restore(gnome, saved, OURS);
    assert.deepEqual(state.gnome, ['<Super>space']);
});

test('a binding the user set after a crash becomes the new original', () => {
    const { gnome, saved, state } = makeFakes(['<Super>space']);
    takeOver(gnome, saved, OURS);
    state.gnome = ['<Super>g', '<Super>space'];  // fixed by hand before the next enable
    takeOver(gnome, saved, OURS);
    assert.deepEqual(state.saved, ['<Super>g', '<Super>space']);
    assert.deepEqual(state.gnome, ['<Super>g']);
    restore(gnome, saved, OURS);
    assert.deepEqual(state.gnome, ['<Super>g', '<Super>space']);
});

test('a non-colliding binding set after a crash drops the stale copy without writing GNOME', () => {
    const { gnome, saved, state } = makeFakes(['<Super>space']);
    takeOver(gnome, saved, OURS);
    state.gnome = ['<Super>a'];
    state.writes = [];
    assert.deepEqual(takeOver(gnome, saved, OURS), { ok: true, changed: false });
    assert.equal(state.hasSaved, false);
    assert.ok(!state.writes.includes('gnome'));
    assert.deepEqual(state.gnome, ['<Super>a']);
});

test('a binding the user set while we were enabled is kept on disable', () => {
    const { gnome, saved, state } = makeFakes(['<Super>space']);
    takeOver(gnome, saved, OURS);
    state.gnome = ['<Super>a'];
    const r = restore(gnome, saved, OURS);
    assert.equal(r.restored, false);
    assert.deepEqual(state.gnome, ['<Super>a']);
    assert.equal(state.hasSaved, false);
});

test('rebinding ours: restore with the old accelerators, take with the new', () => {
    const { gnome, saved, state } = makeFakes(['<Super>space', '<Super>r']);
    takeOver(gnome, saved, ['<Super>space']);
    assert.deepEqual(state.gnome, ['<Super>r']);
    restore(gnome, saved, ['<Super>space']);
    takeOver(gnome, saved, ['<Super>r']);
    assert.deepEqual(state.gnome, ['<Super>space']);
    assert.deepEqual(state.saved, ['<Super>space', '<Super>r']);
});

test('fails closed: if the copy cannot be saved, GNOME\'s key is left alone', () => {
    const { gnome, saved, state } = makeFakes(['<Super>space'], { savedWritable: false });
    assert.equal(takeOver(gnome, saved, OURS).ok, false);
    assert.deepEqual(state.gnome, ['<Super>space']);
});

test('fails closed: if the presence flag cannot be written, GNOME\'s key is left alone', () => {
    const { gnome, saved, state } = makeFakes(['<Super>space'], { flagWritable: false });
    assert.equal(takeOver(gnome, saved, OURS).ok, false);
    assert.deepEqual(state.gnome, ['<Super>space']);
});

test('an unwritable GNOME key on restore keeps the copy for next time', () => {
    const { gnome, saved, state } = makeFakes(['<Super>space']);
    takeOver(gnome, saved, OURS);
    state.gnomeWritable = false;
    assert.equal(restore(gnome, saved, OURS).restored, false);
    assert.equal(state.hasSaved, true);
    assert.deepEqual(state.saved, ['<Super>space']);
});

test('restore with nothing saved is a no-op', () => {
    const { gnome, saved, state } = makeFakes(['<Super>space']);
    assert.equal(restore(gnome, saved, OURS).restored, false);
    assert.deepEqual(state.gnome, ['<Super>space']);
});
