// Automation script for tools/preview.sh: keeps the launcher open in a nested GNOME Shell window
// so it can be looked at and tried. Nothing it does can reach the real session:
//  - session actions (suspend, power off, ...) are replaced with notices: the nested shell shares the
//    machine's system bus, so a real one would act on the real computer;
//  - app launches, window switching and command exec show a notice instead of running;
//  - when the launcher closes (Esc, a pick), it opens again after a moment.
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

const sleep = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));

export async function run() {
    const sys = SystemActions.getDefault();
    for (const name of ['activateLockScreen', 'activateLogout', 'activateSuspend', 'activateSwitchUser',
        'activateRestart', 'activatePowerOff'])
        sys[name] = () => Main.notify('Conjure Launcher preview', `${name.replace('activate', '')} would run here (disabled in the preview)`);

    let ext = null;
    for (let i = 0; i < 100 && !ext?.stateObj?.launcher; i++) {
        ext = Main.extensionManager.lookup(GLib.getenv('CONJURE_TEST_UUID'));
        await sleep(100);
    }
    const stubProviders = () => {
        for (const p of ext.stateObj._providers ?? []) {
            if (p._previewStubbed)
                continue;
            p._previewStubbed = true;
            if (['apps', 'windows', 'wallpaper'].includes(p.id) || String(p.id).startsWith('cmd:')) {
                p.activate = result => Main.notify('Conjure Launcher preview', `Would open: ${result.title}`);
                p.runAction = (result, id) => Main.notify('Conjure Launcher preview', `Would run "${id}" for ${result.title}`);
            }
        }
    };
    // Runs until the window is closed (the shell then exits).
    for (;;) {
        const launcher = ext?.stateObj?.launcher;
        if (launcher) {
            stubProviders();
            if (!launcher.isOpen && Main.modalCount === 0) {
                await sleep(900);
                if (!launcher.isOpen && Main.modalCount === 0)
                    launcher.open();
            }
        }
        await sleep(300);
    }
}
