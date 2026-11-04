// The provider overview: a bare provider prefix ("/") lists the providers that have a trigger;
// choosing one rewrites the input to "<prefix><trigger> " (Noctalia's provider overview).

import { score as fuzzy, isMatch } from './fzy.js';

/**
 * @param {{id: string, trigger?: string, displayName?: string, icon?: string}[]} providers
 * @param {string} query     text after the prefix
 * @param {string} prefixChar
 */
export function providerOverview(providers, query, prefixChar) {
    const q = query.trim().toLowerCase();
    const out = [];
    for (const p of providers) {
        if (!p.trigger)
            continue;
        const s = q ? Math.max(fuzzy(q, p.trigger) * 2, fuzzy(q, (p.displayName ?? '').toLowerCase())) : 0;
        if (q && !isMatch(s))
            continue;
        out.push({
            id: `provider:${p.id}`, title: `${prefixChar}${p.trigger}`, subtitle: p.displayName ?? p.id,
            iconName: p.icon ?? 'system-search-symbolic', query: `${prefixChar}${p.trigger} `, score: s,
        });
    }
    return out.sort((a, b) => b.score - a.score);
}
