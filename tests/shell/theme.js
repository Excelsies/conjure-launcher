// The default theme follows the system: with every colour key empty the panel is Ubuntu Light or
// Dark from the system's style, with the shell's accent colour, and restyles live when either changes.
// Any chosen theme stops that. Disabling disconnects the system watchers.
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, extension, sleep, waitFor } from './lib/harness.js';
import { paletteValues } from '../../lib/palettes.js';
import { parseColour, toCss, UBUNTU } from '../../lib/theme.js';

const css = hex => toCss(parseColour(hex));
// Anchored on the fill: Ubuntu Dark's panel style also contains #ffffff, as its text colour.
const fill = hex => `background-color: ${css(hex)}`;

export async function run() {
    const t = new Suite();
    const ext = extension();
    const own = ext.stateObj.getSettings();
    const launcher = ext.stateObj.launcher;
    const iface = new Gio.Settings({ schema_id: 'org.gnome.desktop.interface' });
    const panelStyle = () => launcher.panel?.styles.panel ?? '';
    const selectedStyle = () => launcher.panel?.styles.rowSelected ?? '';
    const setSystem = async (scheme, accent) => {
        iface.set_string('color-scheme', scheme);
        iface.set_string('accent-color', accent);
        await sleep(300);
    };

    t.check('every colour key starts empty (following the system)',
        Object.keys(paletteValues('ubuntu')).every(k => own.get_string(`theme-${k}`) === ''));

    await setSystem('prefer-dark', 'orange');
    launcher.open();
    t.check('the launcher opens', await waitFor(() => launcher.isOpen, 2000));
    t.check('dark style: the panel is Ubuntu Dark', panelStyle().includes(fill(UBUNTU.dark['surface'])), panelStyle());
    t.check('orange accent: the selected row is Ubuntu orange', selectedStyle().includes(fill('#d34615')), selectedStyle());

    await setSystem('prefer-dark', 'purple');
    t.check('changing the accent restyles the open panel (purple)', selectedStyle().includes(fill('#7764d8')), selectedStyle());

    await setSystem('default', 'purple');
    t.check('the light style ("default") restyles the open panel to Ubuntu Light',
        panelStyle().includes(fill(UBUNTU.light['surface'])), panelStyle());
    // Ubuntu's St draws each accent a shade darker under the light style (purple #7360d7, not #7764d8).
    const lightPurple = launcher.systemStyle.get().accent;
    t.check('and keeps the accent, as the shell draws it in the light style',
        ['#7764d8', '#7360d7'].includes(lightPurple) && selectedStyle().includes(fill(lightPurple)), `${lightPurple} | ${selectedStyle()}`);

    // A chosen theme stops following.
    for (const [k, v] of Object.entries(paletteValues('dracula')))
        own.set_string(`theme-${k}`, v);
    await sleep(100);
    const dracula = panelStyle();
    await setSystem('prefer-dark', 'blue');
    t.equal('a chosen theme ignores the system style and accent', panelStyle(), dracula);

    // A fixed Ubuntu variant (the toggle off) also ignores the system.
    for (const [k, v] of Object.entries(paletteValues('ubuntu-light')))
        own.set_string(`theme-${k}`, v);
    await sleep(100);
    t.check('fixed Ubuntu Light stays light under a dark system', panelStyle().includes(fill(UBUNTU.light['surface'])), panelStyle());
    t.check('and orange under a blue accent', selectedStyle().includes(fill('#d34615')), selectedStyle());

    // Back to following: the keys reset, and the current system applies at once.
    for (const k of Object.keys(paletteValues('ubuntu')))
        own.reset(`theme-${k}`);
    await sleep(100);
    t.check('resetting the keys follows the system again (dark, blue)',
        panelStyle().includes(fill(UBUNTU.dark['surface'])) && selectedStyle().includes(fill('#0073e5')), `${panelStyle()} | ${selectedStyle()}`);
    launcher.close('test');

    const ids = [...launcher.systemStyle._ids];
    const stSettings = St.Settings.get();
    t.check('two system watchers are connected', ids.length === 2 && ids.every(id => GObject.signal_handler_is_connected(stSettings, id)));
    Main.extensionManager.disableExtension(GLib.getenv('CONJURE_TEST_UUID'));
    await waitFor(() => !ext.stateObj.launcher);
    t.check('disable disconnects the system watchers', ids.every(id => !GObject.signal_handler_is_connected(stSettings, id)));
    await setSystem('default', 'orange');
    t.check('a system change after disable is harmless', Main.layoutManager !== null);
    t.finish();
}
