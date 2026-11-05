// Phase 3 integration test (headless GNOME Shell, tools/shell-test.sh): calculator, emoji,
// session actions, open windows, the provider overview and GNOME search providers (through the
// fixture provider in tests/shell/fixtures; the machine's own providers are disabled).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import St from 'gi://St';

import * as Scripting from 'resource:///org/gnome/shell/ui/scripting.js';
import * as SystemActions from 'resource:///org/gnome/shell/misc/systemActions.js';

import { Suite, extension, pressKeys, waitFor, sleep } from './lib/harness.js';
import { parseColour, systemDefaults, toCss } from '../../lib/theme.js';

// SAFETY FIRST. The sandbox shares the machine's system bus, so a real activateSuspend /
// activatePowerOff here would act on the real computer. Replace every session action with a
// recorder before anything else runs, and abort if that did not take.
const sessionCalls = [];
const sys = SystemActions.getDefault();
for (const name of ['activateLockScreen', 'activateLogout', 'activateSuspend', 'activateSwitchUser',
    'activateRestart', 'activatePowerOff'])
    sys[name] = () => sessionCalls.push(name);
for (const name of ['canLockScreen', 'canLogout', 'canSuspend', 'canSwitchUser', 'canRestart', 'canPowerOff'])
    Object.defineProperty(sys, name, { value: true, configurable: true });

function clipboardText() {
    return new Promise(resolve => St.Clipboard.get_default().get_text(St.ClipboardType.CLIPBOARD, (_c, text) => resolve(text)));
}

function searchLog() {
    const path = GLib.build_filenamev([GLib.getenv('XDG_STATE_HOME'), 'conjure-test-search.log']);
    try {
        return new TextDecoder().decode(Gio.File.new_for_path(path).load_contents(null)[1]).trim().split('\n').filter(Boolean);
    } catch {
        return [];
    }
}

export async function run() {
    const t = new Suite();
    const stubbed = ['activateSuspend', 'activatePowerOff', 'activateRestart', 'activateLogout', 'activateLockScreen', 'activateSwitchUser']
        .every(n => /sessionCalls\.push/.test(String(sys[n])));
    if (!stubbed)
        throw new Error('session actions are not stubbed; refusing to run (a real suspend/power off could happen)');
    t.check('session actions are replaced by recorders before any test runs', stubbed);

    const ext = extension();
    const own = ext.stateObj.getSettings();
    const launcher = ext.stateObj.launcher;
    await launcher.usageReady;
    const titles = () => launcher.panel?.rows.map(r => r.result?.title ?? r.action?.label) ?? [];
    const type = async (text, ms = 60) => {
        launcher.panel.setText(text);
        await sleep(ms);
    };
    const openWith = async text => {
        if (!launcher.isOpen)
            launcher.open();
        await sleep(30);
        await type(text);
    };

    // --- Calculator ---
    await openWith('12*3');
    t.equal('arithmetic in global search shows the result first', titles()[0], '= 36');
    t.check('the selected symbolic icon takes the selected text colour',
        launcher.panel.iconOf(launcher.panel.rows[0])?.get_style()?.includes(
            toCss(parseColour(systemDefaults(launcher.systemStyle.get())['on-primary']))),
        launcher.panel.iconOf(launcher.panel.rows[0])?.get_style());
    await pressKeys(Clutter.KEY_Return);
    t.check('Enter on the result closes the launcher', await waitFor(() => !launcher.isOpen, 1000));
    t.equal('and copies the value', await clipboardText(), '36');
    await openWith('/calc 2^10 + 0.1 + 0.2');
    t.equal('/calc evaluates with float noise hidden', titles(), ['= 1024.3']);
    await type('/calc constructor');
    t.equal('/calc shows nothing for input it cannot evaluate', titles(), []);
    await type('gimp 2');
    t.check('a digit alone does not bring up the calculator', !titles().some(x => x.startsWith('=')));
    own.set_boolean('app-grid', true);
    await type('12*3');
    t.check('results that are not apps fall back to the list in grid mode',
        launcher.panel.rows[0]?.layout === 'list', launcher.panel.rows[0]?.layout);
    own.set_boolean('app-grid', false);

    // --- Provider overview ---
    await type('/');
    t.equal('a bare "/" lists the providers', titles(), ['/calc', '/emo', '/win', '/session', '/wall']);
    await type('/em');
    t.equal('the overview filters as you type', titles(), ['/emo']);
    await pressKeys(Clutter.KEY_Return);
    t.check('choosing a provider fills in its prefix and keeps the launcher open',
        await waitFor(() => launcher.panel?.text === '/emo ', 1000) && launcher.isOpen, `"${launcher.panel?.text}"`);

    // --- Emoji ---
    await type('/emo grinning face');
    t.equal('the exact emoji name ranks first', launcher.panel.rows[0]?.result.badge, '😀');
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => !launcher.isOpen, 1000);
    t.equal('Enter copies the emoji', await clipboardText(), '😀');
    t.equal('emoji launches are counted', launcher.usage.model.count('emoji', 'emoji-😀'), 1);
    await openWith('/emo ');
    t.equal('frequently used emoji float to the top', launcher.panel.rows[0]?.result.badge, '😀');

    // --- Session actions (recorded, never real) ---
    await type('/session');
    t.equal('/session lists the actions', titles(),
        ['Lock Screen', 'Log Out', 'Suspend', 'Switch User', 'Restart', 'Power Off']);
    await type('/session sleep');
    t.equal('aliases find actions', titles()[0], 'Suspend');
    await pressKeys(Clutter.KEY_Return);
    await waitFor(() => !launcher.isOpen, 1000);
    t.equal('Enter runs that action (through the recorder)', sessionCalls, ['activateSuspend']);

    // --- Open windows ---
    await Scripting.createTestWindow({ width: 400, height: 300 });
    await Scripting.waitTestWindows();
    // Under load (e.g. other headless shells on the machine) a new window can take seconds to be
    // focused; measured 3.4 s at load average 10. Wait for it instead of a fixed sleep.
    t.check('the test window gets focus', Boolean(await waitFor(() => global.display.focus_window, 10000)));
    const before = global.display.focus_window;
    await openWith('/win');
    const windowRows = launcher.panel.rows.filter(r => r.result?.window);
    t.check('/win lists open windows', windowRows.length >= 1, titles().join(', '));
    const target = windowRows.at(-1).result.window;
    launcher.panel.selectedIndex = windowRows.at(-1).index;
    await pressKeys(Clutter.KEY_Return);
    t.check('Enter focuses that window', await waitFor(() => global.display.focus_window === target, 5000),
        `focus ${global.display.focus_window?.get_title()} (before: ${before?.get_title()})`);
    await Scripting.destroyTestWindows();

    // --- GNOME search providers (fixture) ---
    await openWith('zebrafile');
    t.check('provider results arrive asynchronously', await waitFor(() => titles().includes('Zebra File 1'), 3000),
        titles().join(', '));
    const zebra = launcher.panel.rows.find(r => r.result?.title === 'Zebra File 1');
    t.equal('they carry the provider description', zebra?.result.subtitle, 'Fixture search result');
    t.check('a result without its own icon shows the provider app icon', launcher.panel.iconOf(zebra) !== null);
    launcher.panel.selectedIndex = zebra.index;
    await pressKeys(Clutter.KEY_Return);
    t.check('Enter activates the result in its provider', await waitFor(() =>
        searchLog().includes('activate file-1 zebrafile'), 2000), JSON.stringify(searchLog()));

    // Debounce: quick typing sends only the last query to D-Bus.
    const callsBefore = searchLog().filter(l => l.startsWith('initial')).length;
    await openWith('zebraf');
    await type('zebrafi', 10);
    await type('zebrafile', 10);
    await waitFor(() => titles().includes('Zebra File 1'), 3000);
    const newCalls = searchLog().filter(l => l.startsWith('initial')).slice(callsBefore);
    t.equal('typing within the debounce window sends one query', newCalls, ['initial zebrafile']);

    // Timeout: a provider slower than the budget contributes nothing.
    await type('slowzebra', 900);
    t.check('a provider slower than the budget is skipped', !titles().includes('Slow Zebra'), titles().join(', '));
    await sleep(1500);
    t.check('and its late answer never appears', !titles().includes('Slow Zebra'));

    // Excluding a provider in the launcher's settings.
    own.set_strv('excluded-search-providers', ['conjure-test-alpha.desktop']);
    await type('zebrafile', 700);
    t.check('an excluded provider is not queried', !titles().includes('Zebra File 1'), titles().join(', '));
    own.reset('excluded-search-providers');
    launcher.close('test');

    t.finish();
}
