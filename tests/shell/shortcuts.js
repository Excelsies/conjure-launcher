// /set (GNOME Settings pages) and /rec (recent files). Opening is replaced by recorders, so nothing starts.
// /rec reads a fixture recently-used.xbel in the sandbox's XDG_DATA_HOME.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import { Suite, extension, pressKeys, waitFor, sleep } from './lib/harness.js';

const DATA = GLib.getenv('XDG_DATA_HOME');

function writeFile(path, text) {
    Gio.File.new_for_path(path).replace_contents(new TextEncoder().encode(text), null, false, Gio.FileCreateFlags.NONE, null);
}

function xbel(entries) {
    const items = entries.map(([uri, modified, mime]) => `<bookmark href="${uri}" added="${modified}" modified="${modified}" visited="${modified}">
<info><metadata owner="http://freedesktop.org"><mime:mime-type type="${mime}"/></metadata></info></bookmark>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>
<xbel version="1.0" xmlns:bookmark="http://www.freedesktop.org/standards/desktop-bookmarks" xmlns:mime="http://www.freedesktop.org/standards/shared-mime-info">
${items}
</xbel>
`;
}

export async function run() {
    const t = new Suite();
    const ext = extension();
    const launcher = ext.stateObj.launcher;
    const find = id => ext.stateObj._providers.find(p => p.id === id);
    const titles = () => launcher.panel?.rows.map(r => r.result?.title) ?? [];
    const subtitles = () => launcher.panel?.rows.map(r => r.result?.subtitle) ?? [];
    const openWith = async (text, ms = 300) => {
        if (!launcher.isOpen)
            launcher.open();
        await sleep(30);
        launcher.panel.setText(text);
        await sleep(ms);
    };

    // --- /set ---
    const panels = find('settings-panels');
    const launched = [];
    panels.launch = info => launched.push(info.get_id());
    await openWith('/set');
    t.check('/set lists Settings pages, the fixture page included', titles().includes('Conjure Test Panel'), JSON.stringify(titles().slice(0, 8)));
    t.check('and not ordinary apps (a fixture app is absent)', !titles().some(x => /Conjure Test Alpha/.test(x ?? '')), JSON.stringify(titles()));
    await openWith('/set zebrafish');
    t.equal('a page is found by its keywords', titles()[0], 'Conjure Test Panel');
    await openWith('/set conjure test');
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => !launcher.isOpen, 1000);
    t.equal('Enter opens that page', launched, ['conjure-test-panel.desktop']);

    // --- /rec ---
    const recent = find('recent-files');
    const opened = [];
    recent.launchUri = uri => opened.push(uri);
    const docs = GLib.build_filenamev([DATA, 'docs']);
    GLib.mkdir_with_parents(docs, 0o755);
    const older = GLib.build_filenamev([docs, 'older-report.txt']);
    const newer = GLib.build_filenamev([docs, 'newer-notes.md']);
    writeFile(older, 'a');
    writeFile(newer, 'b');
    const uri = p => Gio.File.new_for_path(p).get_uri();
    writeFile(recent.path, xbel([
        [uri(older), '2026-11-01T10:00:00Z', 'text/plain'],
        [uri(newer), '2026-11-03T10:00:00Z', 'text/markdown'],
        [uri(GLib.build_filenamev([docs, 'deleted.txt'])), '2026-11-04T10:00:00Z', 'text/plain'],
        ['https://example.com/page', '2026-11-04T11:00:00Z', 'text/html'],
    ]));
    await openWith('/rec');
    t.equal('/rec lists recent files newest first, skipping deleted files and web pages', titles(), ['newer-notes.md', 'older-report.txt']);
    t.equal('with the folder as the subtitle', subtitles()[0], docs);
    await openWith('/rec older');
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => !launcher.isOpen, 1000);
    t.equal('Enter opens the file', opened, [uri(older)]);

    writeFile(recent.path, '<xbel this is not xml');
    await openWith('/rec');
    t.equal('an unreadable list gives no results', titles(), []);
    launcher.close('test');
    Gio.File.new_for_path(recent.path).delete(null);
    await openWith('/rec');
    t.equal('and so does a missing one', titles(), []);
    launcher.close('test');
    t.finish();
}
