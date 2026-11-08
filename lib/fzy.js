// JavaScript port of fzy's scoring (src/match.c, src/bonus.h, config.h).
//
// fzy: Copyright (c) 2014 John Hawthorn, MIT License (see THIRD_PARTY_NOTICES.md).
// Ported from jhawthorn/fzy @ 34b8886, identical to the copy Noctalia vendors.
//
// Differences from the C original, all deliberate:
// - It works on UTF-16 code units, not bytes, and lowercases with toLowerCase() instead of the
//   C-locale tolower(). For ASCII the scores are identical; for non-ASCII text, case folding is
//   wider and gap penalties count characters rather than UTF-8 bytes.
// - score() reproduces Noctalia's FuzzyMatch::score wrapper, which is what providers call.

export const SCORE_GAP_LEADING = -0.005;
export const SCORE_GAP_TRAILING = -0.005;
export const SCORE_GAP_INNER = -0.01;
export const SCORE_MATCH_CONSECUTIVE = 1.0;
export const SCORE_MATCH_SLASH = 0.9;
export const SCORE_MATCH_WORD = 0.8;
export const SCORE_MATCH_CAPITAL = 0.7;
export const SCORE_MATCH_DOT = 0.6;
export const SCORE_MAX = Infinity;
export const SCORE_MIN = -Infinity;
export const MATCH_MAX_LEN = 1024;

/** Score Noctalia's wrapper gives an exact (case-insensitive) match. */
export const EXACT_MATCH_SCORE = 1024;

function isLower(c) {
    return c >= 'a' && c <= 'z';
}
function isUpper(c) {
    return c >= 'A' && c <= 'Z';
}
function isDigit(c) {
    return c >= '0' && c <= '9';
}

// bonus_states[bonus_index[ch]][last_ch]
function bonusFor(lastCh, ch) {
    // bonus_index: upper -> 2, lower/digit -> 1, anything else -> 0 (no bonus).
    const state = isUpper(ch) ? 2 : (isLower(ch) || isDigit(ch)) ? 1 : 0;
    if (state === 0)
        return 0;
    switch (lastCh) {
    case '/': return SCORE_MATCH_SLASH;
    case '-':
    case '_':
    case ' ': return SCORE_MATCH_WORD;
    case '.': return SCORE_MATCH_DOT;
    default:
        return state === 2 && isLower(lastCh) ? SCORE_MATCH_CAPITAL : 0;
    }
}

/**
 * True when every needle character appears in the haystack in order, ignoring case.
 * An empty needle always matches.
 */
export function hasMatch(needle, haystack) {
    const h = haystack.toLowerCase();
    let pos = 0;
    for (const ch of needle.toLowerCase()) {
        pos = h.indexOf(ch, pos);
        if (pos < 0)
            return false;
        pos++;
    }
    return true;
}

function setup(needle, haystack) {
    const lowerNeedle = needle.toLowerCase();
    const lowerHaystack = haystack.toLowerCase();
    const bonus = new Float64Array(haystack.length);
    let last = '/';
    for (let i = 0; i < haystack.length; i++) {
        const ch = haystack[i];
        bonus[i] = bonusFor(last, ch);
        last = ch;
    }
    return { lowerNeedle, lowerHaystack, bonus };
}

function matchRow(ctx, row, currD, currM, lastD, lastM) {
    const n = ctx.lowerNeedle.length;
    const m = ctx.lowerHaystack.length;
    const i = row;
    let prevScore = SCORE_MIN;
    const gapScore = i === n - 1 ? SCORE_GAP_TRAILING : SCORE_GAP_INNER;
    let prevM = SCORE_MIN;
    let prevD = SCORE_MIN;

    for (let j = 0; j < m; j++) {
        if (ctx.lowerNeedle[i] === ctx.lowerHaystack[j]) {
            let s = SCORE_MIN;
            if (!i)
                s = j * SCORE_GAP_LEADING + ctx.bonus[j];
            else if (j)
                s = Math.max(prevM + ctx.bonus[j], prevD + SCORE_MATCH_CONSECUTIVE);
            prevD = lastD[j];
            prevM = lastM[j];
            currD[j] = s;
            currM[j] = prevScore = Math.max(s, prevScore + gapScore);
        } else {
            prevD = lastD[j];
            prevM = lastM[j];
            currD[j] = SCORE_MIN;
            currM[j] = prevScore = prevScore + gapScore;
        }
    }
}

/**
 * fzy's match(): raw score. Callers must check hasMatch() first, exactly as in C.
 * Returns SCORE_MAX for an equal-length (that is, exact) match and SCORE_MIN for an empty or
 * over-long needle or haystack.
 */
export function match(needle, haystack) {
    if (!needle)
        return SCORE_MIN;
    const n = needle.length;
    const m = haystack.length;
    if (m > MATCH_MAX_LEN || n > m)
        return SCORE_MIN;
    if (n === m)
        return SCORE_MAX;

    const ctx = setup(needle, haystack);
    // The C code reuses one row buffer for "last" and "current"; matchRow reads lastX[j]
    // before writing currX[j], so in-place reuse is safe here too.
    const D = new Float64Array(m);
    const M = new Float64Array(m);
    for (let i = 0; i < n; i++)
        matchRow(ctx, i, D, M, D, M);
    return M[m - 1];
}

/**
 * Noctalia's FuzzyMatch::score: case-insensitive, with an empty pattern scoring 0, no match (or
 * empty text) scoring -Infinity, and an exact match scoring EXACT_MATCH_SCORE.
 */
export function score(pattern, text) {
    if (!pattern)
        return 0;
    if (!text)
        return SCORE_MIN;
    const needle = pattern.toLowerCase();
    if (!hasMatch(needle, text))
        return SCORE_MIN;
    const raw = match(needle, text);
    if (raw === SCORE_MAX)
        return EXACT_MATCH_SCORE;
    if (!Number.isFinite(raw))
        return SCORE_MIN;
    return raw;
}

export function isMatch(value) {
    return value > SCORE_MIN;
}
