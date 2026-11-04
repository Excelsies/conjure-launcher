// Router, ranking, app scoring, usage file parsing and theme resolution.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { route } from '../lib/router.js';
import { rank, usageBoost, TYPED_USAGE_SCORE_CAP } from '../lib/ranking.js';
import { scoreApp, NAME_MATCH_PRIORITY, LOCALIZED_NAME_MATCH_PRIORITY } from '../lib/appScore.js';
import { UsageModel, RECENT_LIMIT } from '../lib/usage.js';
import { resolveTheme, parseColour, styles, COLOUR_TOKENS } from '../lib/theme.js';

const apps = { id: 'apps' };
const calc = { id: 'calc', trigger: 'calc', global: true, acceptsGlobal: t => /\d/.test(t) };
const calculus = { id: 'calculus', trigger: 'calculus' };
const emoji = { id: 'emoji', trigger: 'emo' };
const P = [apps, calc, calculus, emoji];

// --- router ---
test('router: longest prefix wins and one leading space is dropped', () => {
    assert.deepEqual(route('/calculus  x', P, '/'), { kind: 'prefixed', provider: calculus, query: ' x' });
    assert.deepEqual(route('/calc 2+2', P, '/'), { kind: 'prefixed', provider: calc, query: '2+2' });
    assert.deepEqual(route('/emo', P, '/'), { kind: 'prefixed', provider: emoji, query: '' });
});

test('router: a bare prefix (or unknown trigger) is the provider overview', () => {
    assert.deepEqual(route('/', P, '/'), { kind: 'overview', query: '' });
    assert.deepEqual(route('/zz', P, '/'), { kind: 'overview', query: 'zz' });
});

test('router: global search includes apps and opted-in providers only when they accept', () => {
    assert.deepEqual(route('firefox', P, '/').providers, [apps]);
    assert.deepEqual(route('12', P, '/').providers, [apps, calc]);
    assert.deepEqual(route('1', P, '/').providers, [apps], 'opt-in needs 2+ chars');
    assert.deepEqual(route(' 1 ', P, '/').providers, [apps], 'length is measured trimmed');
});

test('router: an empty prefix setting disables scoping but not opt-in global providers', () => {
    assert.equal(route('/calc 1', P, '').kind, 'global');
    assert.deepEqual(route('12', P, '').providers, [apps, calc]);
});

// --- ranking ---
test('usage boost: free when no query, capped and match-only when typed', () => {
    assert.equal(usageBoost(0, 30, false), 3);
    assert.equal(usageBoost(5, 30, true), TYPED_USAGE_SCORE_CAP);
    assert.equal(usageBoost(-Infinity, 30, true), 0);
    assert.equal(usageBoost(5, 0, true), 0);
});

test('rank: boosts only tracked providers, sorts high-first, stable on ties, no mutation', () => {
    const input = [{ id: 'x', title: 'X', score: 1 }, { id: 'y', title: 'Y', score: 1 }];
    const out = rank([
        { provider: { id: 'apps', trackUsage: true }, results: input },
        { provider: { id: 'calc' }, results: [{ id: 'c', title: 'C', score: 1 }] },
    ], { usageCount: (p, id) => (id === 'y' || id === 'c' ? 3 : 0), typedQuery: true, sortByUsage: true });
    assert.deepEqual(out.map(r => r.id), ['y', 'x', 'c']);
    assert.equal(out[0].providerId, 'apps');
    assert.equal(input[1].score, 1, 'input was mutated');
});

test('rank: sort-by-usage off means no boost at all', () => {
    const out = rank([{ provider: { id: 'apps', trackUsage: true },
        results: [{ id: 'x', title: 'X', score: 1 }, { id: 'y', title: 'Y', score: 1 }] }],
    { usageCount: () => 5, typedQuery: false, sortByUsage: false });
    assert.deepEqual(out.map(r => [r.id, r.score]), [['x', 1], ['y', 1]]);
});

// --- app scoring ---
const entry = (o) => ({
    nameLower: '', altNamesLower: [], genericLower: '', keywordsLower: [], categoriesLower: [],
    idLower: '', execLower: '', ...o,
});

test('app score: a name match always beats a non-name match', () => {
    const byName = scoreApp('term', entry({ nameLower: 'terminal' }));
    const byKeyword = scoreApp('term', entry({ nameLower: 'console', keywordsLower: ['term'] }));
    assert.ok(byName > NAME_MATCH_PRIORITY);
    assert.ok(byName > byKeyword);
});

test('app score: name prefix bonus, alt name tier, empty and no-match', () => {
    const prefix = scoreApp('fire', entry({ nameLower: 'firefox' }));
    const inner = scoreApp('fox', entry({ nameLower: 'firefox' }));
    assert.ok(prefix - inner > 400);
    // Tiers are offsets, not bands (as in Noctalia): at equal match quality a name match wins.
    const alt = scoreApp('dateien', entry({ nameLower: 'files', altNamesLower: ['dateien'] }));
    const name = scoreApp('dateien', entry({ nameLower: 'dateien' }));
    assert.equal(alt, 1024 * 5 + LOCALIZED_NAME_MATCH_PRIORITY);
    assert.equal(name, 1024 * 5 + 500 + NAME_MATCH_PRIORITY);
    assert.ok(name > alt);
    assert.equal(scoreApp('', entry({ nameLower: 'x' })), 0);
    assert.equal(scoreApp('zzz', entry({ nameLower: 'firefox' })), -Infinity);
});

test('app score: each secondary field can match on its own', () => {
    for (const [field, value] of [['genericLower', 'web browser'], ['keywordsLower', ['internet']],
        ['categoriesLower', ['network']], ['idLower', 'org.mozilla.firefox'], ['execLower', 'firefox-bin']]) {
        const s = scoreApp(field === 'execLower' ? 'bin' : field === 'idLower' ? 'mozilla' : String(value).slice(0, 4),
            entry({ nameLower: 'zzzz', [field]: value }));
        assert.ok(Number.isFinite(s) && s < LOCALIZED_NAME_MATCH_PRIORITY, `${field}: ${s}`);
    }
});

// --- usage model ---
test('usage: record, count, recent order, recent cap', () => {
    const m = new UsageModel();
    for (let i = 0; i < RECENT_LIMIT + 5; i++)
        m.record('apps', `app${i}`);
    m.record('apps', 'app3');
    assert.equal(m.count('apps', 'app3'), 2);
    assert.equal(m.recent('apps')[0], 'app3');
    assert.equal(m.recent('apps').length, RECENT_LIMIT);
    assert.equal(m.recentIndex('apps', 'app3'), RECENT_LIMIT);
    assert.equal(m.recentIndex('apps', 'nope'), 0);
});

test('usage: serialize/parse round trip, including a "__proto__" id and provider', () => {
    const m = new UsageModel();
    m.record('apps', 'org.gnome.Nautilus');
    m.record('apps', '__proto__');
    m.record('__proto__', 'x');
    const text = m.serialize();
    const { model, dropped } = UsageModel.parse(text);
    assert.equal(dropped, 0);
    assert.equal(model.count('apps', 'org.gnome.Nautilus'), 1);
    assert.equal(model.count('apps', '__proto__'), 1);
    assert.equal(model.count('__proto__', 'x'), 1);
    assert.deepEqual(model.recent('apps'), ['__proto__', 'org.gnome.Nautilus']);
    assert.equal(Object.getPrototypeOf(JSON.parse(text).counts), Object.prototype);
});

test('usage: bad entries are dropped one by one, the rest survives', () => {
    const text = JSON.stringify({
        version: 1,
        counts: { apps: { good: 3, neg: -1, frac: 1.5, str: '2', huge: 1e12 }, bad: [1] },
        recent: { apps: ['good', 7, '', 'good', null], other: 'x' },
    });
    const { model, dropped } = UsageModel.parse(text);
    assert.equal(model.count('apps', 'good'), 3);
    assert.deepEqual(model.recent('apps'), ['good']);
    // counts: neg, frac, str, huge (4) + bad (1); recent: 7, '', dup good, null (4) + other (1)
    assert.equal(dropped, 10);
});

test('usage: non-object counts/recent are dropped, not fatal', () => {
    const { model, dropped } = UsageModel.parse(JSON.stringify({ version: 1, counts: 5, recent: [] }));
    assert.equal(dropped, 2);
    assert.equal(model.count('apps', 'x'), 0);
});

test('usage: unreadable files throw so the caller can quarantine them', () => {
    assert.throws(() => UsageModel.parse('{not json'), SyntaxError);
    assert.throws(() => UsageModel.parse('[]'), SyntaxError);
    assert.throws(() => UsageModel.parse('null'), SyntaxError);
    assert.throws(() => UsageModel.parse('{"version": 2}'), SyntaxError);
});

// --- theme ---
test('theme: colour parsing', () => {
    assert.deepEqual(parseColour('#abc'), { r: 0xaa, g: 0xbb, b: 0xcc, a: 1 });
    assert.deepEqual(parseColour('#FFF59B'), { r: 255, g: 245, b: 155, a: 1 });
    assert.equal(parseColour('#00000080').a, 0.502);
    for (const bad of ['', 'red', '#12', '#12345', 'rgb(1,2,3)', '#gggggg', null, 5])
        assert.equal(parseColour(bad), null, String(bad));
});

test('theme: empty values use Noctalia defaults; invalid ones fall back and are reported', () => {
    const t = resolveTheme({ 'primary': '#89b4fa', 'hover': 'nope', 'radius-scale': 9, 'font-family': 'x; color: red' });
    assert.deepEqual(t.colours['primary'], parseColour('#89b4fa'));
    assert.deepEqual(t.colours['hover'], parseColour(COLOUR_TOKENS['hover']));
    assert.deepEqual(t.colours['surface'], parseColour(COLOUR_TOKENS['surface']));
    assert.equal(t.radiusScale, 1);
    assert.equal(t.fontFamily, '');
    assert.deepEqual(t.invalid.sort(), ['font-family', 'hover', 'radius-scale']);
    assert.deepEqual(resolveTheme({}).invalid, []);
});

test('theme: font family rejects every CSS breakout character', () => {
    for (const ch of [';', '{', '}', ':', '"', '\\', '\n', '\r'])
        assert.equal(resolveTheme({ 'font-family': `Inter${ch}x` }).fontFamily, '', JSON.stringify(ch));
    assert.equal(resolveTheme({ 'font-family': ' Inter Display ' }).fontFamily, 'Inter Display');
});

test('theme: every style is free of hard-coded hex colours and uses rgba()', () => {
    const s = styles(resolveTheme({ 'primary': '#010203' }));
    for (const [name, css] of Object.entries(s))
        assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b/i, `${name} has a hex colour`);
    assert.match(s.rowSelected, /rgba\(1, 2, 3, 1\)/);
});

test('remote results rank below app name matches and above fuzzy secondary matches', async () => {
    const { remoteResultScore } = await import('../lib/ranking.js');
    const nameMatch = scoreApp('files', entry({ nameLower: 'files' }));
    const fuzzyKeyword = scoreApp('brw', entry({ nameLower: 'zzz', keywordsLower: ['browser'] }));
    const exactGeneric = scoreApp('web browser', entry({ nameLower: 'zzz', genericLower: 'web browser' }));
    assert.ok(remoteResultScore(0, 0) < nameMatch);
    assert.ok(remoteResultScore(5, 4) > fuzzyKeyword, `fuzzy keyword ${fuzzyKeyword}`);
    assert.ok(exactGeneric > remoteResultScore(0, 0), 'an exact generic-name match outranks remote results');
    assert.ok(remoteResultScore(0, 1) < remoteResultScore(0, 0) && remoteResultScore(1, 0) < remoteResultScore(0, 4));
});
