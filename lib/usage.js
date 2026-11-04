// Launch history: per-provider launch counts and a most-recent-first list (Noctalia's
// usage_counts.json + recently_used.json, merged into one file). Pure: file I/O lives in
// shell/usageFile.js.
//
// The parser trusts nothing about the file: wrong types, extra keys, prototype keys
// ("__proto__") and absurd counts are dropped entry by entry, so one bad entry never loses the
// rest of the history.

export const USAGE_FORMAT_VERSION = 1;
export const RECENT_LIMIT = 20;
const MAX_COUNT = 1_000_000;

function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export class UsageModel {
    constructor() {
        /** @type {Map<string, Map<string, number>>} */
        this._counts = new Map();
        /** @type {Map<string, string[]>} */
        this._recent = new Map();
    }

    /**
     * @param {string} text  File contents.
     * @returns {{model: UsageModel, dropped: number}}  dropped = entries ignored as invalid.
     * @throws {SyntaxError} when the text is not JSON or not a version-1 object; the caller
     *         decides what to do with the unreadable file.
     */
    static parse(text) {
        const data = JSON.parse(text);
        if (!isPlainObject(data) || data.version !== USAGE_FORMAT_VERSION)
            throw new SyntaxError('not a version 1 usage file');

        const model = new UsageModel();
        let dropped = 0;

        if (isPlainObject(data.counts)) {
            for (const [pid, entries] of Object.entries(data.counts)) {
                if (!isPlainObject(entries)) {
                    dropped++;
                    continue;
                }
                const m = new Map();
                for (const [id, n] of Object.entries(entries)) {
                    if (Number.isInteger(n) && n > 0 && n <= MAX_COUNT)
                        m.set(id, n);
                    else
                        dropped++;
                }
                if (m.size)
                    model._counts.set(pid, m);
            }
        } else if (data.counts !== undefined) {
            dropped++;
        }

        if (isPlainObject(data.recent)) {
            for (const [pid, list] of Object.entries(data.recent)) {
                if (!Array.isArray(list)) {
                    dropped++;
                    continue;
                }
                const seen = new Set();
                const ids = [];
                // Input comes from JSON.parse, so arrays are dense; each element is checked.
                for (let i = 0; i < list.length && ids.length < RECENT_LIMIT; i++) {
                    const id = list[i];
                    if (typeof id === 'string' && id && !seen.has(id)) {
                        seen.add(id);
                        ids.push(id);
                    } else {
                        dropped++;
                    }
                }
                if (ids.length)
                    model._recent.set(pid, ids);
            }
        } else if (data.recent !== undefined) {
            dropped++;
        }

        return { model, dropped };
    }

    count(providerId, id) {
        return this._counts.get(providerId)?.get(id) ?? 0;
    }

    /** Ids for one provider, most recent first. */
    recent(providerId) {
        return [...(this._recent.get(providerId) ?? [])];
    }

    /** Noctalia's recentlyUsedIndex: size - position, so the newest is largest; 0 = not recent. */
    recentIndex(providerId, id) {
        const list = this._recent.get(providerId);
        const i = list ? list.indexOf(id) : -1;
        return i < 0 ? 0 : list.length - i;
    }

    record(providerId, id) {
        let m = this._counts.get(providerId);
        if (!m) {
            m = new Map();
            this._counts.set(providerId, m);
        }
        m.set(id, Math.min((m.get(id) ?? 0) + 1, MAX_COUNT));

        const list = (this._recent.get(providerId) ?? []).filter(x => x !== id);
        list.unshift(id);
        this._recent.set(providerId, list.slice(0, RECENT_LIMIT));
    }

    clear() {
        this._counts.clear();
        this._recent.clear();
    }

    serialize() {
        // fromEntries defines own properties, so an id like "__proto__" stays data; plain
        // assignment (obj[pid] = ...) would set the prototype instead.
        const counts = Object.fromEntries([...this._counts].map(([pid, m]) => [pid, Object.fromEntries(m)]));
        const recent = Object.fromEntries(this._recent);
        return `${JSON.stringify({ version: USAGE_FORMAT_VERSION, counts, recent }, null, 1)}\n`;
    }
}
