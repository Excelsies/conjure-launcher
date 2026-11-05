// Invariant 4 (docs/architecture.md): a slow provider never blocks typing, and stale
// results never reach the screen. Every query and every close bumps a generation counter;
// async results are accepted only if their generation is still current.

import { route } from './router.js';
import { rank } from './ranking.js';
import { providerOverview } from './overview.js';

/** A per-query token: providers check .cancelled, or register work to cancel with onCancel(). */
function makeToken() {
    const callbacks = [];
    return {
        cancelled: false,
        onCancel(fn) {
            if (this.cancelled)
                fn();
            else
                callbacks.push(fn);
        },
        _cancel() {
            if (this.cancelled)
                return;
            this.cancelled = true;
            for (const fn of callbacks.splice(0))
                fn();
        },
    };
}

/**
 * Provider contract used here:
 *   id, trigger?, global?, acceptsGlobal?, trackUsage?
 *   query(text, token) -> Result[] | Promise<Result[]>
 *     token.cancelled turns true once the query is stale; token.onCancel(fn) runs fn then
 *     (or at once if already stale), e.g. to cancel D-Bus calls. Results need id, title, score.
 */
export class QueryController {
    /**
     * @param {{providers: object[], prefixChar: () => string,
     *          usageCount?: (pid: string, id: string) => number, sortByUsage: () => boolean,
     *          onResults: (results: object[], info: {generation: number, pending: number,
     *                      kind: string}) => void,
     *          logError?: (msg: string, err: unknown) => void}} opts
     */
    constructor(opts) {
        this._opts = opts;
        this._generation = 0;
        this._token = makeToken();
        this._token._cancel();
    }

    get generation() {
        return this._generation;
    }

    /**
     * Scope every query to one provider (dmenu mode): no routing, no prefixes, no overview.
     * @param {object|null} provider
     */
    setScope(provider) {
        this._scope = provider;
    }

    /** Drop everything in flight (called on close). */
    cancel() {
        this._generation++;
        this._token._cancel();
    }

    setQuery(text) {
        this.cancel();
        const generation = this._generation;
        const token = makeToken();
        this._token = token;

        const r = this._scope
            ? { kind: 'scoped', provider: this._scope, query: text }
            : route(text, this._opts.providers, this._opts.prefixChar());
        if (r.kind === 'overview') {
            const results = providerOverview(this._opts.providers, r.query, this._opts.prefixChar())
                .map(x => ({ ...x, providerId: '__overview' }));
            this._opts.onResults(results, { generation, pending: 0, kind: 'overview' });
            return generation;
        }
        const targets = r.kind === 'prefixed' || r.kind === 'scoped' ? [r.provider] : r.providers;
        const typedQuery = r.query.trim().length > 0;
        const groups = [];
        let pending = 0;

        const emit = () => {
            this._opts.onResults(rank(groups, {
                usageCount: this._opts.usageCount,
                typedQuery,
                sortByUsage: this._opts.sortByUsage(),
            }), { generation, pending, kind: r.kind });
        };

        for (const provider of targets) {
            let out;
            try {
                out = provider.query(r.query, token);
            } catch (e) {
                this._opts.logError?.(`provider ${provider.id} failed (generation ${generation})`, e);
                continue;
            }
            if (out && typeof out.then === 'function') {
                pending++;
                out.then(results => {
                    if (generation !== this._generation)
                        return;  // stale: a newer query or a close happened
                    pending--;
                    groups.push({ provider, results: Array.isArray(results) ? results : [] });
                    emit();
                }, e => {
                    if (generation !== this._generation)
                        return;
                    pending--;
                    this._opts.logError?.(`provider ${provider.id} failed (generation ${generation})`, e);
                    emit();
                });
            } else {
                groups.push({ provider, results: Array.isArray(out) ? out : [] });
            }
        }
        emit();
        return generation;
    }
}
