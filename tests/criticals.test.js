// The runtime-criticals gate (tools/lib/criticals.js). The fixture is copied verbatim from a real failing
// run: GNOME Shell's Background Apps toggle touched after disposal while the shell shut down, after the
// script's last check. Each exemption condition is witnessed by breaking that one condition alone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { classifyCriticals } from '../tools/lib/criticals.js';

const REAL = readFileSync(new URL('./fixtures/shell-teardown.log', import.meta.url), 'utf8');
const lines = REAL.split('\n');
const summary = lines.findIndex(l => /# \d+\/\d+ passed/.test(l));
const firstCritical = lines.findIndex(l => /CRITICAL \*\*/.test(l));
// Copied verbatim from a real run: a critical that is not a disposal one.
const HELPER = '(gnome-shell:1886205): GNOME Shell-CRITICAL **: 16:59:17.466: Failed to exit helper: Gio.DBusError: GDBus.Error:org.freedesktop.DBus.Error.ServiceUnknown: The name org.gnome.Shell.PerfHelper was not provided by any .service files';

test('the real shell-teardown log: both disposal criticals are exempt, none fail', () => {
    assert.ok(summary === 0 && firstCritical > summary);
    const r = classifyCriticals(REAL);
    assert.deepEqual(r.failing, []);
    assert.equal(r.teardown.length, 2);
});

test('before the last check, the same critical fails', () => {
    const moved = [...lines.slice(1), lines[0]].join('\n');
    assert.equal(classifyCriticals(moved).failing.length, 2);
});

test('with no "passed" line (the script failed), it fails', () => {
    assert.equal(classifyCriticals(lines.slice(1).join('\n')).failing.length, 2);
});

test('a critical that is not a disposal one fails, even after the last check', () => {
    const r = classifyCriticals([...lines, HELPER].join('\n'));
    assert.deepEqual(r.failing, [HELPER]);
});

test('a frame outside the shell\'s own code (for example this extension) fails', () => {
    const ours = REAL.replace('resource:///org/gnome/shell/ui/popupMenu.js:915',
        'file:///tmp/x/gnome-shell/extensions/conjure-launcher@excelsies/ui/panel.js:200');
    const r = classifyCriticals(ours);
    assert.equal(r.failing.length, 1);
    assert.ok(r.failing[0].includes('St.BoxLayout'));
});

test('a disposal critical with no stack trace fails', () => {
    const bare = lines.filter(l => !/^== Stack trace/.test(l)).join('\n');
    assert.equal(classifyCriticals(bare).failing.length, 2);
});

test('our own log lines and the extra-allowed pattern are accepted anywhere', () => {
    const own = '(gnome-shell:1): GNOME Shell-CRITICAL **: 1: [conjure-launcher] command for "slow" failed: timed out after 2000 ms';
    assert.deepEqual(classifyCriticals(own).failing, []);
    assert.deepEqual(classifyCriticals(HELPER, { extraAllowed: 'PerfHelper' }).failing, []);
    assert.deepEqual(classifyCriticals(HELPER).failing, [HELPER]);
});
