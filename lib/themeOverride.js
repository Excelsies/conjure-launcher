// An application overriding the theme names itself in theme-override-source. While it does, Settings hides the
// appearance controls, and the launcher keeps the user's own theme aside so "Keep my colors" can bring it back;
// turning "Keep my colors" off again hands the application's theme back.
import { COLOR_TOKENS, RADIUS_SCALE_MAX } from './theme.js';

export const SAVED_STRING_KEYS = Object.freeze([...Object.keys(COLOR_TOKENS).map(t => `theme-${t}`), 'theme-font-family']);
export const SAVED_DOUBLE_KEYS = Object.freeze(['theme-radius-scale']);
export const SAVED_KEYS = Object.freeze([...SAVED_STRING_KEYS, ...SAVED_DOUBLE_KEYS]);

/** The overriding application's name, or null when none is set. */
export function overridingApp(source) {
    const name = (source ?? '').trim();
    return name === '' ? null : name;
}

/** Settings hides the appearance controls only while an application overrides and the lock is off. */
export function appearanceOverridden({ locked, source }) {
    return !locked && overridingApp(source) !== null;
}

/**
 * The copy of the user's theme to save, or null while an application holds the theme. The caller reads the
 * values first and the marker after them: integrations set the marker before writing tokens, so values that
 * include their tokens are always seen together with the marker.
 * @param {Record<string, string|number>} values  key -> value, for SAVED_KEYS
 */
export function copyToSave(values, source) {
    return overridingApp(source) === null ? { ...values } : null;
}

/** The values to write back from a saved copy: known keys of the right type only, roundness kept in range. */
export function restoreValues(saved) {
    const out = {};
    for (const key of SAVED_STRING_KEYS) {
        if (typeof saved?.[key] === 'string')
            out[key] = saved[key];
    }
    for (const key of SAVED_DOUBLE_KEYS) {
        if (typeof saved?.[key] === 'number' && Number.isFinite(saved[key]))
            out[key] = Math.min(Math.max(saved[key], 0), RADIUS_SCALE_MAX);
    }
    return out;
}

/**
 * What turning "Keep my colors" off writes back from the application's saved theme: its name and its values,
 * or null when no application was saved (writing unnamed values would save them as the user's theme).
 */
export function handBackPlan(savedApp) {
    const name = overridingApp(savedApp?.['theme-override-source']);
    return name === null ? null : { name, values: restoreValues(savedApp) };
}
