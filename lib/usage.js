// Launch history: per-provider launch counts and a most-recent-first list (Noctalia's
// usage_counts.json + recently_used.json, merged into one file). Pure: file I/O lives in
// shell/usageFile.js.
//
// Ranking uses a weight that halves every HALF_LIFE_MS rather than the raw count. The weights are an extra
// "decay" key of the version-1 file, which older versions ignore; counts are still kept exactly. A count
// with no weight yet starts decaying, at its full value, from when the file is read.
//
// The parser trusts nothing about the file: wrong types, extra keys, prototype keys
// ("__proto__") and absurd counts are dropped entry by entry, so one bad entry never loses the
// rest of the history.

export const USAGE_FORMAT_VERSION = 1;
export const RECENT_LIMIT = 20;
const MAX_COUNT = 1_000_000;
export const HALF_LIFE_MS = 14 * 24 * 3600 * 1000;
const MAX_SKEW_MS = 24 * 3600 * 1000;  // a decay time this far in the future is garbage

function isPlainObject(v) {
    return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export class UsageModel {
    constructor(now = Date.now()) {
        /** @type {Map<string, Map<string, number>>} */
        this._counts = new Map();
        /** @type {Map<string, string[]>} */
        this._recent = new Map();
        /** @type {Map<string, Map<string, {weight: number, at: number}>>} */
        this._decay = new Map();
        this._seededAt = now;  // when counts without a decay entry start decaying
    }

    /**
     * @param {string} text  File contents.
     * @returns {{model: UsageModel, dropped: number}}  dropped = entries ignored as invalid.
     * @throws {SyntaxError} when the text is not JSON or not a version-1 object; the caller
     *         decides what to do with the unreadable file.
     */
    static parse(text, now = Date.now()) {
        const data = JSON.parse(text);
        if (!isPlainObject(data) || data.version !== USAGE_FORMAT_VERSION)
            throw new SyntaxError('not a version 1 usage file');

        const model = new UsageModel(now);
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

        // Decay entries only for ids that have a count; [weight, at]. A bad entry falls back to the count.
        if (isPlainObject(data.decay)) {
            for (const [pid, entries] of Object.entries(data.decay)) {
                const counts = model._counts.get(pid);
                if (!isPlainObject(entries) || !counts) {
                    dropped++;
                    continue;
                }
                const m = new Map();
                for (const [id, e] of Object.entries(entries)) {
                    const ok = counts.has(id) && Array.isArray(e) && e.length === 2 &&
                        Number.isFinite(e[0]) && e[0] > 0 && e[0] <= MAX_COUNT &&
                        Number.isInteger(e[1]) && e[1] > 0 && e[1] <= now + MAX_SKEW_MS;
                    if (ok)
                        m.set(id, { weight: e[0], at: e[1] });
                    else
                        dropped++;
                }
                if (m.size)
                    model._decay.set(pid, m);
            }
        } else if (data.decay !== undefined) {
            dropped++;
        }

        return { model, dropped };
    }

    count(providerId, id) {
        return this._counts.get(providerId)?.get(id) ?? 0;
    }

    /** The ranking weight: launches, each halving in value every HALF_LIFE_MS. 0 = never launched. */
    weight(providerId, id, now = Date.now()) {
        const e = this._entry(providerId, id);
        if (!e)
            return 0;
        return e.weight * 0.5 ** (Math.max(0, now - e.at) / HALF_LIFE_MS);
    }

    _entry(providerId, id) {
        const e = this._decay.get(providerId)?.get(id);
        if (e)
            return e;
        const c = this.count(providerId, id);
        return c ? { weight: c, at: this._seededAt } : null;
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

    record(providerId, id, now = Date.now()) {
        const weight = Math.min(this.weight(providerId, id, now) + 1, MAX_COUNT);
        let m = this._counts.get(providerId);
        if (!m) {
            m = new Map();
            this._counts.set(providerId, m);
        }
        m.set(id, Math.min((m.get(id) ?? 0) + 1, MAX_COUNT));
        let d = this._decay.get(providerId);
        if (!d) {
            d = new Map();
            this._decay.set(providerId, d);
        }
        d.set(id, { weight, at: now });

        const list = (this._recent.get(providerId) ?? []).filter(x => x !== id);
        list.unshift(id);
        this._recent.set(providerId, list.slice(0, RECENT_LIMIT));
    }

    clear() {
        this._counts.clear();
        this._recent.clear();
        this._decay.clear();
    }

    serialize() {
        // fromEntries defines own properties, so an id like "__proto__" stays data; plain
        // assignment (obj[pid] = ...) would set the prototype instead.
        const counts = Object.fromEntries([...this._counts].map(([pid, m]) => [pid, Object.fromEntries(m)]));
        const recent = Object.fromEntries(this._recent);
        // Every counted id gets an entry, so a carried-over count's start time is fixed at the first save.
        const decay = Object.fromEntries([...this._counts].map(([pid, m]) => [pid, Object.fromEntries([...m.keys()].map(id => {
            const e = this._entry(pid, id);
            return [id, [Math.round(e.weight * 1e4) / 1e4, e.at]];
        }))]));
        return `${JSON.stringify({ version: USAGE_FORMAT_VERSION, counts, recent, decay }, null, 1)}\n`;
    }
}
