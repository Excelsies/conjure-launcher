// Clipboard history (invariant 7: a copy marked secret is never stored). Pure: the shell side reads the
// clipboard and passes the offered MIME types and the text here.
//
// Fail closed: a copy is stored only when it offers a text type, carries no password-manager hint (any
// value of x-kde-passwordManagerHint, which KeePassXC, Bitwarden and others set on secrets), and its text
// is non-blank and at most MAX_ENTRY_CHARS long. History lives in memory only.

export const SECRET_HINT_MIME = 'x-kde-passwordManagerHint';
export const TEXT_MIMES = Object.freeze(['text/plain;charset=utf-8', 'UTF8_STRING', 'text/plain', 'STRING', 'TEXT']);
export const MAX_ENTRY_CHARS = 64 * 1024;
export const DEFAULT_LIMIT = 50;
export const MIN_LIMIT = 10;
export const MAX_LIMIT = 200;

/**
 * @param {string[]} mimetypes  what the copying app offers
 * @param {unknown} text  the clipboard text, as read
 */
export function shouldStore(mimetypes, text) {
    if (!Array.isArray(mimetypes) || mimetypes.includes(SECRET_HINT_MIME))
        return false;
    if (!mimetypes.some(m => TEXT_MIMES.includes(m)))
        return false;
    return typeof text === 'string' && text.trim() !== '' && text.length <= MAX_ENTRY_CHARS;
}

export function clampLimit(n) {
    return Number.isInteger(n) ? Math.min(MAX_LIMIT, Math.max(MIN_LIMIT, n)) : DEFAULT_LIMIT;
}

export class ClipHistory {
    constructor(limit = DEFAULT_LIMIT) {
        this._limit = clampLimit(limit);
        /** @type {{text: string, at: number}[]} newest first */
        this._items = [];
    }

    /** Add a copy; copying the same text again moves it to the top instead of duplicating it. */
    add(text, now = Date.now()) {
        this._items = [{ text, at: now }, ...this._items.filter(i => i.text !== text)].slice(0, this._limit);
    }

    setLimit(limit) {
        this._limit = clampLimit(limit);
        this._items = this._items.slice(0, this._limit);
    }

    items() {
        return this._items.map(i => ({ ...i }));
    }

    clear() {
        this._items = [];
    }
}

/** One line for the result row: the first non-blank line, whitespace collapsed, cut at max characters. */
export function preview(text, max = 120) {
    const line = text.split('\n').find(l => l.trim()) ?? '';
    const flat = line.replace(/\s+/g, ' ').trim();
    return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}
