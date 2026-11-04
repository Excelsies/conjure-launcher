// Emoji search, after Noctalia src/launcher/emoji_provider.cpp (@ 60861c9): substring scoring,
// not fuzzy (exact name 1000, name prefix 500, name contains 200; keyword exact 150, prefix 100,
// contains 50), at most 100 results.

export const MAX_EMOJI_RESULTS = 100;

export const EMOJI_CATEGORY_LABELS = Object.freeze({
    people: 'Smileys & People', animals: 'Animals', nature: 'Nature', food: 'Food & Drink',
    activity: 'Activities', travel: 'Travel & Places', objects: 'Objects', symbols: 'Symbols', flags: 'Flags',
});

/**
 * Validate and index raw entries (from data/emoji.json). Invalid entries are dropped.
 * @returns {{emoji: string, name: string, nameLower: string, keywords: string[], category: string}[]}
 */
export function indexEmoji(raw) {
    if (!Array.isArray(raw))
        return [];
    const out = [];
    for (const e of raw) {
        if (!e || typeof e.emoji !== 'string' || typeof e.name !== 'string' || !e.emoji || !e.name)
            continue;
        out.push({
            emoji: e.emoji,
            name: e.name,
            nameLower: e.name.toLowerCase(),
            keywords: Array.isArray(e.keywords) ? e.keywords.filter(k => typeof k === 'string').map(k => k.toLowerCase()) : [],
            category: typeof e.category === 'string' ? e.category : '',
        });
    }
    return out;
}

export function scoreEmoji(query, e) {
    if (e.nameLower === query)
        return 1000;
    if (e.nameLower.startsWith(query))
        return 500;
    if (e.nameLower.includes(query))
        return 200;
    let best = 0;
    for (const kw of e.keywords) {
        if (kw === query)
            best = Math.max(best, 150);
        else if (kw.startsWith(query))
            best = Math.max(best, 100);
        else if (kw.includes(query))
            best = Math.max(best, 50);
    }
    return best;
}

/**
 * @returns {{id: string, title: string, subtitle: string, badge: string, score: number}[]}
 *   An empty query lists the first MAX_EMOJI_RESULTS in data order, score 0, so the usage boost
 *   (applied by the ranking) floats frequently used emoji to the top.
 */
export function searchEmoji(entries, text) {
    const query = text.trim().toLowerCase();
    const toResult = (e, score) => ({
        id: `emoji-${e.emoji}`, title: e.name, subtitle: EMOJI_CATEGORY_LABELS[e.category] ?? '', badge: e.emoji, score,
    });
    if (!query)
        return entries.slice(0, MAX_EMOJI_RESULTS).map(e => toResult(e, 0));
    const scored = [];
    for (const e of entries) {
        const s = scoreEmoji(query, e);
        if (s > 0)
            scored.push(toResult(e, s));
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, MAX_EMOJI_RESULTS);
}
