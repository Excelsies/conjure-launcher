// Phase 1 integration test: runs inside a headless GNOME Shell (tools/shell-test.sh) against the
// real extension, real GSettings (sandboxed) and real input events from virtual devices.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, extension, pressKeys, clickAt, waitFor, sleep, waitForToggleBinding } from './lib/harness.js';

const gnomeKeys = new Gio.Settings({ schema_id: 'org.gnome.shell.keybindings' });
const APP_VIEW = 'toggle-application-view';

function grabReleased() {
    return Main.modalCount === 0 && Main.actionMode === Shell.ActionMode.NORMAL;
}

export async function run() {
    const t = new Suite();
    const uuid = GLib.getenv('CONJURE_TEST_UUID');
    const ext = extension();
    const own = ext.stateObj.getSettings();

    // --- Invariant 1: the takeover happened at startup (setup: app grid on <Super>space) ---
    const saved = own.get_strv('saved-toggle-application-view');
    t.equal('the colliding app-grid accelerator is removed while enabled', gnomeKeys.get_strv(APP_VIEW), []);
    t.equal('the original binding is saved', saved, ['<Super>space']);
    t.equal('the presence flag is set', own.get_boolean('has-saved-toggle-application-view'), true);
    t.equal('no other binding holds Super+Space', ext.stateObj.keybindings.conflicts, []);

    // --- Open through the real keybinding (virtual keyboard, Super+Space) ---
    let launcher = ext.stateObj.launcher;
    const SUPER_SPACE = [Clutter.KEY_Super_L, Clutter.KEY_space];
    const tries = await waitForToggleBinding(launcher, SUPER_SPACE);
    t.check('Super+Space reaches the launcher once Mutter has rebuilt its bindings', tries > 0);
    console.log(`# binding live after ${tries} press(es)`);
    await pressKeys(Clutter.KEY_Super_L, Clutter.KEY_space);
    t.check('Super+Space opens the launcher', await waitFor(() => launcher.isOpen));
    t.check('the modal grab is held while open', Main.modalCount === 1 && Main.actionMode === Shell.ActionMode.POPUP,
        `modalCount ${Main.modalCount}, actionMode ${Main.actionMode}`);
    const panel = launcher.panel;
    t.check('empty query lists installed apps', panel.rows.length > 0, `${panel.rows.length} rows`);

    // --- Placement: bottom centre of the screen, inside the work area (decision D7) ---
    // Measure after the 200 ms open slide, which moves the panel by translation_y.
    await waitFor(() => panel.panelActor.translation_y === 0 && panel.panelActor.opacity === 255, 1000);
    const actor = panel.panelActor;
    const [ax, ay] = actor.get_transformed_position();
    const mon = Main.layoutManager.primaryMonitor;
    const work = Main.layoutManager.getWorkAreaForMonitor(Main.layoutManager.primaryIndex);
    t.equal('default position setting is bottom', own.get_string('position'), 'bottom');
    t.check('the panel is horizontally centred on the screen',
        Math.abs(ax + actor.width / 2 - (mon.x + mon.width / 2)) <= 1, `centre x ${ax + actor.width / 2}`);
    t.check('the panel bottom sits just above the work area bottom',
        Math.abs(ay + actor.height - (work.y + work.height - 24)) <= 1,
        `bottom ${ay + actor.height}, work area bottom ${work.y + work.height}`);
    t.equal('on-screen geometry matches the computed rectangle',
        [Math.round(ax), Math.round(ay), actor.width, actor.height],
        [launcher.lastRect.x, launcher.lastRect.y, launcher.lastRect.width, launcher.lastRect.height]);
    t.check('opening the launcher creates no window', !global.get_window_actors().some(a =>
        a.meta_window?.get_title()?.includes('conjure')));

    // --- Typing filters and ranks (fixture apps from tests/shell/fixtures/applications) ---
    const titles = () => launcher.panel.rows.map(r => r.result.title);
    t.check('a NoDisplay app is never listed', !titles().includes('Conjure Test Hidden Alpha'));
    panel.setText('alpha');
    await sleep(50);
    const alphaRank = titles().indexOf('Conjure Test Alpha');
    const betaRank = titles().indexOf('Conjure Test Beta');
    t.equal('"alpha": the name match ranks first', titles()[0], 'Conjure Test Alpha');
    t.check('"alpha": the generic-name match is listed below it', betaRank > alphaRank, titles().slice(0, 5).join(', '));
    t.check('"alpha": the NoDisplay app stays hidden', !titles().includes('Conjure Test Hidden Alpha'));
    panel.setText('zebrafish');
    await sleep(50);
    t.equal('a keyword-only match is found', titles()[0], 'Conjure Test Alpha');
    panel.setText('CONJURE TEST B');
    await sleep(50);
    t.equal('matching is case-insensitive', titles()[0], 'Conjure Test Beta');
    panel.setText('zzzzqqqxx');
    await sleep(50);
    t.equal('a query that matches nothing shows no rows', launcher.panel.rows.length, 0);
    panel.setText('/');
    await sleep(50);
    t.equal('a bare "/" is the provider overview', launcher.panel.rows.length, 0);
    panel.setText('');
    await sleep(50);

    // --- Keyboard navigation through the real input path ---
    t.equal('the first row is selected', panel.selectedIndex, 0);
    await pressKeys(Clutter.KEY_Down);
    t.check('Down moves the selection', await waitFor(() => panel.selectedIndex === 1, 1000), `index ${panel.selectedIndex}`);
    await pressKeys(Clutter.KEY_Up);
    await pressKeys(Clutter.KEY_Up);
    t.check('Up stops at the first row', await waitFor(() => panel.selectedIndex === 0, 1000), `index ${panel.selectedIndex}`);

    // --- Theme tokens restyle live, invalid ones fall back ---
    own.set_string('theme-primary', '#010203');
    await sleep(50);
    t.check('a theme token change restyles the open panel',
        panel.rows[0].actor.get_style().includes('rgba(1, 2, 3, 1)'), panel.rows[0].actor.get_style());
    own.set_string('theme-hover', 'not-a-colour');
    await sleep(50);
    t.check('an invalid token does not break the panel', launcher.isOpen && panel.rows.length > 0);
    own.reset('theme-primary');
    own.reset('theme-hover');

    // --- Close paths (invariant 2) ---
    await pressKeys(Clutter.KEY_Escape);
    t.check('Escape closes', await waitFor(() => !launcher.isOpen, 1000));
    t.check('Escape releases the grab', grabReleased(), `modalCount ${Main.modalCount}`);
    t.check('the panel actors are destroyed after the fade-out', await waitFor(() =>
        !Main.uiGroup.get_children().some(a => a.name === 'conjure-launcher-backdrop'), 2000));

    await pressKeys(Clutter.KEY_Super_L, Clutter.KEY_space);
    await waitFor(() => launcher.isOpen);
    await pressKeys(Clutter.KEY_Super_L, Clutter.KEY_space);
    t.check('Super+Space while open closes (works in POPUP mode)', await waitFor(() => !launcher.isOpen));
    t.check('toggle-close releases the grab', grabReleased());

    launcher.open();
    await clickAt(5, 5);
    t.check('a click outside the panel closes', await waitFor(() => !launcher.isOpen));
    t.check('click-outside releases the grab', grabReleased());

    launcher.open();
    const p = launcher.panel.backdrop.get_children()[0];
    const [px, py] = p.get_transformed_position();
    await clickAt(px + p.width - 4, py + 4);
    t.check('a click inside the panel (not on a row) keeps it open', launcher.isOpen);
    launcher.close('test');

    launcher.open();
    Main.overview.show();
    t.check('opening the overview closes the launcher', await waitFor(() => !launcher.isOpen));
    t.check('overview close releases the launcher grab', Main.modalCount <= 1);
    Main.overview.hide();
    await waitFor(() => !Main.overview.visible && Main.modalCount === 0);

    // --- Activation: close, launch, record usage (provider stubbed: no real app is started) ---
    await launcher.usageReady;
    const apps = ext.stateObj._providers[0];
    const realActivate = apps.activate;
    const launched = [];
    apps.activate = (result, opts) => launched.push([result.id, opts.newWindow]);
    launcher.open();
    const chosen = launcher.panel.rows[0].result;
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => launched.length === 1, 1000);
    t.check('Return activates the selected app', launched.length === 1 && launched[0][0] === chosen.id,
        JSON.stringify(launched));
    t.check('activation closes and releases the grab', !launcher.isOpen && grabReleased());
    t.equal('the launch is counted', launcher.usage.model.count('apps', chosen.id), 1);
    await launcher.usage.save();
    const file = Gio.File.new_for_path(launcher.usage.path);
    t.check('usage.json is written under the sandboxed XDG_STATE_HOME',
        file.query_exists(null) && launcher.usage.path.startsWith(GLib.getenv('XDG_STATE_HOME')), launcher.usage.path);

    launcher.open();
    await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_Return);
    t.check('Ctrl+Return asks for a new window', await waitFor(() => launched.at(-1)?.[1] === true, 1000), JSON.stringify(launched.at(-1)));

    apps.activate = () => {
        throw new Error('gone');
    };
    launcher.open();
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => !launcher.isOpen, 1000);
    t.check('a failing launch still leaves the launcher closed and the grab released',
        !launcher.isOpen && grabReleased());
    apps.activate = realActivate;

    // --- Rebinding ours gives the old accelerator back and takes only the new one ---
    own.set_strv('toggle-launcher', ['<Super>r']);
    await sleep(100);
    t.equal('rebinding restores GNOME\'s Super+Space app grid', gnomeKeys.get_strv(APP_VIEW), ['<Super>space']);
    t.check('the new accelerator opens the launcher',
        await waitForToggleBinding(launcher, [Clutter.KEY_Super_L, Clutter.KEY_r]) > 0);
    own.reset('toggle-launcher');
    await sleep(100);
    t.equal('resetting ours takes Super+Space again', gnomeKeys.get_strv(APP_VIEW), []);

    // --- Disable while open: grab released, binding restored (invariants 1 and 2) ---
    launcher.open();
    Main.extensionManager.disableExtension(uuid);
    t.check('disabling while open closes the launcher', await waitFor(() => !launcher.isOpen));
    t.check('disable releases the grab', grabReleased());
    t.equal('disable restores GNOME\'s binding', gnomeKeys.get_strv(APP_VIEW), saved);
    t.equal('disable clears the presence flag', own.get_boolean('has-saved-toggle-application-view'), false);

    // --- Re-enable takes over again (the lock/unlock cycle) ---
    Main.extensionManager.enableExtension(uuid);
    t.check('re-enable takes over again', await waitFor(() => gnomeKeys.get_strv(APP_VIEW).length === 0));
    launcher = ext.stateObj.launcher;
    const reTries = await waitForToggleBinding(launcher, SUPER_SPACE);
    t.check('Super+Space works after re-enable', reTries > 0);
    console.log(`# binding live after ${reTries} press(es) following re-enable`);

    t.finish();
}
