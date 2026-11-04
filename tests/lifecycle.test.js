// Invariant 2: the modal grab is always released, exactly once, from any close path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PanelLifecycle } from '../lib/lifecycle.js';

function harness({ pushThrows = false, popThrows = false, onOpenThrows = false } = {}) {
    const log = [];
    let grabs = 0;
    const lc = new PanelLifecycle({
        push: () => {
            if (pushThrows)
                throw new Error('no grab');
            grabs++;
            log.push('push');
            return { id: grabs };
        },
        pop: g => {
            log.push(`pop:${g?.id}`);
            grabs--;
            if (popThrows)
                throw new Error('incorrect pop');
        },
        onOpen: () => {
            log.push('open');
            if (onOpenThrows)
                throw new Error('build failed');
        },
        onClose: r => log.push(`close:${r}`),
        logError: () => log.push('error'),
    });
    return { lc, log, grabs: () => grabs };
}

for (const reason of ['escape', 'activate', 'click-outside', 'focus-lost', 'monitors-changed',
    'locked', 'disable', 'toggle']) {
    test(`close path "${reason}" releases the grab once`, () => {
        const h = harness();
        assert.equal(h.lc.open(), true);
        h.lc.close(reason);
        h.lc.close(reason);
        h.lc.close('disable');
        assert.equal(h.grabs(), 0);
        assert.deepEqual(h.log, ['push', 'open', 'pop:1', `close:${reason}`]);
        assert.equal(h.lc.isOpen, false);
    });
}

test('the open flag is false before the grab is released (toggle mid-close sees closed)', () => {
    let seenDuringPop;
    const lc = new PanelLifecycle({
        push: () => ({}),
        pop: () => {
            seenDuringPop = lc.isOpen;
        },
    });
    lc.open();
    lc.close('escape');
    assert.equal(seenDuringPop, false);
});

test('a failed grab leaves the panel closed and nothing to pop', () => {
    const h = harness({ pushThrows: true });
    assert.equal(h.lc.open(), false);
    assert.equal(h.lc.isOpen, false);
    h.lc.close('disable');
    assert.ok(!h.log.some(l => l.startsWith('pop')));
});

test('a throwing pop still ends closed and still runs onClose', () => {
    const h = harness({ popThrows: true });
    h.lc.open();
    h.lc.close('escape');
    assert.equal(h.lc.isOpen, false);
    assert.ok(h.log.includes('close:escape'));
    assert.ok(h.log.includes('error'));
});

test('a throwing onOpen releases the grab it just took', () => {
    const h = harness({ onOpenThrows: true });
    assert.equal(h.lc.open(), false);
    assert.equal(h.grabs(), 0);
    assert.equal(h.lc.isOpen, false);
});

test('toggle opens then closes; reopening takes a fresh grab', () => {
    const h = harness();
    assert.equal(h.lc.toggle(), true);
    assert.equal(h.lc.toggle(), false);
    assert.equal(h.lc.toggle(), true);
    assert.equal(h.grabs(), 1);
    h.lc.close('disable');
    assert.equal(h.grabs(), 0);
});
