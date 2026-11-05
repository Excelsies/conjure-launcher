// Integration test (headless GNOME Shell, tools/shell-test.sh): views, pins,
// categories, grid, the actions menu, search-field placement and the close animation.
// Runs on the shipped defaults (no setup file): Recent view, list, search at the bottom.

import Clutter from 'gi://Clutter';
import Shell from 'gi://Shell';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, extension, pressKeys, clickAt, waitFor, sleep } from './lib/harness.js';

const ALPHA = 'conjure-test-alpha.desktop';
const BETA = 'conjure-test-beta.desktop';

const grabReleased = () => Main.modalCount === 0 && Main.actionMode === Shell.ActionMode.NORMAL;

export async function run() {
    const t = new Suite();
    const ext = extension();
    const own = ext.stateObj.getSettings();
    const launcher = ext.stateObj.launcher;
    const apps = ext.stateObj._providers[0];
    await launcher.usageReady;

    // Never start real apps from this test: record activations instead.
    const launched = [];
    apps.activate = (result, opts) => launched.push(['activate', result.id, opts.newWindow]);
    apps.runAction = (result, id) => launched.push(['action', result.id, id]);

    const titles = () => launcher.panel.rows.map(r => r.result?.title ?? r.action?.label);
    const open = async () => {
        launcher.open();
        await sleep(50);
        return launcher.panel;
    };

    // --- Defaults ---
    t.equal('default view setting is recent', own.get_string('default-view'), 'recent');
    t.equal('default layout is the list', own.get_boolean('app-grid'), false);
    t.equal('default search position is bottom', own.get_string('search-position'), 'bottom');

    // --- The settings gear: click and Ctrl+, close and open Settings ---
    const settingsOpened = [];
    launcher._openSettings = () => settingsOpened.push(Date.now());
    let panel = await open();
    t.check('a settings gear sits in the search field', panel.settingsIcon?.visible === true);
    await sleep(250);  // past the open slide, so the gear is where it is drawn
    const gear = panel.settingsIcon;
    const [gx, gy] = gear.get_transformed_position();
    await clickAt(gx + gear.width / 2, gy + gear.height / 2);
    t.check('clicking the gear closes the launcher', await waitFor(() => !launcher.isOpen, 1000));
    t.equal('and opens Settings', settingsOpened.length, 1);
    panel = await open();
    await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_comma);
    t.check('Ctrl+, does the same', await waitFor(() => settingsOpened.length === 2 && !launcher.isOpen, 1000));

    panel = await open();
    t.equal('the Recent tab comes first', panel.tabs, ['recent', 'pinned', 'all', 'categories']);
    t.equal('it opens on Recent', panel.view, 'recent');
    t.equal('Recent is empty before anything is launched', panel.rows.length, 0);

    const pa = panel.panelActor;
    const tb = panel.toolbarActor;
    const [, py] = pa.get_transformed_position();
    const [, ty] = tb.get_transformed_position();
    t.check('the search field is at the bottom of the panel',
        ty + tb.height > py + pa.height - 40 && ty > py + pa.height / 2, `toolbar y ${ty}, panel y ${py} h ${pa.height}`);

    // --- Recent fills after a launch, newest first ---
    panel.setText('conjure test beta');
    await sleep(50);
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => !launcher.isOpen, 1000);
    panel = await open();
    panel.setText('conjure test alpha');
    await sleep(50);
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => !launcher.isOpen, 1000);
    t.equal('both launches were activated', launched.filter(l => l[0] === 'activate').map(l => l[1]), [BETA, ALPHA]);
    panel = await open();
    t.equal('Recent lists launched apps, newest first', titles(), ['Conjure Test Alpha', 'Conjure Test Beta']);

    // --- Typing switches to All; choosing a tab clears the query ---
    panel.setText('conjure');
    await sleep(50);
    t.check('typing searches everything, not just Recent', titles().includes('Conjure Test Alpha') && titles().length >= 2);
    await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_2);
    t.check('Ctrl+2 selects the Pinned tab and clears the query',
        await waitFor(() => panel.view === 'pinned' && panel.text === '', 1000), `view ${panel.view}, text "${panel.text}"`);
    t.equal('Pinned is empty with nothing pinned', panel.rows.length, 0);

    // --- Actions menu: Shift+Enter, Pin, Esc returns, does not close ---
    await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_3);
    await waitFor(() => panel.view === 'all', 1000);
    panel.setText('conjure test alpha');
    await sleep(50);
    await pressKeys(Clutter.KEY_Shift_L, Clutter.KEY_Return);
    t.check('Shift+Enter opens the actions menu', await waitFor(() => panel.menu !== null, 1000));
    const menu = titles();
    // The fixture does not declare SingleMainWindow, so GNOME reports it can open new windows.
    t.equal('menu: back header, open, new window, the desktop action, pin', menu,
        ['Conjure Test Alpha', 'Open', 'New Window', 'New Private Fixture', 'Pin']);
    t.equal('the first action is selected, not the header', panel.selectedIndex, 1);
    await pressKeys(Clutter.KEY_Escape);
    t.check('Esc leaves the menu', await waitFor(() => panel.menu === null, 1000));
    t.check('and keeps the launcher open', launcher.isOpen);

    await pressKeys(Clutter.KEY_Shift_L, Clutter.KEY_Return);
    await waitFor(() => panel.menu !== null, 1000);
    const pinIndex = titles().indexOf('Pin');
    for (let i = panel.selectedIndex; i < pinIndex; i++)
        await pressKeys(Clutter.KEY_Down);
    await pressKeys(Clutter.KEY_Return);
    t.check('Pin stores the app id', await waitFor(() => own.get_strv('pinned').includes(ALPHA), 1000),
        JSON.stringify(own.get_strv('pinned')));
    t.check('the launcher stays open after pinning', launcher.isOpen && panel.menu === null);
    panel.setText('');
    await sleep(50);
    await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_2);
    await waitFor(() => panel.view === 'pinned', 1000);
    t.equal('Pinned shows the pinned app', titles(), ['Conjure Test Alpha']);
    await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_3);
    await waitFor(() => panel.view === 'all', 1000);
    t.equal('All puts pinned apps first', titles()[0], 'Conjure Test Alpha');

    // --- Running a desktop action closes and launches it ---
    panel.setText('conjure test alpha');
    await sleep(50);
    await pressKeys(Clutter.KEY_Shift_L, Clutter.KEY_Return);
    await waitFor(() => panel.menu !== null, 1000);
    t.check('a pinned app offers Unpin', titles().includes('Unpin'));
    await pressKeys(Clutter.KEY_Down);  // Open -> New Window
    await pressKeys(Clutter.KEY_Down);  // New Window -> New Private Fixture
    await pressKeys(Clutter.KEY_Return);
    t.check('a desktop action closes the launcher', await waitFor(() => !launcher.isOpen, 1000));
    t.equal('and runs that action', launched.at(-1), ['action', ALPHA, 'action:private']);
    t.check('the grab is released at once, during the close animation', grabReleased(), `modalCount ${Main.modalCount}`);

    // --- Categories ---
    panel = await open();
    await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_4);
    await waitFor(() => panel.view === 'categories', 1000);
    t.check('category chips list the non-empty categories', panel.categoryChips.includes('internet') &&
        panel.categoryChips.includes('games'), JSON.stringify(panel.categoryChips));
    t.equal('the first non-empty category is active', panel.activeCategory, panel.categoryChips[0]);
    const firstCat = panel.activeCategory;
    await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_Right);
    t.check('Ctrl+Right moves to the next category', await waitFor(() => panel.activeCategory !== firstCat, 1000));
    while (panel.activeCategory !== 'games')
        await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_Right);
    t.check('Games lists the Game fixture', titles().includes('Conjure Test Beta') && !titles().includes('Conjure Test Alpha'),
        titles().join(', '));

    // --- Grid toggle (Ctrl+G), persisted, with grid navigation ---
    await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_3);
    await waitFor(() => panel.view === 'all', 1000);
    await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_g);
    t.check('Ctrl+G switches to the grid and saves it', await waitFor(() => panel.grid && own.get_boolean('app-grid'), 1000));
    t.check('grid cells are laid out 5 per row', panel.rows.length > 5 &&
        panel.rows[0].actor.get_parent() === panel.rows[4].actor.get_parent() &&
        panel.rows[0].actor.get_parent() !== panel.rows[5].actor.get_parent());
    await pressKeys(Clutter.KEY_Right);
    t.check('Right moves one cell in the grid', await waitFor(() => panel.selectedIndex === 1, 1000), `index ${panel.selectedIndex}`);
    await pressKeys(Clutter.KEY_Down);
    t.check('Down moves one row in the grid', await waitFor(() => panel.selectedIndex === 6, 1000), `index ${panel.selectedIndex}`);
    await pressKeys(Clutter.KEY_Control_L, Clutter.KEY_g);
    await waitFor(() => !panel.grid, 1000);
    launcher.close('test');

    // --- The close animation leaves nothing behind and holds nothing ---
    launcher.open();
    await sleep(50);
    launcher.close('escape');
    t.check('right after close the grab is gone', grabReleased());
    const fading = Main.uiGroup.get_children().filter(a => a.name === 'conjure-launcher-backdrop');
    t.check('the fading panel takes no input', fading.every(a => !a.reactive));
    launcher.open();
    t.check('reopening during the fade works', launcher.isOpen);
    launcher.close('test');
    t.check('faded panels are destroyed', await waitFor(() =>
        !Main.uiGroup.get_children().some(a => a.name === 'conjure-launcher-backdrop'), 2000));

    // --- History clear request from prefs ---
    own.set_int64('history-clear-request', 1);
    await sleep(100);
    t.equal('a clear request empties the history', launcher.usage.model.recent('apps'), []);

    // --- Unpin, then disable during a fade leaves nothing behind ---
    own.set_strv('pinned', []);
    launcher.open();
    await sleep(50);
    launcher.close('escape');
    launcher.open();
    await sleep(50);
    Main.extensionManager.disableExtension(ext.uuid);
    await waitFor(() => !ext.stateObj.launcher, 2000);
    // Checked as soon as disable() has run: disable must destroy, not fade.
    // There is also a panel still fading from the Escape just above: it must go too.
    t.check('disable while open leaves no actors at all, not even a fading one',
        !Main.uiGroup.get_children().some(a => a.name === 'conjure-launcher-backdrop'),
        `${Main.uiGroup.get_children().filter(a => a.name === 'conjure-launcher-backdrop').length} left`);
    t.check('and no grab', grabReleased());

    t.finish();
}
