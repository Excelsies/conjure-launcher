// Fixture GNOME search provider (org.gnome.Shell.SearchProvider2) for the headless tests.
// Activated by D-Bus inside the test sandbox only. Behavior:
//   "zebrafile"  -> two results;  "slowzebra" -> answers after 2 s (tests the timeout)
// Every GetInitialResultSet call and every ActivateResult is appended to
// $XDG_STATE_HOME/conjure-test-search.log so the test can count and verify them.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

const IFACE = `<node><interface name="org.gnome.Shell.SearchProvider2">
<method name="GetInitialResultSet"><arg type="as" direction="in"/><arg type="as" direction="out"/></method>
<method name="GetSubsearchResultSet"><arg type="as" direction="in"/><arg type="as" direction="in"/><arg type="as" direction="out"/></method>
<method name="GetResultMetas"><arg type="as" direction="in"/><arg type="aa{sv}" direction="out"/></method>
<method name="ActivateResult"><arg type="s" direction="in"/><arg type="as" direction="in"/><arg type="u" direction="in"/></method>
<method name="LaunchSearch"><arg type="as" direction="in"/><arg type="u" direction="in"/></method>
</interface></node>`;

const logPath = GLib.build_filenamev([GLib.get_user_state_dir(), 'conjure-test-search.log']);
function record(line) {
    const f = Gio.File.new_for_path(logPath);
    const s = f.append_to(Gio.FileCreateFlags.NONE, null);
    s.write_all(new TextEncoder().encode(`${line}\n`), null);
    s.close(null);
}

function resultsFor(terms) {
    const q = terms.join(' ').toLowerCase();
    if (q.includes('zebrafile'))
        return ['file-1', 'file-2'];
    if (q.includes('slowzebra'))
        return ['slow-1'];
    return [];
}

const impl = {
    GetInitialResultSetAsync([terms], invocation) {
        record(`initial ${terms.join(' ')}`);
        const ids = resultsFor(terms);
        const reply = () => invocation.return_value(new GLib.Variant('(as)', [ids]));
        if (terms.join(' ').includes('slowzebra'))
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                reply();
                return GLib.SOURCE_REMOVE;
            });
        else
            reply();
    },
    GetSubsearchResultSet(_previous, terms) {
        return resultsFor(terms);
    },
    GetResultMetas(ids) {
        return ids.map(id => ({
            id: new GLib.Variant('s', id),
            name: new GLib.Variant('s', id === 'slow-1' ? 'Slow Zebra' : `Zebra File ${id.slice(-1)}`),
            description: new GLib.Variant('s', 'Fixture search result'),
        }));
    },
    ActivateResult(id, terms) {
        record(`activate ${id} ${terms.join(' ')}`);
    },
    LaunchSearch() {},
};

const loop = new GLib.MainLoop(null, false);
const exported = Gio.DBusExportedObject.wrapJSObject(IFACE, impl);
Gio.bus_own_name(Gio.BusType.SESSION, 'org.conjure.TestSearch', Gio.BusNameOwnerFlags.NONE,
    conn => exported.export(conn, '/org/conjure/TestSearch'), null, () => loop.quit());
loop.run();
