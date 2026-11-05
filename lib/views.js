// Views (tabs) and categories, after Noctalia's LauncherPanel::applyActiveCategory and its
// app-category table (src/launcher/app_provider.cpp kAppCategories @ 60861c9).

export const VIEWS = Object.freeze(['recent', 'pinned', 'all', 'categories']);
export const DEFAULT_VIEW = 'recent';

export const VIEW_LABELS = Object.freeze({
    recent: 'Recent', pinned: 'Pinned', all: 'All', categories: 'Categories',
});

// Noctalia's nine categories: stable id, label, symbolic icon, freedesktop Categories tokens.
export const CATEGORIES = Object.freeze([
    { id: 'internet', label: 'Internet', icon: 'network-workgroup-symbolic', tokens: ['Network'] },
    { id: 'multimedia', label: 'Multimedia', icon: 'applications-multimedia-symbolic', tokens: ['AudioVideo', 'Audio', 'Video'] },
    { id: 'development', label: 'Development', icon: 'applications-engineering-symbolic', tokens: ['Development'] },
    { id: 'games', label: 'Games', icon: 'applications-games-symbolic', tokens: ['Game'] },
    { id: 'graphics', label: 'Graphics', icon: 'applications-graphics-symbolic', tokens: ['Graphics'] },
    { id: 'office', label: 'Office', icon: 'x-office-document-symbolic', tokens: ['Office'] },
    { id: 'education', label: 'Education', icon: 'applications-science-symbolic', tokens: ['Education', 'Science'] },
    { id: 'system', label: 'System', icon: 'applications-system-symbolic', tokens: ['System'] },
    { id: 'utilities', label: 'Utilities', icon: 'applications-utilities-symbolic', tokens: ['Utility', 'Settings'] },
]);

const TOKEN_TO_CATEGORY = new Map(CATEGORIES.flatMap(c => c.tokens.map(t => [t, c.id])));

/**
 * The category of an app: the first of its desktop Categories tokens that maps to one of the
 * nine (tokens are case-sensitive, as in the freedesktop spec). Null when none map.
 * @param {string[]} tokens  e.g. "GNOME;GTK;Utility;" split on ';'
 */
export function categoryFor(tokens) {
    for (const t of tokens ?? []) {
        const id = TOKEN_TO_CATEGORY.get(t);
        if (id)
            return id;
    }
    return null;
}

/** Tab order with the default view first, the rest in their usual order (Noctalia). */
export function tabOrder(defaultView) {
    const first = VIEWS.includes(defaultView) ? defaultView : DEFAULT_VIEW;
    return [first, ...VIEWS.filter(v => v !== first)];
}

/** Categories that have at least one result, in table order. */
export function availableCategories(results) {
    const present = new Set(results.map(r => r.category).filter(Boolean));
    return CATEGORIES.filter(c => present.has(c.id));
}

function pinnedOrder(results, pinned) {
    const index = new Map(pinned.map((id, i) => [id, i]));
    return results
        .filter(r => r.pinned && index.has(r.id))
        .sort((a, b) => index.get(a.id) - index.get(b.id));
}

/**
 * Filter and order ranked results for the active view. With a typed query the results are
 * returned as ranked (typing switches to All, as in Noctalia).
 * @param {object[]} results  ranked; each may carry pinned, recentIndex, category, providerId, id
 * @param {{view: string, category?: string|null, query: string, pinned: string[]}} opts
 * @returns {object[]}  a new array
 */
export function applyView(results, { view, category = null, query, pinned }) {
    if (query.trim())
        return [...results];
    switch (view) {
    case 'pinned':
        return pinnedOrder(results, pinned);
    case 'recent':
        return results
            .filter(r => r.recentIndex > 0)
            .sort((a, b) => b.recentIndex - a.recentIndex ||
                String(a.providerId).localeCompare(String(b.providerId)) ||
                String(a.id).localeCompare(String(b.id)));
    case 'categories': {
        const active = category ?? availableCategories(results)[0]?.id ?? null;
        return active ? results.filter(r => r.category === active) : [];
    }
    case 'all':
    default: {
        const first = pinnedOrder(results, pinned);
        const firstIds = new Set(first.map(r => r.id));
        return [...first, ...results.filter(r => !firstIds.has(r.id))];
    }
    }
}

/**
 * Move a pinned id up (delta -1) or down (+1); returns a new list. Unchanged when the id is not pinned or
 * already at that end.
 */
export function movePin(pinned, id, delta) {
    const i = pinned.indexOf(id);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= pinned.length)
        return [...pinned];
    const out = [...pinned];
    [out[i], out[j]] = [out[j], out[i]];
    return out;
}

/** Add or remove an id from the pinned list; returns a new list. */
export function togglePin(pinned, id) {
    return pinned.includes(id) ? pinned.filter(p => p !== id) : [...pinned, id];
}
