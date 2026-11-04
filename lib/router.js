// Query routing, after Noctalia's LauncherPanel::onInputChanged (@ 60861c9).
//
// A provider with a trigger word (e.g. "calc") owns every query that starts with
// provider-prefix + trigger ("/calc"). The longest matching prefix wins, and one leading space
// after it is dropped. A bare provider-prefix lists the providers. Anything else is a global
// search across providers without a trigger plus the opted-in global providers.

export const GLOBAL_OPT_IN_MIN_CHARS = 2;

/**
 * @typedef {object} RoutableProvider
 * @property {string} id
 * @property {string} [trigger]       Word after the provider prefix; empty or absent = no prefix.
 * @property {boolean} [global]       With a trigger, also join global search.
 * @property {(text: string) => boolean} [acceptsGlobal]  Extra per-query filter for global.
 */

export function fullPrefix(provider, prefixChar) {
    return provider.trigger ? `${prefixChar}${provider.trigger}` : '';
}

/**
 * @param {string} text            Raw input text.
 * @param {RoutableProvider[]} providers
 * @param {string} prefixChar      The provider-prefix setting (default "/"). Empty disables
 *                                 the overview and all triggers.
 * @returns {{kind: 'prefixed', provider: RoutableProvider, query: string}
 *         | {kind: 'overview', query: string}
 *         | {kind: 'global', providers: RoutableProvider[], query: string}}
 */
export function route(text, providers, prefixChar) {
    if (prefixChar) {
        let best = null;
        let bestLen = 0;
        for (const p of providers) {
            const prefix = fullPrefix(p, prefixChar);
            if (prefix && text.startsWith(prefix) && prefix.length > bestLen) {
                best = p;
                bestLen = prefix.length;
            }
        }
        if (best) {
            let query = text.slice(bestLen);
            if (query.startsWith(' '))
                query = query.slice(1);
            return { kind: 'prefixed', provider: best, query };
        }
        if (text.startsWith(prefixChar))
            return { kind: 'overview', query: text.slice(prefixChar.length).trimStart() };
    }

    const trimmedLen = text.trim().length;
    // Providers without a trigger always search. Triggered providers join only when opted in,
    // whether or not prefixes are enabled (an empty prefixChar only removes scoping).
    const selected = providers.filter(p => {
        if (!p.trigger)
            return true;
        if (!p.global || trimmedLen < GLOBAL_OPT_IN_MIN_CHARS)
            return false;
        return p.acceptsGlobal ? p.acceptsGlobal(text) : true;
    });
    return { kind: 'global', providers: selected, query: text };
}
