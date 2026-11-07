// Application scoring, ported from Noctalia src/launcher/app_provider.cpp scoreEntry()
// (@ 60861c9, MIT). The weights are Noctalia's.

import { score as fuzzy, isMatch, SCORE_MIN } from './fzy.js';

export const NAME_MATCH_PRIORITY = 3000;
export const LOCALIZED_NAME_MATCH_PRIORITY = 1500;
export const NAME_PREFIX_BONUS = 500;
export const MAX_APP_RESULTS = 50;

/**
 * @typedef {object} AppEntry   All string fields already lowercased.
 * @property {string} nameLower           Display name in the current locale.
 * @property {string[]} altNamesLower     Other names (e.g. the untranslated Name) to match.
 * @property {string} genericLower
 * @property {string[]} keywordsLower
 * @property {string[]} categoriesLower
 * @property {string} idLower             Desktop id without ".desktop".
 * @property {string} execLower           Executable basename.
 */

function bestOf(pattern, words, weight) {
    let best = SCORE_MIN;
    for (const w of words) {
        if (w)
            best = Math.max(best, fuzzy(pattern, w) * weight);
    }
    return best;
}

/**
 * Score one app against a lowercased pattern. Empty pattern scores 0 (every app is shown);
 * no match on any field scores -Infinity.
 * @param {string} pattern
 * @param {AppEntry} e
 */
export function scoreApp(pattern, e) {
    if (!pattern)
        return 0;

    let nameScore = fuzzy(pattern, e.nameLower) * 5;
    if (isMatch(nameScore) && e.nameLower.startsWith(pattern))
        nameScore += NAME_PREFIX_BONUS;
    // The name is the primary field: any name match outranks every non-name match.
    if (isMatch(nameScore))
        return nameScore + NAME_MATCH_PRIORITY;

    const altScore = bestOf(pattern, e.altNamesLower, 5);
    if (isMatch(altScore))
        return altScore + LOCALIZED_NAME_MATCH_PRIORITY;

    return Math.max(
        fuzzy(pattern, e.genericLower) * 2,
        bestOf(pattern, e.keywordsLower, 0.8),
        bestOf(pattern, e.categoriesLower, 0.3),
        fuzzy(pattern, e.idLower) * 1.5,
        fuzzy(pattern, e.execLower),
    );
}
