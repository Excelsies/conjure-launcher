// Views, categories, pins and grid/list navigation.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyView, categoryFor, tabOrder, availableCategories, togglePin, movePin, VIEWS } from '../lib/views.js';
import { moveSelection } from '../lib/navigation.js';

const r = (id, o = {}) => ({ id, providerId: 'apps', title: id, score: 0, pinned: false, recentIndex: 0, category: null, ...o });
const results = [
    r('a', { category: 'office' }),
    r('b', { pinned: true, recentIndex: 1, category: 'internet' }),
    r('c', { recentIndex: 3 }),
    r('d', { pinned: true, category: 'internet' }),
    r('e', { recentIndex: 2, category: 'games' }),
];
const ids = list => list.map(x => x.id);

test('categoryFor: first mapping token wins; tokens are case-sensitive', () => {
    assert.equal(categoryFor(['GNOME', 'GTK', 'Utility']), 'utilities');
    assert.equal(categoryFor(['Settings', 'Network']), 'utilities');
    assert.equal(categoryFor(['AudioVideo', 'Player']), 'multimedia');
    assert.equal(categoryFor(['Science']), 'education');
    assert.equal(categoryFor(['network']), null);
    assert.equal(categoryFor([]), null);
    assert.equal(categoryFor(undefined), null);
});

test('tabOrder: the default view is first, the others keep their order', () => {
    assert.deepEqual(tabOrder('recent'), ['recent', 'pinned', 'all', 'categories']);
    assert.deepEqual(tabOrder('all'), ['all', 'recent', 'pinned', 'categories']);
    assert.deepEqual(tabOrder('bogus'), VIEWS.slice());
});

test('a typed query ignores the view (typing switches to All)', () => {
    for (const view of VIEWS)
        assert.deepEqual(ids(applyView(results, { view, query: 'x', pinned: ['d', 'b'] })), ids(results));
});

test('All: pinned first in pinned order, then the rest in ranked order', () => {
    assert.deepEqual(ids(applyView(results, { view: 'all', query: '', pinned: ['d', 'b'] })), ['d', 'b', 'a', 'c', 'e']);
});

test('Pinned: only pinned, in pinned order; stale pins are skipped, not fatal', () => {
    assert.deepEqual(ids(applyView(results, { view: 'pinned', query: '', pinned: ['gone', 'd', 'b'] })), ['d', 'b']);
    assert.deepEqual(applyView(results, { view: 'pinned', query: '', pinned: [] }), []);
});

test('Recent: launched only, newest first', () => {
    assert.deepEqual(ids(applyView(results, { view: 'recent', query: '', pinned: [] })), ['c', 'e', 'b']);
});

test('Categories: chosen category, defaulting to the first non-empty one', () => {
    assert.deepEqual(ids(applyView(results, { view: 'categories', category: 'internet', query: '', pinned: [] })), ['b', 'd']);
    assert.deepEqual(ids(applyView(results, { view: 'categories', query: '', pinned: [] })), ['b', 'd'], 'internet is first in the table');
    assert.deepEqual(availableCategories(results).map(c => c.id), ['internet', 'games', 'office']);
    assert.deepEqual(applyView([r('x')], { view: 'categories', query: '', pinned: [] }), []);
});

test('applyView never mutates its input', () => {
    const copy = JSON.stringify(results);
    for (const view of VIEWS)
        applyView(results, { view, query: '', pinned: ['d'] });
    assert.equal(JSON.stringify(results), copy);
});

test('togglePin adds at the end and removes in place', () => {
    assert.deepEqual(togglePin(['a', 'b'], 'c'), ['a', 'b', 'c']);
    assert.deepEqual(togglePin(['a', 'b', 'c'], 'b'), ['a', 'c']);
});

test('list navigation: Up/Down by one, Left/Right ignored, clamped', () => {
    const o = { count: 4, grid: false };
    assert.equal(moveSelection(0, 'down', o), 1);
    assert.equal(moveSelection(3, 'down', o), 3);
    assert.equal(moveSelection(0, 'up', o), 0);
    assert.equal(moveSelection(2, 'left', o), 2);
    assert.equal(moveSelection(2, 'right', o), 2);
    assert.equal(moveSelection(1, 'pageDown', { ...o, page: 8 }), 3);
    assert.equal(moveSelection(-1, 'down', o), 1);
    assert.equal(moveSelection(0, 'down', { count: 0, grid: false }), -1);
});

test('grid navigation: rows of 5, Left/Right by one, partial last row', () => {
    const o = { count: 12, grid: true, columns: 5 };
    assert.equal(moveSelection(1, 'down', o), 6);
    assert.equal(moveSelection(6, 'up', o), 1);
    assert.equal(moveSelection(6, 'right', o), 7);
    assert.equal(moveSelection(6, 'left', o), 5);
    assert.equal(moveSelection(8, 'down', o), 11, 'no item below: go to the last item of the next row');
    assert.equal(moveSelection(11, 'down', o), 11);
    assert.equal(moveSelection(10, 'down', o), 10, 'already on the last row');
    assert.equal(moveSelection(2, 'up', o), 0);
    assert.equal(moveSelection(11, 'right', o), 11);
    assert.equal(moveSelection(0, 'left', o), 0);
});

test('movePin swaps a pin with its neighbor and stops at the ends', () => {
    assert.deepEqual(movePin(['a', 'b', 'c'], 'a', 1), ['b', 'a', 'c']);
    assert.deepEqual(movePin(['a', 'b', 'c'], 'c', -1), ['a', 'c', 'b']);
    assert.deepEqual(movePin(['a', 'b'], 'a', -1), ['a', 'b']);
    assert.deepEqual(movePin(['a', 'b'], 'b', 1), ['a', 'b']);
    assert.deepEqual(movePin(['a'], 'zz', 1), ['a']);
});
