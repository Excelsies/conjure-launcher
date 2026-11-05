// Integration test (headless GNOME Shell, two virtual monitors from monitors.monitors):
// which monitor the launcher opens on, and auto-paste (invariant 5).

import Clutter from 'gi://Clutter';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

import { Suite, extension, pressKeys, waitFor, sleep } from './lib/harness.js';

const inside = (rect, m) => rect.x >= m.x && rect.y >= m.y && rect.x + rect.width <= m.x + m.width && rect.y + rect.height <= m.y + m.height;

export async function run() {
    const t = new Suite();
    const ext = extension();
    const own = ext.stateObj.getSettings();
    const launcher = ext.stateObj.launcher;
    const lm = Main.layoutManager;
    t.equal('two monitors', lm.monitors.length, 2);
    const [m0, m1] = lm.monitors;

    await Scripting.createTestWindow({ width: 300, height: 200 });
    await Scripting.createTestWindow({ width: 300, height: 200 });
    await Scripting.waitTestWindows();
    await waitFor(() => global.display.focus_window, 10000);  // slow under load; see providers.js
    const wins = global.display.get_tab_list(Meta.TabList.NORMAL_ALL, null);
    t.check('two test windows', wins.length >= 2, `${wins.length}`);
    const [a, b] = wins;
    // Under load the windows' own initial placement can land after a move and undo it, so keep
    // moving until both are where the checks below need them.
    const placed = await waitFor(() => {
        if (a.get_monitor() !== 1)
            a.move_to_monitor(1);
        if (b.get_monitor() !== 0)
            b.move_to_monitor(0);
        return a.get_monitor() === 1 && b.get_monitor() === 0;
    }, 10000);
    t.check('the test windows are on monitors 1 and 0', placed, `a on ${a.get_monitor()}, b on ${b.get_monitor()}`);

    // --- Which monitor ---
    t.equal('default monitor setting is focused', own.get_string('monitor'), 'focused');
    Main.activateWindow(a);
    t.check('the window on monitor 1 has focus', await waitFor(() => global.display.focus_window === a, 10000));
    launcher.open();
    await sleep(50);
    t.check('opens on the monitor of the focused window', inside(launcher.lastRect, m1), JSON.stringify(launcher.lastRect));
    t.equal('centered on that monitor', launcher.lastRect.x + launcher.lastRect.width / 2, m1.x + m1.width / 2);
    launcher.close('test');

    own.set_string('monitor', 'primary');
    launcher.open();
    await sleep(50);
    t.check('"primary" opens on the primary monitor even with focus elsewhere', inside(launcher.lastRect, lm.primaryMonitor));
    launcher.close('test');

    own.set_string('monitor', 'pointer');
    const pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    const target = lm.primaryIndex === 0 ? m1 : m0;
    pointer.notify_absolute_motion(global.get_current_time() * 1000, target.x + 50, target.y + 50);
    await sleep(200);
    launcher.open();
    await sleep(50);
    t.check('"pointer" opens on the pointer\'s monitor', inside(launcher.lastRect, target), JSON.stringify(launcher.lastRect));
    launcher.close('test');
    own.reset('monitor');

    // --- Auto-paste (invariant 5); the virtual keyboard is replaced by a recorder ---
    const sent = [];
    launcher.autoPaste.send = chord => sent.push(chord.join('+'));

    Main.activateWindow(a);
    await waitFor(() => global.display.focus_window === a, 5000);
    launcher.open();
    await sleep(30);
    launcher.panel.setText('12*3');
    await sleep(50);
    await pressKeys(Clutter.KEY_Return);
    await sleep(500);
    t.equal('off by default: copying pastes nothing', sent, []);

    own.set_boolean('auto-paste', true);
    launcher.open();
    await sleep(30);
    launcher.panel.setText('12*3');
    await sleep(50);
    await pressKeys(Clutter.KEY_Return);
    t.check('on: pastes into the window that was focused before opening', await waitFor(() => sent.length === 1, 1000));
    t.equal('with Ctrl+V for a non-terminal window', sent[0], 'Control_L+v');

    // Focus moves to another window while the launcher is open (a new window mapping can do
    // this; the modal grab does not stop it): the copy must not be pasted anywhere.
    launcher.open();
    await sleep(30);
    b.activate(global.get_current_time());
    await waitFor(() => global.display.focus_window === b, 5000);
    t.check('(the launcher is still open after the focus change)', launcher.isOpen);
    launcher.panel.setText('12*3');
    await sleep(50);
    await pressKeys(Clutter.KEY_Return);
    await sleep(500);
    t.equal('never into a window other than the one focused before opening', sent.length, 1);

    // Emoji, with b focused before opening: pastes into b.
    launcher.open();
    await sleep(30);
    launcher.panel.setText('/emo grinning face');
    await sleep(60);
    await pressKeys(Clutter.KEY_Return);
    t.check('emoji paste into the window that was focused', await waitFor(() => sent.length === 2, 1000));

    launcher.open();
    await sleep(30);
    launcher.panel.setText('conjure test alpha');
    await sleep(60);
    ext.stateObj._providers[0].activate = () => {};
    await pressKeys(Clutter.KEY_Return);
    await sleep(500);
    t.equal('results that do not copy never paste', sent.length, 2);

    await Scripting.destroyTestWindows();
    await sleep(300);
    launcher.open();
    await sleep(30);
    launcher.panel.setText('12*3');
    await sleep(50);
    await pressKeys(Clutter.KEY_Return);
    await sleep(500);
    t.equal('with no window focused before opening, nothing is typed', sent.length, 2);
    own.reset('auto-paste');

    t.finish();
}
