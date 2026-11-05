// Typo tolerance for app search: "firfox" finds Firefox. A query that fzy cannot match (fzy needs the query
// letters in order) is compared with the app's name and each word of it by edit distance (optimal string
// alignment: insert, delete, substitute, or swap two neighbors). Typo matches are always listed but rank
// below every real match: they score near TYPO_SCORE, and a real fzy match never scores below about -100
// (gap penalties of 0.01 per character over at most 1024 characters, times the largest field weight, 5).

export const TYPO_SCORE = -1e6;
export const MIN_TYPO_LENGTH = 4;

/** Edits allowed for a query of this length: none under 4 characters, 1 up to 5, 2 from 6. */
export function allowedEdits(length) {
    if (length < MIN_TYPO_LENGTH)
        return 0;
    return length <= 5 ? 1 : 2;
}

/** Optimal string alignment distance, or max + 1 as soon as it must exceed max. */
export function editDistance(a, b, max = Infinity) {
    if (Math.abs(a.length - b.length) > max)
        return max + 1;
    let prev2 = null;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        let rowMin = i;
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
            if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1])
                v = Math.min(v, prev2[j - 2] + 1);
            cur.push(v);
            rowMin = Math.min(rowMin, v);
        }
        if (rowMin > max)
            return max + 1;
        prev2 = prev;
        prev = cur;
    }
    return prev[b.length];
}

/**
 * @param {string} pattern  lowercased query
 * @param {string} nameLower  lowercased app name
 * @returns {number} a score near TYPO_SCORE (fewer edits higher), or -Infinity for no typo match
 */
export function typoScore(pattern, nameLower) {
    const max = allowedEdits(pattern.length);
    if (!max || !nameLower)
        return -Infinity;
    const candidates = [nameLower, ...nameLower.split(/[\s\-_.]+/).filter(w => w.length >= MIN_TYPO_LENGTH - 1)];
    let best = Infinity;
    for (const c of candidates)
        best = Math.min(best, editDistance(pattern, c, max));
    return best <= max ? TYPO_SCORE - best : -Infinity;
}
