import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isTerminal, pasteChord, shouldPaste } from '../lib/paste.js';

test('terminals get Ctrl+Shift+V, everything else Ctrl+V', () => {
    for (const c of ['org.gnome.Ptyxis', 'gnome-terminal-server', 'kitty', 'Alacritty', 'org.wezfurlong.wezterm', 'foot', 'com.mitchellh.ghostty'])
        assert.deepEqual(pasteChord(c), ['Control_L', 'Shift_L', 'v'], c);
    for (const c of ['firefox', 'org.gnome.TextEditor', 'code', '', null, undefined])
        assert.deepEqual(pasteChord(c), ['Control_L', 'v'], String(c));
    assert.equal(isTerminal('org.gnome.Nautilus'), false);
});

test('invariant 5: only back into the window that was focused before opening', () => {
    const w = { id: 1 };
    const other = { id: 2 };
    assert.equal(shouldPaste({ enabled: true, copied: true, previous: w, current: w }), true);
    assert.equal(shouldPaste({ enabled: false, copied: true, previous: w, current: w }), false, 'setting off');
    assert.equal(shouldPaste({ enabled: true, copied: false, previous: w, current: w }), false, 'nothing copied');
    assert.equal(shouldPaste({ enabled: true, copied: true, previous: w, current: other }), false, 'another window');
    assert.equal(shouldPaste({ enabled: true, copied: true, previous: null, current: null }), false, 'no window before');
    assert.equal(shouldPaste({ enabled: true, copied: true, previous: w, current: null }), false, 'focus went nowhere');
});
