// Integration test (headless GNOME Shell, tools/shell-test.sh): command entries from
// commands.json, dmenu mode through the real bin/conjure-dmenu CLI on the sandbox bus, and
// wallpapers. Everything writes only under the sandbox's XDG directories.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, extension, pressKeys, waitFor, sleep } from './lib/harness.js';

const STATE = GLib.getenv('XDG_STATE_HOME');
const ROOT = GLib.getenv('CONJURE_TEST_ROOT');
const statePath = name => GLib.build_filenamev([STATE, name]);

function readText(path) {
    try {
        return new TextDecoder().decode(Gio.File.new_for_path(path).load_contents(null)[1]);
    } catch {
        return null;
    }
}

function writeText(path, text) {
    const f = Gio.File.new_for_path(path);
    tryMkdir(f.get_parent().get_path());
    f.replace_contents(new TextEncoder().encode(text), null, false, Gio.FileCreateFlags.NONE, null);
}

function tryMkdir(dir) {
    try {
        Gio.File.new_for_path(dir).make_directory_with_parents(null);
    } catch {
        // already exists
    }
}

const alive = pid => pid && GLib.file_test(`/proc/${pid}`, GLib.FileTest.EXISTS) &&
    !/State:\s+Z/.test(readText(`/proc/${pid}/status`) ?? '');

function clipboardText() {
    return new Promise(resolve => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, t) => resolve(t)));
}

/** Run bin/conjure-dmenu with stdin; resolves {status, stdout}. */
function runDmenu(input, args = []) {
    const proc = Gio.Subprocess.new([`${ROOT}/bin/conjure-dmenu`, ...args],
        Gio.SubprocessFlags.STDIN_PIPE | Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
    return new Promise(resolve => proc.communicate_utf8_async(input, null, (_p, res) => {
        const [, stdout, stderr] = proc.communicate_utf8_finish(res);
        resolve({ status: proc.get_exit_status(), stdout, stderr });
    }));
}

const COMMANDS = {
    version: 1,
    entries: [
        { id: 'hosts', prefix: 'hosts', label: 'Hosts', freeform: true,
            command: "printf 'alpha\\tfirst host\\nbeta\\nhostile; touch \"$XDG_STATE_HOME/PWNED\"\\n'",
            exec: "printf '%s|%s' {selection} {query} > \"$XDG_STATE_HOME/exec-out\"" },
        { id: 'copy', prefix: 'copy', label: 'Copy', command: "printf 'one\\ntwo\\n'" },
        { id: 'web', prefix: 'web', label: 'Web', exec: "printf '%s' {query} > \"$XDG_STATE_HOME/web-out\"" },
        { id: 'slow', prefix: 'slow', label: 'Slow',
            command: "echo $$ > \"$XDG_STATE_HOME/slow.pid\"; sleep 30 & echo $! > \"$XDG_STATE_HOME/slowchild.pid\"; wait" },
        { id: 'clash', prefix: 'calc', label: 'Clash', exec: 'true' },
    ],
};

export async function run() {
    const t = new Suite();
    const ext = extension();
    const own = ext.stateObj.getSettings();
    const launcher = ext.stateObj.launcher;
    const registry = ext.stateObj.commands;
    const titles = () => launcher.panel?.rows.map(r => r.result?.title ?? r.action?.label) ?? [];
    const type = async (text, ms = 80) => {
        launcher.panel.setText(text);
        await sleep(ms);
    };
    const openWith = async (text, ms) => {
        if (!launcher.isOpen)
            launcher.open();
        await sleep(30);
        await type(text, ms);
    };

    // --- Command entries load from the file and reload when it changes ---
    t.equal('no commands.json means no entries', registry.entries.length, 0);
    writeText(registry.path, JSON.stringify(COMMANDS));
    t.check('the file is picked up after it changes', await waitFor(() => registry.entries.length === 4, 3000),
        JSON.stringify(registry.entries.map(e => e.id)));
    t.check('a prefix clashing with a built-in is dropped and reported',
        registry.errors.some(e => /clash.*prefix "calc" is already used/.test(e)), JSON.stringify(registry.errors));

    await openWith('/');
    t.check('the overview lists the command entries and /wall',
        ['/calc', '/emo', '/win', '/session', '/wall', '/hosts', '/copy', '/web', '/slow'].every(x => titles().includes(x)),
        titles().join(', '));

    await type('/hosts', 400);
    t.equal('a command entry lists its candidates (tab shows the subtitle)', titles(), ['alpha', 'beta', 'hostile; touch "$XDG_STATE_HOME/PWNED"']);
    t.equal('the subtitle comes from the text after the tab', launcher.panel.rows[0].result.subtitle, 'first host');
    await type('/hosts al', 200);
    t.equal('a real match ranks above the typed text of a freeform entry', titles(), ['alpha', 'al']);
    await type('/hosts be', 200);
    t.equal('typing filters the candidates', titles()[0], 'beta');
    await pressKeys(Clutter.KEY_Return);
    t.check('Enter runs exec with {selection} and {query}', await waitFor(() => readText(statePath('exec-out')) === 'beta|be', 2000),
        readText(statePath('exec-out')));

    await openWith('/hosts hostile', 400);
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => readText(statePath('exec-out'))?.startsWith('hostile'), 2000);
    t.equal('a hostile candidate reaches exec as literal text', readText(statePath('exec-out')),
        'hostile; touch "$XDG_STATE_HOME/PWNED"|hostile');
    await sleep(200);
    t.check('and runs nothing', !GLib.file_test(statePath('PWNED'), GLib.FileTest.EXISTS));

    await openWith('/copy two', 400);
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => !launcher.isOpen, 1000);
    t.equal('an entry without exec copies the selection', await clipboardText(), 'two');

    await openWith('/web hello world', 100);
    t.equal('an exec-only entry offers one result with the typed text', titles(), ['Web: hello world']);
    await pressKeys(Clutter.KEY_Return);
    t.check('and runs exec with {query}', await waitFor(() => readText(statePath('web-out')) === 'hello world', 2000),
        readText(statePath('web-out')));

    // --- Timeouts and closing kill the whole command (process group) ---
    await openWith('/slow', 300);
    const pid = Number(readText(statePath('slow.pid')));
    const child = Number(readText(statePath('slowchild.pid')));
    t.check('the slow command is running', alive(pid) && alive(child), `pid ${pid} child ${child}`);
    await sleep(2400);
    t.equal('it times out with no results', titles(), []);
    t.check('the timeout kills the shell and its background child', !alive(pid) && !alive(child), `pid ${pid} child ${child}`);
    launcher.close('test');

    GLib.unlink(statePath('slow.pid'));
    await openWith('/slow', 300);
    const pid2 = Number(readText(statePath('slow.pid')));
    const child2 = Number(readText(statePath('slowchild.pid')));
    // Without this, a stale cache that skipped the rerun would make the kill check pass vacuously.
    t.check('reopening runs the command again (the cache is per open)', alive(pid2) && alive(child2) && pid2 !== pid,
        `pid ${pid2} child ${child2}`);
    await pressKeys(Clutter.KEY_Escape);
    await sleep(300);
    t.check('closing the launcher kills a command still running', !alive(pid2) && !alive(child2), `pid ${pid2} child ${child2}`);

    // --- Reload: removed entries go; a broken file keeps the last good entries ---
    writeText(registry.path, JSON.stringify({ version: 1, entries: COMMANDS.entries.filter(e => e.id !== 'copy') }));
    t.check('removing an entry from the file removes it', await waitFor(() =>
        !registry.entries.some(e => e.id === 'copy') && registry.entries.length === 3, 3000));
    writeText(registry.path, '{ not json');
    await sleep(600);
    t.equal('a broken file keeps the previous entries', registry.entries.map(e => e.id), ['hosts', 'web', 'slow']);

    // --- dmenu mode through the real CLI ---
    const colours = 'red\nGreen\tcolour\nblue\n';
    let pending = runDmenu(colours, ['-p', 'Pick a colour']);
    t.check('conjure-dmenu opens the launcher', await waitFor(() => launcher.isOpen && launcher.panel?.rows.length === 3, 3000));
    t.equal('scoped to the candidates', titles(), ['red', 'Green', 'blue']);
    t.equal('no settings gear in dmenu mode', launcher.panel.settingsIcon, null);
    t.check('with no tabs', !launcher.panel.panelActor.get_children().some(c => c.visible && c.get_children?.().some(b => b instanceof St.Button)));
    await type('gre');
    await pressKeys(Clutter.KEY_Return);
    let r = await pending;
    t.equal('Enter prints the whole line and exits 0', [r.status, r.stdout], [0, 'Green\tcolour\n']);

    pending = runDmenu(colours);
    await waitFor(() => launcher.isOpen, 3000);
    await pressKeys(Clutter.KEY_Escape);
    r = await pending;
    t.equal('Esc exits 1 with no output', [r.status, r.stdout], [1, '']);

    pending = runDmenu(colours);
    await waitFor(() => launcher.isOpen, 3000);
    await type('purple');
    t.equal('with no match the typed text is offered', titles(), ['purple']);
    await pressKeys(Clutter.KEY_Return);
    r = await pending;
    t.equal('and Enter returns it', [r.status, r.stdout], [0, 'purple\n']);

    const first = runDmenu('a\nb\n');
    await waitFor(() => launcher.isOpen, 3000);
    const second = runDmenu('c\nd\n');
    const firstResult = await first;
    t.equal('a newer dmenu call cancels the older one', firstResult.status, 1);
    await waitFor(() => titles().includes('c'), 3000);
    await pressKeys(Clutter.KEY_Return);
    t.equal('and the newer one still works', (await second).stdout, 'c\n');

    // --- Wallpapers (a sandbox folder; the background setting is the sandbox's) ---
    const wallDir = GLib.build_filenamev([STATE, 'walls']);
    tryMkdir(GLib.build_filenamev([wallDir, 'nature']));
    const png = GLib.base64_decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==');
    for (const name of ['sunset.png', 'nature/forest.png', 'notes.txt'])
        Gio.File.new_for_path(GLib.build_filenamev([wallDir, name])).replace_contents(png, null, false, Gio.FileCreateFlags.NONE, null);
    own.set_string('wallpaper-dir', wallDir);
    await openWith('/wall', 400);
    t.equal('/wall lists images recursively and skips other files', titles().sort(), ['forest.png', 'sunset.png']);
    await type('/wall sun', 200);
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => !launcher.isOpen, 1000);
    const bg = new Gio.Settings({ schema_id: 'org.gnome.desktop.background' });
    const uri = Gio.File.new_for_path(GLib.build_filenamev([wallDir, 'sunset.png'])).get_uri();
    t.equal('Enter sets the light and dark backgrounds', [bg.get_string('picture-uri'), bg.get_string('picture-uri-dark')], [uri, uri]);

    // --- Disable while a dmenu call is pending: the client gets an error, not a hang ---
    pending = runDmenu('x\n');
    await waitFor(() => launcher.isOpen, 3000);
    Main.extensionManager.disableExtension(ext.uuid);
    r = await pending;
    t.check('disable answers a pending dmenu call with an error (exit 2)', r.status === 2, `status ${r.status} ${r.stderr}`);

    t.finish();
}
