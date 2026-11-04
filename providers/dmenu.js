// The ephemeral provider behind dmenu mode: the candidates a Dmenu call sent, fuzzy-filtered.
// With no match, the typed text itself is offered (Enter returns it), as in Noctalia.

import { parseCandidates } from '../lib/commands.js';
import { score as fuzzy, isMatch } from '../lib/fzy.js';

export const DMENU_MAX_RESULTS = 500;

export class DmenuProvider {
    constructor(lines) {
        this.id = 'dmenu';
        this.trackUsage = false;
        // Same line format as command entries: "title<TAB>subtitle", raw line returned.
        this._candidates = parseCandidates(lines.join('\n'), Infinity);
    }

    query(text) {
        const q = text.trim().toLowerCase();
        const out = [];
        this._candidates.forEach((c, i) => {
            const s = q ? fuzzy(q, c.title.toLowerCase()) : -i;
            if (!q || isMatch(s))
                out.push({ id: `${i}`, title: c.title, subtitle: c.subtitle, raw: c.raw, score: s });
        });
        out.sort((a, b) => b.score - a.score);
        if (!out.length && text.trim())
            return [{ id: 'typed', title: text.trim(), subtitle: 'Use typed text', raw: text.trim(), score: 0 }];
        return out.slice(0, DMENU_MAX_RESULTS);
    }
}
