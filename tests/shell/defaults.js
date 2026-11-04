// Stock GNOME keybindings (no setup file): the app grid is on <Super>a and input-source
// switching holds <Super>space. The launcher must take nothing from the app grid and must
// report, not change, the input-source conflict.

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, extension, waitFor } from './lib/harness.js';

export async function run() {
    const t = new Suite();
    const ext = extension();
    const own = ext.stateObj.getSettings();
    const gnomeKeys = new Gio.Settings({ schema_id: 'org.gnome.shell.keybindings' });
    const wmKeys = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.keybindings' });
    const appGrid = gnomeKeys.get_strv('toggle-application-view');

    t.check('the stock app-grid binding does not collide and is left alone',
        !appGrid.some(a => /space/i.test(a)) && appGrid.length > 0, JSON.stringify(appGrid));
    t.equal('nothing is saved when nothing collides', own.get_boolean('has-saved-toggle-application-view'), false);
    t.check('the input-source conflict is reported',
        ext.stateObj.keybindings.conflicts.includes('org.gnome.desktop.wm.keybindings switch-input-source'),
        JSON.stringify(ext.stateObj.keybindings.conflicts));
    t.check('and is not changed', wmKeys.get_strv('switch-input-source').some(a => /space/i.test(a)));

    const launcher = ext.stateObj.launcher;
    t.check('the launcher still opens', launcher.open() && launcher.isOpen);
    launcher.close('test');

    Main.extensionManager.disableExtension(GLib.getenv('CONJURE_TEST_UUID'));
    await waitFor(() => !ext.stateObj.launcher);
    t.equal('disable leaves the app grid binding as it was', gnomeKeys.get_strv('toggle-application-view'), appGrid);
    t.finish();
}
