// Invariant 1 (docs/design-brief.md section 4): the user's toggle-application-view binding is
// always recoverable, and only the accelerators that collide with ours are taken. Pure logic
// over two small adapters, so it can be tested against fakes here and real GSettings in the
// headless shell test.
//
// GNOME adapter:  get(): string[]                   set(v: string[]): boolean
// Saved adapter:  getSaved(): string[]               setSaved(v: string[]): boolean
//                 hasSaved(): boolean                setHasSaved(b: boolean): boolean
// set* return false when the key is not writable (e.g. locked by an administrator).
//
// Write order is chosen so a crash between any two writes leaves a recoverable state:
//   take over:  saved value -> presence flag -> GNOME's key
//   restore:    GNOME's key -> presence flag -> saved value

const MODIFIER_ALIASES = new Map([
    ['mod4', 'super'], ['primary', 'control'], ['ctrl', 'control'], ['ctl', 'control'],
    ['mod1', 'alt'], ['meta', 'meta'], ['hyper', 'hyper'], ['shift', 'shift'],
    ['control', 'control'], ['alt', 'alt'], ['super', 'super'],
]);

/**
 * Canonical form of a GTK accelerator string, for comparison only: modifiers lowercased,
 * aliased (<Mod4> = <Super>, <Primary>/<Ctrl> = <Control>) and sorted; key name lowercased.
 * Returns '' for an empty or unparseable accelerator.
 */
export function normalizeAccel(accel) {
    if (typeof accel !== 'string')
        return '';
    const mods = [];
    const rest = accel.trim().replace(/<([^<>]+)>/g, (_m, name) => {
        const n = name.trim().toLowerCase();
        mods.push(MODIFIER_ALIASES.get(n) ?? n);
        return '';
    }).trim().toLowerCase();
    if (!rest)
        return '';
    return `${[...new Set(mods)].sort().map(m => `<${m}>`).join('')}${rest}`;
}

function strip(binding, ours) {
    const taken = new Set(ours.map(normalizeAccel).filter(Boolean));
    return binding.filter(a => !taken.has(normalizeAccel(a)));
}

function sameList(a, b) {
    return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Remove our accelerators from GNOME's app-grid binding, saving the original first.
 * @param {string[]} ours  our toggle-launcher accelerators
 * @returns {{ok: boolean, changed: boolean, reason?: string}}
 *   ok=false means GNOME's key was left untouched.
 */
export function takeOver(gnome, saved, ours) {
    const current = gnome.get();

    if (saved.hasSaved()) {
        const copy = saved.getSaved();
        // GNOME's key still holds what we would have left from the copy: the last session died
        // without restoring. Keep the copy; there is nothing more to write.
        if (sameList(current, strip(copy, ours)))
            return { ok: true, changed: false, reason: 'kept the copy from an unrestored session' };
        // Otherwise the user changed the key since: their value is the new original.
    }

    const stripped = strip(current, ours);
    if (sameList(stripped, current)) {
        // Nothing collides. Drop any stale copy (best effort) and touch nothing else.
        if (saved.hasSaved()) {
            saved.setHasSaved(false);
            saved.setSaved([]);
        }
        return { ok: true, changed: false };
    }

    if (!saved.setSaved(current))
        return { ok: false, changed: false, reason: 'could not write saved-toggle-application-view' };
    if (!saved.setHasSaved(true))
        return { ok: false, changed: false, reason: 'could not write has-saved-toggle-application-view' };
    if (!gnome.set(stripped))
        return { ok: false, changed: false, reason: 'org.gnome.shell.keybindings toggle-application-view is not writable' };
    return { ok: true, changed: true };
}

/**
 * Put GNOME's binding back if it still holds exactly what we left there.
 * @param {string[]} ours  the accelerators that were taken (the current toggle-launcher value)
 * @returns {{restored: boolean, reason?: string}}
 */
export function restore(gnome, saved, ours) {
    if (!saved.hasSaved())
        return { restored: false, reason: 'nothing saved' };
    const copy = saved.getSaved();
    const current = gnome.get();
    let restored = false;
    if (sameList(current, strip(copy, ours))) {
        if (!gnome.set(copy))
            return { restored: false, reason: 'toggle-application-view is not writable; saved copy kept' };
        restored = true;
    }
    // Only forget the copy once GNOME's key is good again (restored, or changed by the user).
    saved.setHasSaved(false);
    saved.setSaved([]);
    return { restored, reason: restored ? undefined : 'the binding was changed while enabled; kept it' };
}
