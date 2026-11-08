// An application overriding the theme, against the real settings: the user's theme is saved while no application
// names itself, an application's tokens never are, turning "Keep my colors" on brings the user's theme back and
// clears the application's name, and turning it off hands the application's theme back. Disabling removes the
// pending save and the watchers.
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import { Suite, extension, sleep, waitFor } from './lib/harness.js';
import { paletteValues } from '../../prefs/palettes.js';

const SETTLE_MS = 500;  // longer than the 200 ms save delay

export async function run() {
    const t = new Suite();
    const ext = extension();
    const own = ext.stateObj.getSettings();
    const saved = () => own.get_value('saved-user-theme').recursiveUnpack();
    const setTheme = (id, radius, font) => {
        for (const [k, v] of Object.entries(paletteValues(id)))
            own.set_string(`theme-${k}`, v);
        own.set_double('theme-radius-scale', radius);
        own.set_string('theme-font-family', font);
    };
    const current = () => ({
        primary: own.get_string('theme-primary'), surface: own.get_string('theme-surface'),
        radius: own.get_double('theme-radius-scale'), font: own.get_string('theme-font-family'),
    });
    const dracula = paletteValues('dracula');
    const nord = paletteValues('nord');

    t.check('nothing overrides the theme at the start', own.get_string('theme-override-source') === '' &&
        !own.get_boolean('theme-overrides-locked'));
    t.check('enabling saved the starting theme', saved()['theme-radius-scale'] === 1 && saved()['theme-primary'] === '',
        JSON.stringify(saved()));

    setTheme('dracula', 1.5, 'Cantarell');
    await sleep(SETTLE_MS);
    t.check('the user theme is saved', saved()['theme-primary'] === dracula['primary'] &&
        saved()['theme-radius-scale'] === 1.5 && saved()['theme-font-family'] === 'Cantarell', JSON.stringify(saved()));

    own.set_string('theme-override-source', 'Test Theme App');
    setTheme('nord', 2.5, 'Monospace');
    await sleep(SETTLE_MS);
    t.equal('an application\'s tokens are applied', current().primary, nord['primary']);
    t.check('but never saved as the user\'s', saved()['theme-primary'] === dracula['primary'] &&
        saved()['theme-radius-scale'] === 1.5, JSON.stringify(saved()));

    own.set_boolean('theme-overrides-locked', true);
    await sleep(100);
    t.equal('Keep my colors clears the application\'s name', own.get_string('theme-override-source'), '');
    t.equal('and brings the user theme back', current(),
        { primary: dracula['primary'], surface: dracula['surface'], radius: 1.5, font: 'Cantarell' });
    await sleep(SETTLE_MS);
    t.equal('the restored theme stays saved', saved()['theme-primary'], dracula['primary']);
    const savedApp = () => own.get_value('saved-app-theme').recursiveUnpack();
    t.check('the application\'s theme is kept aside', savedApp()['theme-override-source'] === 'Test Theme App' &&
        savedApp()['theme-primary'] === nord['primary'] && savedApp()['theme-radius-scale'] === 2.5, JSON.stringify(savedApp()));

    own.set_boolean('theme-overrides-locked', false);
    await sleep(100);
    t.equal('turning Keep my colors off hands the theme back to the application', own.get_string('theme-override-source'), 'Test Theme App');
    t.equal('with its own theme', current(), { primary: nord['primary'], surface: nord['surface'], radius: 2.5, font: 'Monospace' });
    t.equal('and its kept copy is used up', JSON.stringify(savedApp()), '{}');
    await sleep(SETTLE_MS);
    t.equal('the handed-back theme is not saved as the user\'s', saved()['theme-primary'], dracula['primary']);

    // On, off, on again: the round trip holds.
    own.set_boolean('theme-overrides-locked', true);
    await sleep(100);
    t.equal('turning it on again brings the user theme back again', current().primary, dracula['primary']);
    own.set_boolean('theme-overrides-locked', false);
    await sleep(100);
    t.equal('and off again hands the application\'s theme back again', current().primary, nord['primary']);

    // The application stops (resets its name); then the lock with no application named: the user's own edits are
    // saved, and turning the lock on or off changes nothing.
    own.reset('theme-override-source');
    own.set_boolean('theme-overrides-locked', true);
    setTheme('gruvbox', 1, '');
    await sleep(SETTLE_MS);
    t.equal('with the lock on, the user\'s edits are saved', saved()['theme-primary'], paletteValues('gruvbox')['primary']);
    own.set_boolean('theme-overrides-locked', false);
    await sleep(100);
    t.equal('turning the lock off with nothing kept changes nothing', current().primary, paletteValues('gruvbox')['primary']);
    t.equal('and names no application', own.get_string('theme-override-source'), '');
    own.set_boolean('theme-overrides-locked', true);
    await sleep(100);
    t.equal('turning the lock on with no application named keeps the current theme', current().primary, paletteValues('gruvbox')['primary']);
    own.set_boolean('theme-overrides-locked', false);

    // Disabling with a save pending removes it, and the watchers.
    own.set_string('theme-primary', '#123456');
    const watcher = ext.stateObj.themeOverride;
    const pending = watcher._saveId;
    const ids = [...watcher._ids];
    t.check('a save is pending', pending > 0);
    Main.extensionManager.disableExtension(GLib.getenv('CONJURE_TEST_UUID'));
    await waitFor(() => !ext.stateObj.themeOverride);
    t.check('disable removes the pending save', GLib.MainContext.default().find_source_by_id(pending) === null);
    t.check('and every watcher', ids.every(id => !GObject.signal_handler_is_connected(own, id)));

    for (const key of [...Object.keys(paletteValues('ubuntu')).map(k => `theme-${k}`), 'theme-radius-scale',
        'theme-font-family', 'theme-overrides-locked', 'theme-override-source', 'saved-user-theme', 'saved-app-theme'])
        own.reset(key);
    t.finish();
}
