// Merge and rank results from several providers, with Noctalia's usage boost
// (src/shell/launcher/launcher_panel.cpp usageBoostForScore @ 60861c9).

import { isMatch } from './fzy.js';

export const USAGE_SCORE_PER_COUNT = 0.1;
export const TYPED_USAGE_SCORE_CAP = 0.5;

/**
 * With no query typed, usage sorts freely (count x 0.1). With a query, it only nudges real
 * matches and is capped, so a weak fuzzy hit cannot outrank a much stronger lexical match.
 */
export function usageBoost(score, usageCount, typedQuery) {
    if (!(usageCount > 0))
        return 0;
    const raw = usageCount * USAGE_SCORE_PER_COUNT;
    if (!typedQuery)
        return raw;
    if (!isMatch(score))
        return 0;
    return Math.min(raw, TYPED_USAGE_SCORE_CAP);
}

/**
 * @typedef {object} Result
 * @property {string} id           Stable within its provider; the usage key.
 * @property {string} providerId
 * @property {string} title
 * @property {string} [subtitle]
 * @property {number} score
 */

/**
 * Apply usage boosts and stable-sort every provider's results by score, highest first.
 * Scores are not normalized across providers (as in Noctalia).
 * @param {Array<{provider: {id: string, trackUsage?: boolean}, results: Result[]}>} groups
 * @param {{usageCount?: (providerId: string, id: string) => number, typedQuery: boolean,
 *          sortByUsage: boolean}} opts
 * @returns {Result[]} new objects; inputs are not mutated
 */
export function rank(groups, { usageCount, typedQuery, sortByUsage }) {
    const out = [];
    for (const { provider, results } of groups) {
        const boost = sortByUsage && provider.trackUsage && usageCount;
        for (const r of results) {
            const s = boost ? r.score + usageBoost(r.score, usageCount(provider.id, r.id), typedQuery) : r.score;
            out.push({ ...r, providerId: provider.id, score: s });
        }
    }
    // Array.prototype.sort is stable (ES2019), which keeps each provider's own order on ties.
    out.sort((a, b) => b.score - a.score);
    return out;
}

/**
 * Score for a GNOME search-provider result: always below an app name match (3000+), an
 * alternate-name match (1500+) and the calculator (10000). Above fuzzy (non-exact) matches on an
 * app's secondary fields, which score in the tens. An EXACT secondary match still wins: an exact
 * keyword scores 1024 x 0.8 = 819 (just below), an exact id 1024 x 1.5 = 1536 and an exact
 * generic name 1024 x 2 = 2048 (above), so "browser" still puts the browser first.
 * Providers keep GNOME's sort order; each provider's own result order is kept.
 */
export const REMOTE_BASE_SCORE = 1000;
export function remoteResultScore(providerIndex, resultIndex) {
    return REMOTE_BASE_SCORE - providerIndex * 20 - resultIndex;
}
