// Opens the real preferences window (all pages are built when it opens) so the runner's
// log check (tools/shell-test.sh, "runtime criticals") sees anything the prefs process logs, such
// as GTK markup errors that silently drop a description.

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, extension, waitFor, sleep } from './lib/harness.js';

export async function run() {
    const t = new Suite();
    const ext = extension();
    Main.extensionManager.openExtensionPrefs(ext.uuid, '', {});
    const shown = await waitFor(() => global.get_window_actors().some(a => /Conjure/.test(a.meta_window?.get_title() ?? '')), 20000);
    t.check('the preferences window opens', Boolean(shown));
    await sleep(1500);  // let every page finish building and log
    t.finish();
}
