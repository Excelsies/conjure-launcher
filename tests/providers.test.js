// Pure logic of the providers: emoji, session actions, provider overview.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { indexEmoji, searchEmoji, scoreEmoji, MAX_EMOJI_RESULTS } from '../lib/emoji.js';
import { searchSession, SESSION_ACTIONS } from '../lib/session.js';
import { providerOverview } from '../lib/overview.js';

const data = indexEmoji(JSON.parse(readFileSync(new URL('../data/emoji.json', import.meta.url), 'utf8')));

test('the vendored emoji data loads completely', () => {
    assert.equal(data.length, 1913);
    assert.ok(data.every(e => e.emoji && e.name));
});

test('emoji scoring tiers (Noctalia)', () => {
    const e = { nameLower: 'grinning face', keywords: ['smile', 'happy'] };
    assert.equal(scoreEmoji('grinning face', e), 1000);
    assert.equal(scoreEmoji('grin', e), 500);
    assert.equal(scoreEmoji('face', e), 200);
    assert.equal(scoreEmoji('smile', e), 150);
    assert.equal(scoreEmoji('hap', e), 100);
    assert.equal(scoreEmoji('ppy', e), 50);
    assert.equal(scoreEmoji('zzz', e), 0);
});

test('emoji search: best first, capped, case-insensitive', () => {
    const r = searchEmoji(data, 'Grinning Face');
    assert.equal(r[0].badge, '😀');
    assert.equal(r[0].score, 1000);
    assert.ok(searchEmoji(data, 'a').length <= MAX_EMOJI_RESULTS);
    assert.equal(searchEmoji(data, '').length, MAX_EMOJI_RESULTS);
    assert.deepEqual(searchEmoji(data, 'qqqqzz'), []);
    assert.match(r[0].id, /^emoji-/);
});

test('indexEmoji drops malformed entries instead of throwing', () => {
    assert.equal(indexEmoji([null, 5, {}, { emoji: 'x' }, { emoji: '😀', name: 'ok', keywords: [1, 'k'] }]).length, 1);
    assert.deepEqual(indexEmoji({}), []);
});

test('session: aliases find actions; unavailable actions are hidden', () => {
    const all = () => true;
    assert.equal(searchSession('sleep', all)[0].id, 'suspend');
    assert.equal(searchSession('shutdown', all)[0].id, 'power-off');
    assert.equal(searchSession('reboot', all)[0].id, 'restart');
    assert.equal(searchSession('sign out', all)[0].id, 'logout');
    assert.deepEqual(searchSession('', all).map(r => r.id), SESSION_ACTIONS.map(a => a.id));
    assert.ok(!searchSession('', a => a.id !== 'power-off').some(r => r.id === 'power-off'));
    assert.deepEqual(searchSession('qqzz', all), []);
});

test('provider overview lists triggered providers and filters them', () => {
    const P = [{ id: 'apps' }, { id: 'calc', trigger: 'calc', displayName: 'Calculator' },
        { id: 'emoji', trigger: 'emo', displayName: 'Emoji' }];
    assert.deepEqual(providerOverview(P, '', '/').map(r => r.title), ['/calc', '/emo']);
    assert.deepEqual(providerOverview(P, 'emo', '/').map(r => r.title), ['/emo']);
    assert.equal(providerOverview(P, '', '/')[0].query, '/calc ');
    assert.deepEqual(providerOverview(P, 'zzz', '/'), []);
});
