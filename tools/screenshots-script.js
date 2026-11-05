// Automation script for tools/screenshots.sh: drives the launcher through its main views in a
// headless shell and saves cropped PNGs to $CONJURE_SHOT_DIR. Nothing launches: app activation is
// replaced by a no-op that only records the launch, so the Recent view has content.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area');

const ROOT = GLib.getenv('CONJURE_TEST_ROOT');
const OUT = GLib.getenv('CONJURE_SHOT_DIR');
const sleep = ms => new Promise(r => GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, () => {
    r();
    return GLib.SOURCE_REMOVE;
}));
const waitFor = async (fn, ms = 5000) => {
    const end = Date.now() + ms;
    while (!fn() && Date.now() < end)
        await sleep(50);
    return fn();
};
const keyboard = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
globalThis._shotKeyboard = keyboard;
async function keys(...syms) {
    const now = () => GLib.get_monotonic_time();
    for (const k of syms)
        keyboard.notify_keyval(now(), k, Clutter.KeyState.PRESSED);
    for (const k of [...syms].reverse())
        keyboard.notify_keyval(now(), k, Clutter.KeyState.RELEASED);
    await sleep(150);
}

async function capture(name, rect, pad = 24) {
    await sleep(450);  // past the 200 ms animations
    const x = Math.max(0, Math.round(rect.x - pad));
    const y = Math.max(0, Math.round(rect.y - pad));
    const w = Math.min(global.screen_width - x, Math.round(rect.width + 2 * pad));
    const h = Math.min(global.screen_height - y, Math.round(rect.height + 2 * pad));
    const file = Gio.File.new_for_path(GLib.build_filenamev([OUT, `${name}.png`]));
    const stream = file.replace(null, false, Gio.FileCreateFlags.NONE, null);
    await new Shell.Screenshot().screenshot_area(x, y, w, h, stream);
    stream.close(null);
    console.log(`# screenshot ${name}.png ${w}x${h}`);
}

export async function run() {
    const ext = Main.extensionManager.lookup(GLib.getenv('CONJURE_TEST_UUID'));
    const own = ext.stateObj.getSettings();
    const launcher = ext.stateObj.launcher;
    const apps = ext.stateObj._providers.find(p => p.id === 'apps');
    apps.activate = () => {};
    await launcher.usageReady;
    // The default theme follows the system (D18): show it as Ubuntu Dark with Ubuntu's orange accent.
    const iface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    iface.set_string('color-scheme', 'prefer-dark');
    iface.set_string('accent-color', 'orange');
    await sleep(300);
    const panel = () => launcher.panel;
    const type = async (text, ms = 250) => {
        panel().setText(text);
        await sleep(ms);
    };
    const shotPanel = name => capture(name, launcher.lastRect);

    // Launch a few apps so Recent has something to show (nothing actually starts).
    for (const q of ['text editor', 'firefox', 'terminal', 'files']) {
        launcher.open();
        await sleep(60);
        await type(q, 120);
        await keys(Clutter.KEY_Return);
        await waitFor(() => !launcher.isOpen, 2000);
        await sleep(250);
    }

    launcher.open();
    await sleep(100);
    await shotPanel('01-recent');
    await type('te');
    await shotPanel('02-search');
    await type('');
    await keys(Clutter.KEY_Control_L, Clutter.KEY_3);
    await keys(Clutter.KEY_Control_L, Clutter.KEY_g);
    await shotPanel('03-grid');
    await keys(Clutter.KEY_Control_L, Clutter.KEY_4);
    await shotPanel('04-categories');
    await keys(Clutter.KEY_Control_L, Clutter.KEY_g);
    await type('files', 300);
    await keys(Clutter.KEY_Shift_L, Clutter.KEY_Return);
    await shotPanel('05-actions');
    await keys(Clutter.KEY_Escape);
    await type('sqrt(2)*10');
    await shotPanel('06-calculator');
    await type('/emo heart', 400);
    await shotPanel('07-emoji');
    await type('/');
    await shotPanel('08-providers');
    launcher.close('screenshots');
    await sleep(300);

    const { paletteValues } = await import(`file://${ROOT}/lib/palettes.js`);
    // Theme gallery: the same search in several presets (written to the same keys the picker writes).
    // Ubuntu Dark is the default, shown in every other shot.
    for (const id of ['ubuntu-light', 'noctalia', 'catppuccin', 'dracula', 'gruvbox', 'kanagawa', 'nord', 'rose-pine', 'tokyo-night', 'moonfly', 'oxocarbon-dark']) {
        for (const [k, v] of Object.entries(paletteValues(id)))
            own.set_string(`theme-${k}`, v);
        launcher.open();
        await sleep(100);
        await type('s');
        await shotPanel(`theme-${id}`);
        launcher.close('screenshots');
        await sleep(300);
    }
    for (const k of Object.keys(paletteValues('ubuntu')))
        own.reset(`theme-${k}`);
    await sleep(300);

    // Settings > Appearance with the theme list open.
    Gio.DBus.session.call_sync('org.freedesktop.DBus', '/org/freedesktop/DBus', 'org.freedesktop.DBus', 'UpdateActivationEnvironment',
        new GLib.Variant('(a{ss})', [{ CONJURE_PREFS_PAGE: 'appearance' }]), null, Gio.DBusCallFlags.NONE, -1, null);
    Main.extensionManager.openExtensionPrefs(ext.uuid, '', {});
    const prefs = () => global.get_window_actors().find(a => /Conjure/.test(a.meta_window?.get_title() ?? ''));
    await waitFor(prefs, 20000);
    await sleep(4000);
    const r = prefs().meta_window.get_frame_rect();
    await capture('09-settings', r, 0);
    const pointer = Clutter.get_default_backend().get_default_seat().create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
    globalThis._shotPointer = pointer;
    const [px, py] = [r.x + r.width - 140, r.y + 136];
    for (const [dx, dy] of [[-40, -20], [-10, -5], [0, 0]]) {
        pointer.notify_absolute_motion(GLib.get_monotonic_time(), px + dx, py + dy);
        await sleep(150);
    }
    pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.PRESSED);
    await sleep(120);
    pointer.notify_button(GLib.get_monotonic_time(), Clutter.BUTTON_PRIMARY, Clutter.ButtonState.RELEASED);
    await sleep(1500);
    await capture('10-settings-themes', { x: r.x, y: r.y, width: r.width, height: global.screen_height - r.y }, 0);
    // gnome-shell-perf-helper exits on its own idle timeout, which this script outlasts; the shell's
    // teardown would then fail calling Exit on it. Tell the teardown not to.
    (await Scripting._getPerfHelper())._autoExit = false;
}
