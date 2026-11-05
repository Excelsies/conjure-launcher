// Decaying launch weights (lib/usage.js): each launch adds 1 and halves in value every 14 days; counts are
// still kept exactly, and a newer file still reads in the 0.7.0 parser (rollback keeps the history).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { UsageModel, HALF_LIFE_MS } from '../lib/usage.js';
import { UsageModel as UsageModel07 } from './fixtures/usage-v0.7.js';

const T0 = Date.UTC(2026, 10, 1);
const DAY = 24 * 3600 * 1000;

test('the half-life is 14 days, and a launch halves in value over it', () => {
    assert.equal(HALF_LIFE_MS, 14 * DAY);
    const m = new UsageModel(T0);
    m.record('apps', 'a', T0);
    assert.equal(m.weight('apps', 'a', T0), 1);
    assert.ok(Math.abs(m.weight('apps', 'a', T0 + 14 * DAY) - 0.5) < 1e-9);
    assert.ok(Math.abs(m.weight('apps', 'a', T0 + 28 * DAY) - 0.25) < 1e-9);
    assert.equal(m.weight('apps', 'never', T0), 0);
});

test('recent habits outrank old ones: 20 launches two months ago lose to 3 this week', () => {
    const m = new UsageModel(T0);
    for (let i = 0; i < 20; i++)
        m.record('apps', 'old', T0);
    const now = T0 + 60 * DAY;
    for (let i = 0; i < 3; i++)
        m.record('apps', 'new', now - 2 * DAY);
    assert.ok(m.weight('apps', 'new', now) > m.weight('apps', 'old', now));
    assert.equal(m.count('apps', 'old'), 20, 'counts are kept exactly');
});

test('a launch adds 1 to the decayed weight, not to the raw count', () => {
    const m = new UsageModel(T0);
    m.record('apps', 'a', T0);
    m.record('apps', 'a', T0 + 14 * DAY);
    assert.ok(Math.abs(m.weight('apps', 'a', T0 + 14 * DAY) - 1.5) < 1e-9);
});

test('counts from before decay carry over at full value, decaying from when the file was read', () => {
    const before = JSON.stringify({ version: 1, counts: { apps: { a: 10 } }, recent: { apps: ['a'] } });
    const { model, dropped } = UsageModel.parse(before, T0);
    assert.equal(dropped, 0);
    assert.equal(model.weight('apps', 'a', T0), 10);
    assert.ok(Math.abs(model.weight('apps', 'a', T0 + 14 * DAY) - 5) < 1e-9);
    // ...and the start time is fixed by the first save, not reset on every read
    const again = UsageModel.parse(model.serialize(), T0 + 7 * DAY).model;
    assert.ok(Math.abs(again.weight('apps', 'a', T0 + 14 * DAY) - 5) < 1e-3);
});

test('garbage decay entries fall back to the count, one by one', () => {
    const text = JSON.stringify({
        version: 1, counts: { apps: { a: 4, b: 2, c: 1 } }, recent: {},
        decay: { apps: { a: [3, T0], b: 'x', c: [1, T0 + 400 * DAY], zz: [1, T0] }, ghost: { q: [1, T0] } },
    });
    const { model, dropped } = UsageModel.parse(text, T0);
    assert.equal(model.weight('apps', 'a', T0), 3);
    assert.equal(model.weight('apps', 'b', T0), 2, 'a non-array entry falls back to the count');
    assert.equal(model.weight('apps', 'c', T0), 1, 'a time far in the future falls back to the count');
    assert.equal(model.weight('apps', 'zz', T0), 0, 'no entry without a count');
    assert.equal(dropped, 4);
});

test('rollback: the 0.7.0 parser reads a newer file with every count and recent entry', () => {
    const m = new UsageModel(T0);
    m.record('apps', 'a', T0);
    m.record('apps', 'a', T0 + DAY);
    m.record('apps', 'b', T0 + 2 * DAY);
    const old = UsageModel07.parse(m.serialize());
    assert.equal(old.dropped, 0);
    assert.equal(old.model.count('apps', 'a'), 2);
    assert.equal(old.model.count('apps', 'b'), 1);
    assert.deepEqual(old.model.recent('apps'), ['b', 'a']);
});

test('clear removes the weights too', () => {
    const m = new UsageModel(T0);
    m.record('apps', 'a', T0);
    m.clear();
    assert.equal(m.weight('apps', 'a', T0), 0);
    assert.equal(UsageModel.parse(m.serialize(), T0).model.weight('apps', 'a', T0), 0);
});
