// Typo tolerance (lib/typo.js): typo matches are found, and never outrank a real match.
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { editDistance, typoScore, allowedEdits, TYPO_SCORE } from '../lib/typo.js';
import { scoreApp } from '../lib/appScore.js';
import { isMatch } from '../lib/fzy.js';

const entry = (name, extra = {}) => ({ nameLower: name.toLowerCase(), altNamesLower: [], genericLower: '', keywordsLower: [],
    categoriesLower: [], idLower: '', execLower: '', ...extra });

test('edit distance counts a swap of neighbors as one edit', () => {
    assert.equal(editDistance('firfox', 'firefox'), 1);
    assert.equal(editDistance('teh', 'the'), 1);
    assert.equal(editDistance('kitten', 'sitting'), 3);
    assert.equal(editDistance('abc', 'abc'), 0);
    assert.equal(editDistance('abcdef', 'zzzzzz', 2), 3, 'stops early past the limit');
});

test('allowed edits grow with the query: none under 4 characters', () => {
    assert.deepEqual([3, 4, 5, 6, 12].map(allowedEdits), [0, 1, 1, 2, 2]);
});

test('typos in a name or one of its words are found', () => {
    for (const [q, name] of [['firfox', 'Firefox'], ['thunderbrid', 'Thunderbird'], ['termnial', 'Terminal'], ['calcualtor', 'GNOME Calculator']])
        assert.ok(isMatch(typoScore(q, name.toLowerCase())), `${q} -> ${name}`);
    assert.equal(typoScore('xyzw', 'firefox'), -Infinity);
    assert.equal(typoScore('fox', 'firefax'), -Infinity, 'short queries get no typo matching');
});

test('fewer edits rank higher among typo matches', () => {
    assert.ok(typoScore('firfox', 'firefox') > typoScore('frfx', 'firefox'));
});

test('the documented example is a real typo case: fuzzy matching alone cannot find it', () => {
    // "firfox" would be a poor example: its letters appear in order in "firefox", so fzy already matches it.
    assert.equal(isMatch(scoreApp('termnial', entry('Terminal'))), false);
    assert.ok(isMatch(typoScore('termnial', 'terminal')));
    assert.ok(isMatch(scoreApp('firfox', entry('Firefox'))));
});

test('a typo match never outranks a real match, even the weakest one possible', () => {
    // The weakest real match: one letter of the query found at each end of a 1024-character exec name.
    const long = `f${'x'.repeat(1022)}o`;
    const weakest = scoreApp('fo', entry('zz', { execLower: long }));
    assert.ok(isMatch(weakest));
    assert.ok(weakest > -100, `weakest real match ${weakest}`);
    const bestTypo = TYPO_SCORE - 0;
    assert.ok(bestTypo < weakest);
    assert.ok(typoScore('firfox', 'firefox') < weakest);
});
