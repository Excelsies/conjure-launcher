// Port of upstream fzy's test/test_match.c (jhawthorn/fzy @ 34b8886, MIT) plus Noctalia's
// FuzzyMatch::score wrapper semantics (lib/util/fuzzy_match.cpp @ 60861c9). Every upstream
// assertion is kept, in upstream order, so a divergence from the C implementation shows up here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    hasMatch, match, score,
    SCORE_MIN, SCORE_MAX, SCORE_GAP_LEADING, SCORE_GAP_TRAILING, SCORE_GAP_INNER,
    SCORE_MATCH_CONSECUTIVE, SCORE_MATCH_SLASH, SCORE_MATCH_CAPITAL, SCORE_MATCH_DOT,
    EXACT_MATCH_SCORE,
} from '../lib/fzy.js';

const TOL = 0.000001;
function assertScore(expected, actual) {
    if (!Number.isFinite(expected)) {
        assert.equal(actual, expected);
        return;
    }
    assert.ok(Math.abs(expected - actual) <= TOL, `expected ${expected}, got ${actual}`);
}

test('has_match', () => {
    assert.ok(hasMatch('a', 'a'));
    assert.ok(hasMatch('a', 'ab'));
    assert.ok(hasMatch('a', 'ba'));
    assert.ok(hasMatch('abc', 'a|b|c'));
    assert.ok(!hasMatch('a', ''));
    assert.ok(!hasMatch('a', 'b'));
    assert.ok(!hasMatch('ass', 'tags'));
    assert.ok(hasMatch('', ''));
    assert.ok(hasMatch('', 'a'));
});

test('relative preferences', () => {
    assert.ok(match('amor', 'app/models/order') > match('amor', 'app/models/zrder'));
    assert.ok(match('amo', 'app/m/foo') < match('amo', 'app/models/foo'));
    assert.ok(match('gemfil', 'Gemfile.lock') < match('gemfil', 'Gemfile'));
    assert.ok(match('abce', 'abcdef') > match('abce', 'abc de'));
    assert.ok(match('abc', '    a b c ') > match('abc', ' a  b  c '));
    assert.ok(match('abc', ' a b c    ') > match('abc', ' a  b  c '));
    assert.ok(match('test', 'tests') > match('test', 'testing'));
    assert.ok(match('test', 'testing') > match('test', '/testing'));
});

test('exact and empty', () => {
    assertScore(SCORE_MAX, match('abc', 'abc'));
    assertScore(SCORE_MAX, match('aBc', 'abC'));
    assertScore(SCORE_MIN, match('', ''));
    assertScore(SCORE_MIN, match('', 'a'));
    assertScore(SCORE_MIN, match('', 'bb'));
});

test('gaps', () => {
    assertScore(SCORE_GAP_LEADING, match('a', '*a'));
    assertScore(SCORE_GAP_LEADING * 2, match('a', '*ba'));
    assertScore(SCORE_GAP_LEADING * 2 + SCORE_GAP_TRAILING, match('a', '**a*'));
    assertScore(SCORE_GAP_LEADING * 2 + SCORE_GAP_TRAILING * 2, match('a', '**a**'));
    assertScore(SCORE_GAP_LEADING * 2 + SCORE_MATCH_CONSECUTIVE + SCORE_GAP_TRAILING * 2, match('aa', '**aa**'));
    assertScore(SCORE_GAP_LEADING + SCORE_GAP_LEADING + SCORE_GAP_INNER + SCORE_GAP_TRAILING + SCORE_GAP_TRAILING,
        match('aa', '**a*a**'));
});

test('consecutive', () => {
    assertScore(SCORE_GAP_LEADING + SCORE_MATCH_CONSECUTIVE, match('aa', '*aa'));
    assertScore(SCORE_GAP_LEADING + SCORE_MATCH_CONSECUTIVE * 2, match('aaa', '*aaa'));
    assertScore(SCORE_GAP_LEADING + SCORE_GAP_INNER + SCORE_MATCH_CONSECUTIVE, match('aaa', '*a*aa'));
});

test('slash, capital, dot bonuses', () => {
    assertScore(SCORE_GAP_LEADING + SCORE_MATCH_SLASH, match('a', '/a'));
    assertScore(SCORE_GAP_LEADING * 2 + SCORE_MATCH_SLASH, match('a', '*/a'));
    assertScore(SCORE_GAP_LEADING * 2 + SCORE_MATCH_SLASH + SCORE_MATCH_CONSECUTIVE, match('aa', 'a/aa'));
    assertScore(SCORE_GAP_LEADING + SCORE_MATCH_CAPITAL, match('a', 'bA'));
    assertScore(SCORE_GAP_LEADING * 2 + SCORE_MATCH_CAPITAL, match('a', 'baA'));
    assertScore(SCORE_GAP_LEADING * 2 + SCORE_MATCH_CAPITAL + SCORE_MATCH_CONSECUTIVE, match('aa', 'baAa'));
    assertScore(SCORE_GAP_LEADING + SCORE_MATCH_DOT, match('a', '.a'));
    assertScore(SCORE_GAP_LEADING * 3 + SCORE_MATCH_DOT, match('a', '*a.a'));
    assertScore(SCORE_GAP_LEADING + SCORE_GAP_INNER + SCORE_MATCH_DOT, match('a', '*a.a'));
});

// Not in the upstream suite (found by mutation probe M17): bonus_states[2] gives the capital
// bonus only after a lowercase letter; an uppercase letter after another uppercase letter or a
// digit scores no bonus in the C table.
test('no capital bonus after an uppercase letter or a digit', () => {
    assertScore(SCORE_GAP_LEADING, match('b', 'AB'));
    assertScore(SCORE_GAP_LEADING, match('b', '1B'));
    assertScore(SCORE_GAP_LEADING + SCORE_MATCH_CAPITAL, match('b', 'aB'));
});

test('long strings score SCORE_MIN', () => {
    const s = 'a'.repeat(4095);
    assertScore(SCORE_MIN, match('aa', s));
    assertScore(SCORE_MIN, match(s, 'aa'));
    assertScore(SCORE_MIN, match(s, s));
});

// Noctalia's wrapper: the only entry point providers use.
test('score(): Noctalia wrapper semantics', () => {
    assert.equal(score('', 'anything'), 0, 'empty pattern scores 0');
    assert.equal(score('a', ''), -Infinity, 'empty text is no match');
    assert.equal(score('xyz', 'firefox'), -Infinity, 'non-match is -Infinity');
    assert.equal(score('firefox', 'firefox'), EXACT_MATCH_SCORE);
    assert.equal(EXACT_MATCH_SCORE, 1024);
    assert.equal(score('FIRE', 'firefox'), match('fire', 'firefox'), 'needle is lowercased');
    assert.ok(Number.isFinite(score('ff', 'firefox')));
    assert.equal(score('a', 'a'.repeat(2000)), -Infinity, 'over-long candidate is no match');
});
