// Invariant 4: slow providers never block typing; stale results never reach the screen.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QueryController } from '../lib/queryController.js';

function deferred() {
    let resolve, reject;
    const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
    });
    return { promise, resolve, reject };
}

function setup(providers) {
    const emitted = [];
    const errors = [];
    const qc = new QueryController({
        providers,
        prefixChar: () => '/',
        sortByUsage: () => true,
        onResults: (results, info) => emitted.push({ titles: results.map(r => r.title), ...info }),
        logError: (msg) => errors.push(msg),
    });
    return { qc, emitted, errors };
}

const syncApps = {
    id: 'apps',
    query: q => [{ id: 'a', title: `app:${q}`, score: 1 }],
};

test('sync results are emitted immediately, without waiting for async providers', () => {
    const slow = deferred();
    const { qc, emitted } = setup([syncApps, { id: 'slow', query: () => slow.promise }]);
    qc.setQuery('fi');
    assert.equal(emitted.length, 1);
    assert.deepEqual(emitted[0].titles, ['app:fi']);
    assert.equal(emitted[0].pending, 1);
});

test('results from a superseded query are dropped', async () => {
    const first = deferred();
    const second = deferred();
    const calls = [first, second];
    const { qc, emitted } = setup([{ id: 'slow', query: () => calls.shift().promise }]);
    const g1 = qc.setQuery('f');
    const g2 = qc.setQuery('fi');
    second.resolve([{ id: 'b', title: 'new', score: 1 }]);
    first.resolve([{ id: 'a', title: 'stale', score: 9 }]);
    await new Promise(r => setImmediate(r));
    assert.ok(g2 > g1);
    const all = emitted.flatMap(e => e.titles);
    assert.ok(all.includes('new'));
    assert.ok(!all.includes('stale'), 'a stale result reached the screen');
});

test('cancel() (close) drops in-flight results and marks the token canceled', async () => {
    const slow = deferred();
    let token;
    const { qc, emitted } = setup([{ id: 'slow', query: (_q, t) => {
        token = t;
        return slow.promise;
    } }]);
    qc.setQuery('x');
    const before = emitted.length;
    qc.cancel();
    assert.equal(token.canceled, true);
    slow.resolve([{ id: 'a', title: 'late', score: 1 }]);
    await new Promise(r => setImmediate(r));
    assert.equal(emitted.length, before);
});

test('a throwing provider is logged with its id and does not hide other results', () => {
    const { qc, emitted, errors } = setup([
        { id: 'broken', query: () => {
            throw new Error('boom');
        } },
        syncApps,
    ]);
    qc.setQuery('x');
    assert.deepEqual(emitted.at(-1).titles, ['app:x']);
    assert.match(errors[0], /broken/);
});

test('a rejected async provider is logged and the pending count still drops', async () => {
    const slow = deferred();
    const { qc, emitted, errors } = setup([{ id: 'dbus', query: () => slow.promise }]);
    qc.setQuery('x');
    slow.reject(new Error('timeout'));
    await new Promise(r => setImmediate(r));
    assert.match(errors[0], /dbus/);
    assert.equal(emitted.at(-1).pending, 0);
});

test('prefixed queries go to one provider only, overview shows no results', () => {
    const calc = { id: 'calc', trigger: 'calc', displayName: 'Calculator', query: q => [{ id: q, title: `calc:${q}`, score: 1 }] };
    const { qc, emitted } = setup([syncApps, calc]);
    qc.setQuery('/calc 1+1');
    assert.deepEqual(emitted.at(-1).titles, ['calc:1+1']);
    qc.setQuery('/');
    assert.equal(emitted.at(-1).kind, 'overview');
    assert.deepEqual(emitted.at(-1).titles, ['/calc'], 'the overview lists triggered providers');
});

test('onCancel callbacks run once when the query goes stale, or at once if already stale', () => {
    const tokens = [];
    const runs = [];
    const { qc } = setup([{ id: 'slow', query: (_q, t) => {
        const i = tokens.push(t) - 1;
        runs[i] = 0;
        t.onCancel(() => runs[i]++);
        return new Promise(() => {});
    } }]);
    qc.setQuery('a');
    assert.deepEqual(runs, [0]);
    qc.setQuery('ab');
    assert.deepEqual(runs, [1, 0], 'the superseded query is canceled, the new one is not');
    qc.cancel();
    qc.cancel();
    assert.deepEqual(runs, [1, 1], 'each token is canceled exactly once');
    let late = 0;
    tokens[0].onCancel(() => late++);
    assert.equal(late, 1, 'registering on a stale token runs at once');
});

test('a scope sends every query, prefixes included, to that provider only', () => {
    const scoped = { id: 'dmenu', query: q => [{ id: q, title: `d:${q}`, score: 1 }] };
    const calc = { id: 'calc', trigger: 'calc', query: () => [{ id: 'c', title: 'calc', score: 9 }] };
    const { qc, emitted } = setup([syncApps, calc]);
    qc.setScope(scoped);
    qc.setQuery('/calc 1');
    assert.deepEqual(emitted.at(-1).titles, ['d:/calc 1']);
    assert.equal(emitted.at(-1).kind, 'scoped');
    qc.setQuery('/');
    assert.deepEqual(emitted.at(-1).titles, ['d:/'], 'no provider overview in a scope');
    qc.setScope(null);
    qc.setQuery('x');
    assert.deepEqual(emitted.at(-1).titles, ['app:x']);
});
