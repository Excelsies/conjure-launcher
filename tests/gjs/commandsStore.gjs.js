// gjs -m tests/gjs/commandsStore.gjs.js — the prefs editor's file store, against the real
// filesystem (no display needed). Exits non-zero on the first failure.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import System from 'system';

import { CommandsStore } from '../../common/commandsStore.js';
import { upsertEntry, emptyDoc } from '../../lib/commandsDoc.js';

let failures = 0;
function check(name, cond, detail = '') {
    print(`${cond ? 'ok' : 'not ok'} - ${name}${cond || !detail ? '' : ` (${detail})`}`);
    if (!cond)
        failures++;
}

const dir = GLib.dir_make_tmp('conjure-store-XXXXXX');
const path = GLib.build_filenamev([dir, 'sub', 'commands.json']);
const write = text => Gio.File.new_for_path(path).replace_contents(new TextEncoder().encode(text), null, false, Gio.FileCreateFlags.NONE, null);
const read = () => new TextDecoder().decode(Gio.File.new_for_path(path).load_contents(null)[1]);
const entry = { id: 'a', prefix: 'a', exec: 'x' };

try {
    let store = new CommandsStore(path);
    check('a missing file loads as an empty document', store.load().state === 'missing');
    check('saving creates the folder and the file', store.save(upsertEntry(emptyDoc(), null, entry)).ok);
    check('what was saved reads back', JSON.parse(read()).entries[0].id === 'a');

    store = new CommandsStore(path);
    store.load();
    // Give the file a different modification time, so its etag changes.
    GLib.usleep(1100000);
    write('{"version": 1, "entries": [{"id": "hand", "prefix": "hand", "exec": "x"}], "note": "edited by hand"}');
    const r = store.save(emptyDoc());
    check('a file changed on disk since it was read is not overwritten', r.ok === false && r.conflict === true, JSON.stringify(r));
    check('and the hand edit survives', read().includes('edited by hand'));

    store = new CommandsStore(path);
    check('a reload picks up the hand edit', store.load().doc.entries[0].id === 'hand');
    check('then saving works', store.save(upsertEntry(store.load().doc, 0, { id: 'hand', prefix: 'hand', exec: 'y' })).ok);
    check('and keeps unknown top-level keys', JSON.parse(read()).note === 'edited by hand');

    write('{ broken');
    store = new CommandsStore(path);
    check('a file that does not parse loads as invalid', store.load().state === 'invalid');
    const r2 = store.save(emptyDoc());
    check('and is never overwritten', r2.ok === false && read() === '{ broken', JSON.stringify(r2));

    GLib.unlink(path);
    store = new CommandsStore(path);
    store.load();
    write('{"version": 1, "entries": []}');
    check('a file created on disk after a "missing" load is not overwritten', store.save(upsertEntry(emptyDoc(), null, entry)).conflict === true);
} finally {
    GLib.spawn_command_line_sync(`rm -rf ${GLib.shell_quote(dir)}`);
}
System.exit(failures ? 1 : 0);
