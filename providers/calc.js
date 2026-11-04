// Calculator provider: "/calc <expr>", and in global search for input that looks like
// arithmetic (lib/calc.js). Enter copies the result.

import { evaluate, formatNumber, looksLikeMath } from '../lib/calc.js';
import { copyToClipboard } from '../shell/clipboard.js';

export const CALC_SCORE = 10000;  // always first, as in Noctalia

export class CalcProvider {
    constructor() {
        this.id = 'calc';
        this.trigger = 'calc';
        this.displayName = 'Calculator';
        this.icon = 'accessories-calculator-symbolic';
        this.global = true;
        this.trackUsage = false;
        this.acceptsGlobal = text => looksLikeMath(text);
    }

    query(text) {
        const r = evaluate(text);
        if (!r.ok)
            return [];
        const value = formatNumber(r.value);
        return [{ id: 'calc-result', title: `= ${value}`, subtitle: `${text.trim()}  ·  Enter copies`,
            iconName: this.icon, copyText: value, copies: true, score: CALC_SCORE }];
    }

    activate(result) {
        copyToClipboard(result.copyText);
    }
}
