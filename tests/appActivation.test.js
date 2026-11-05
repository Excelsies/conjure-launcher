// What Enter or a click does with an app that is already open (lib/appActivation.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { wantsNewWindow, RUNNING_APP_ACTIONS } from '../lib/appActivation.js';

test('the default opens a new window, and Ctrl or middle-click switches instead', () => {
    assert.equal(wantsNewWindow('new-window', false), true);
    assert.equal(wantsNewWindow('new-window', true), false);
});

test('"switch" switches, and Ctrl or middle-click opens a new window instead', () => {
    assert.equal(wantsNewWindow('switch', false), false);
    assert.equal(wantsNewWindow('switch', true), true);
});

test('an unknown or empty setting behaves like the default', () => {
    for (const v of ['', 'bogus', undefined])
        assert.equal(wantsNewWindow(v, false), true, String(v));
    assert.deepEqual([...RUNNING_APP_ACTIONS], ['new-window', 'switch']);
});
