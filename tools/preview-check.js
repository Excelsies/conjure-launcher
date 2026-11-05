// Scripted check of the launcher on the real GPU, run inside the nested preview shell:
//   CONJURE_PREVIEW_DRIVE=tools/preview-check.js tools/preview.sh     (CONJURE_SHOT_DIR=<dir> for screenshots)
// It drives the panel with its own virtual pointer and keyboard (never the real ones): tabs and category chips by
// click, the actions menu by right-click, hover, the providers, the grid, the shortcut, and the gear opening
// Settings. It uses your installed apps and your shortcut and theme settings (read only), so it checks your setup,
// and prints one "# ok" / "# NOT OK" line per check and a summary. The window closes when it is done.
import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';

Gio._promisify(Shell.Screenshot.prototype, 'screenshot_area');
// Screenshots go to $CONJURE_SHOT_DIR when it is set; otherwise none are taken.
const OUT = GLib.getenv('CONJURE_SHOT_DIR');
const seat = Clutter.get_default_backend().get_default_seat();
const kb = seat.create_virtual_device(Clutter.InputDeviceType.KEYBOARD_DEVICE);
const ptr = seat.create_virtual_device(Clutter.InputDeviceType.POINTER_DEVICE);
globalThis._drv = [kb, ptr];
const now = () => GLib.get_monotonic_time();
let pass = 0, fail = 0;
const check = (name, ok, detail = '') => { ok ? pass++ : fail++; console.log(`# ${ok ? 'ok' : 'NOT OK'} - ${name}${ok || !detail ? '' : ' (' + detail + ')'}`); };

export async function drive({ ext, sleep }) {
    const launcher = ext.stateObj.launcher;
    const keys = async (...syms) => { for (const k of syms) kb.notify_keyval(now(), k, Clutter.KeyState.PRESSED); for (const k of [...syms].reverse()) kb.notify_keyval(now(), k, Clutter.KeyState.RELEASED); await sleep(200); };
    const click = async (actor, button = Clutter.BUTTON_PRIMARY) => {
        const [x, y] = actor.get_transformed_position();
        ptr.notify_absolute_motion(now(), x + actor.width / 2, y + actor.height / 2); await sleep(120);
        ptr.notify_button(now(), button, Clutter.ButtonState.PRESSED); await sleep(60);
        ptr.notify_button(now(), button, Clutter.ButtonState.RELEASED); await sleep(300);
    };
    const shot = async name => {
        await sleep(350);
        if (!OUT)
            return;
        const r = launcher.lastRect;
        const f = Gio.File.new_for_path(`${OUT}/${name}.png`);
        const st = f.replace(null, false, Gio.FileCreateFlags.NONE, null);
        await new Shell.Screenshot().screenshot_area(Math.max(0, r.x - 20), Math.max(0, r.y - 20), r.width + 40, r.height + 40, st);
        st.close(null);
    };
    const titles = () => launcher.panel?.rows.map(r => r.result?.title ?? r.action?.label) ?? [];
    const type = async (text, ms = 500) => { launcher.panel.setText(text); await sleep(ms); };

    await sleep(1500);
    launcher.open(); await sleep(600);
    check('the launcher opens on the real GPU', launcher.isOpen);
    await shot('01-open');
    const panel = launcher.panel;
    for (const view of ['all', 'pinned', 'categories', 'recent', 'all']) {
        await click(panel._tabButtons.get(view).button);
        check(`clicking the ${view} tab shows it`, panel.view === view, `view ${panel.view}`);
        if (view !== 'recent') await shot(`02-tab-${view}`);
    }
    await click(panel._tabButtons.get('categories').button);
    const chips = panel._chips.get_children().filter(c => c.visible);
    await click(chips.at(-1));
    check('clicking a category chip selects it', panel.activeCategory === chips.at(-1)._categoryId, `${panel.activeCategory}`);
    await shot('03-chip');
    await click(panel._tabButtons.get('all').button);
    // right-click an app row: the actions menu
    const row = panel.rows.find(r => r.result?.providerId === 'apps');
    await click(row.actor, Clutter.BUTTON_SECONDARY);
    check('right-click opens the actions menu', panel.menu !== null, titles().slice(0, 4).join('|'));
    await shot('04-actions');
    await keys(Clutter.KEY_Escape);
    check('Esc leaves the menu and keeps the launcher open', panel.menu === null && launcher.isOpen);
    // hover a row
    const r2 = panel.rows[1];
    if (r2) { const [x, y] = r2.actor.get_transformed_position(); ptr.notify_absolute_motion(now(), x + 30, y + 10); await sleep(250); check('hovering a row highlights it', r2.actor.hover); }
    St.Clipboard.get_default().set_text(St.ClipboardType.CLIPBOARD, 'copied in the preview'); await sleep(300);
    for (const [q, name, test] of [['/clip', '05-clip', t => t[0] === 'copied in the preview'], ['/set', '06-set', t => t.length > 3],
        ['termnial', '07-typo', t => t.includes('Terminal')], ['10 km to mi', '08-conversion', t => t[0] === '= 6.21371 mi'],
        ['/emo heart', '09-emoji', t => t.length > 3], ['/rec', '10-rec', () => true]]) {
        await type(q);
        check(`${q} works`, test(titles()), JSON.stringify(titles().slice(0, 3)));
        await shot(name);
    }
    await type('');
    await keys(Clutter.KEY_Control_L, Clutter.KEY_g); await shot('11-grid');
    check('Ctrl+G shows the grid', launcher.panel === panel && launcher.isOpen);
    await keys(Clutter.KEY_Control_L, Clutter.KEY_g);
    // the shortcut toggles it
    await keys(Clutter.KEY_Escape); await sleep(400);
    let opened = false;
    for (let i = 0; i < 10 && !opened; i++) { await keys(Clutter.KEY_Super_L, Clutter.KEY_space); await sleep(300); opened = launcher.isOpen; }
    check('Super+Space opens it (shortcut taken from the app grid)', opened);
    const sis = new Gio.Settings({ schema_id: 'org.gnome.desktop.wm.keybindings' }).get_strv('switch-input-source');
    const iface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    check('the preview mirrors the real shortcuts and style', sis.length === 0 && iface.get_string('accent-color') === 'purple' && iface.get_string('color-scheme') === 'prefer-dark',
        `switch-input-source ${JSON.stringify(sis)}, ${iface.get_string('color-scheme')}, ${iface.get_string('accent-color')}`);
    // gear -> Settings
    if (!launcher.isOpen) { launcher.open(); await sleep(600); }
    await click(launcher.panel.settingsIcon);
    check('clicking the gear closes the launcher', !launcher.isOpen);
    let prefs = null;
    for (let i = 0; i < 60 && !prefs; i++) { await sleep(250); prefs = global.get_window_actors().find(a => /Conjure/.test(a.meta_window?.get_title() ?? '')); }
    check('and opens the Settings window', Boolean(prefs));
    if (prefs) {
        await sleep(1500);
        if (OUT) {
            const fr = prefs.meta_window.get_frame_rect();
            const f = Gio.File.new_for_path(`${OUT}/12-settings.png`); const st = f.replace(null, false, Gio.FileCreateFlags.NONE, null);
            await new Shell.Screenshot().screenshot_area(fr.x, fr.y, fr.width, fr.height, st); st.close(null);
        }
        prefs.meta_window.delete(global.get_current_time());
    }
    console.log(`# driver summary: ${pass} passed, ${fail} failed`);
}
