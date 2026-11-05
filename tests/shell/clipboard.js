// Clipboard history (/clip): real copies through the shell's clipboard are kept, newest first, and Enter copies
// one back. Invariant 7: a copy marked secret is never kept. Mutter's in-memory selection source offers a
// single MIME type, so the secret path drives the provider's owner-changed handler with a source that offers
// text plus the password-manager hint, exactly as such apps do; a positive call with the same text proves the
// read path is live.
import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, extension, pressKeys, waitFor, sleep } from './lib/harness.js';

const copy = text => St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, text);
const read = () => new Promise(r => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, t) => r(t)));

export async function run() {
    const t = new Suite();
    const ext = extension();
    const own = ext.stateObj.getSettings();
    const launcher = ext.stateObj.launcher;
    const clip = ext.stateObj._providers.find(p => p.id === 'clipboard');
    const kept = () => clip.history.items().map(i => i.text);
    const titles = () => launcher.panel?.rows.map(r => r.result?.title) ?? [];

    t.equal('clipboard history is on by default, keeping 50', [own.get_boolean('clipboard-history'), own.get_int('clipboard-history-size')], [true, 50]);
    copy('first copy');
    await waitFor(() => kept().includes('first copy'), 2000);
    copy('second copy');
    t.check('real copies are kept, newest first', await waitFor(() => kept()[0] === 'second copy' && kept()[1] === 'first copy', 2000), JSON.stringify(kept()));

    // Secret path: the text is on the clipboard while history is off (so the real handler ignores it).
    own.set_boolean('clipboard-history', false);
    t.equal('turning history off clears it', kept(), []);
    copy('hunter2');
    await sleep(200);
    own.set_boolean('clipboard-history', true);
    const offering = mimes => ({ get_mimetypes: () => mimes });
    clip.onOwnerChanged(Meta.SelectionType.SELECTION_CLIPBOARD, offering(['text/plain;charset=utf-8', 'x-kde-passwordManagerHint']));
    await sleep(300);
    t.check('invariant 7: a copy marked secret is not kept', !kept().includes('hunter2'), JSON.stringify(kept()));
    clip.onOwnerChanged(Meta.SelectionType.SELECTION_CLIPBOARD, offering(['text/plain;charset=utf-8']));
    t.check('the same copy without the hint is kept (the read path works)', await waitFor(() => kept().includes('hunter2'), 2000));
    // Witnessed by the reads issued: a re-read of the clipboard would only re-add text already kept.
    const reads = clip.reads;
    clip.onOwnerChanged(Meta.SelectionType.SELECTION_PRIMARY, offering(['text/plain;charset=utf-8']));
    t.equal('only the clipboard is watched, not the primary selection (no read)', clip.reads, reads);
    clip.onOwnerChanged(Meta.SelectionType.SELECTION_CLIPBOARD, offering(['text/plain;charset=utf-8', 'x-kde-passwordManagerHint']));
    t.equal('a secret copy is not even read', clip.reads, reads);

    // /clip lists them; Enter copies one back.
    copy('alpha one');
    await waitFor(() => kept()[0] === 'alpha one', 2000);
    copy('beta two');
    await waitFor(() => kept()[0] === 'beta two', 2000);
    launcher.open();
    await sleep(50);
    launcher.panel.setText('/clip');
    await sleep(300);
    t.equal('/clip lists copies newest first', titles().slice(0, 3), ['beta two', 'alpha one', 'hunter2']);
    launcher.panel.setText('/clip alph');
    await sleep(300);
    t.equal('typing filters them', titles()[0], 'alpha one');
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => !launcher.isOpen, 1000);
    t.equal('Enter copies it back to the clipboard', await read(), 'alpha one');
    t.check('and it moves to the top of the history', await waitFor(() => kept()[0] === 'alpha one', 2000), JSON.stringify(kept()));

    own.set_int('clipboard-history-size', 10);
    for (let i = 0; i < 12; i++) {
        copy(`n${i}`);
        await waitFor(() => kept()[0] === `n${i}`, 2000);
    }
    t.equal('the size limit holds', kept().length, 10);
    own.set_int64('clipboard-clear-request', 12345);
    await sleep(100);
    t.equal('Clear (from Settings) empties the history', kept(), []);

    Main.extensionManager.disableExtension(ext.uuid);
    await waitFor(() => !ext.stateObj.launcher);
    t.equal('disable clears the history', kept(), []);
    copy('after disable');
    await sleep(200);
    t.equal('and nothing is kept after it', kept(), []);
    t.finish();
}
