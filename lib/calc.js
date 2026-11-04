// Calculator (decision D4): a small recursive-descent parser over a fixed grammar. It never
// calls eval/Function and never looks anything up by name outside the tables below, so input
// cannot reach JavaScript objects ("constructor", "__proto__", ...) or run code.
//
// Grammar (lowest to highest precedence):
//   expr    := term (('+' | '-') term)*
//   term    := unary (('*' | '×' | '/' | '÷' | '%') unary)*        % is the remainder
//   unary   := ('+' | '-') unary | power
//   power   := postfix ('^' unary)?                                 right-associative; -2^2 = -4
//   postfix := primary '!'*                                         factorial of 0..170
//   primary := number | constant | function '(' expr (',' expr)* ')' | '(' expr ')'
// Numbers: 12, 1.5, .5, 1e3, 2.5E-4, and _ or thin-space digit grouping is not accepted.
// Trig functions use radians.

export const MAX_INPUT_LENGTH = 200;
const MAX_DEPTH = 64;

const CONSTANTS = new Map([
    ['pi', Math.PI], ['π', Math.PI], ['tau', 2 * Math.PI], ['τ', 2 * Math.PI], ['e', Math.E],
]);

const FUNCTIONS = new Map([
    ['sqrt', [1, 1, Math.sqrt]], ['cbrt', [1, 1, Math.cbrt]], ['abs', [1, 1, Math.abs]],
    ['round', [1, 1, Math.round]], ['floor', [1, 1, Math.floor]], ['ceil', [1, 1, Math.ceil]],
    ['sin', [1, 1, Math.sin]], ['cos', [1, 1, Math.cos]], ['tan', [1, 1, Math.tan]],
    ['asin', [1, 1, Math.asin]], ['acos', [1, 1, Math.acos]], ['atan', [1, 1, Math.atan]],
    ['ln', [1, 1, Math.log]], ['log', [1, 1, Math.log10]], ['log2', [1, 1, Math.log2]],
    ['exp', [1, 1, Math.exp]], ['pow', [2, 2, Math.pow]],
    ['min', [1, 32, Math.min]], ['max', [1, 32, Math.max]],
]);

class CalcError extends Error {}

function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
        const ch = input[i];
        if (/\s/.test(ch)) {
            i++;
            continue;
        }
        const num = /^(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/.exec(input.slice(i));
        if (num) {
            tokens.push({ type: 'num', value: Number(num[0]) });
            i += num[0].length;
            continue;
        }
        const ident = /^[a-zA-Zπτ][a-zA-Z0-9]*/.exec(input.slice(i));
        if (ident) {
            tokens.push({ type: 'ident', value: ident[0].toLowerCase() });
            i += ident[0].length;
            continue;
        }
        if ('+-*/%^!(),×÷'.includes(ch)) {
            tokens.push({ type: 'op', value: ch === '×' ? '*' : ch === '÷' ? '/' : ch });
            i++;
            continue;
        }
        throw new CalcError(`unexpected "${ch}"`);
    }
    return tokens;
}

function factorial(n) {
    if (!Number.isInteger(n) || n < 0 || n > 170)
        throw new CalcError('factorial needs a whole number from 0 to 170');
    let r = 1;
    for (let k = 2; k <= n; k++)
        r *= k;
    return r;
}

class Parser {
    constructor(tokens) {
        this.t = tokens;
        this.i = 0;
        this.depth = 0;
    }

    peek() {
        return this.t[this.i];
    }

    take(value) {
        const tok = this.t[this.i];
        if (tok && tok.type === 'op' && (value === undefined || tok.value === value)) {
            this.i++;
            return tok;
        }
        return null;
    }

    enter() {
        if (++this.depth > MAX_DEPTH)
            throw new CalcError('too deeply nested');
    }

    leave() {
        this.depth--;
    }

    expr() {
        this.enter();
        let v = this.term();
        for (;;) {
            if (this.take('+'))
                v += this.term();
            else if (this.take('-'))
                v -= this.term();
            else
                break;
        }
        this.leave();
        return v;
    }

    term() {
        let v = this.unary();
        for (;;) {
            if (this.take('*'))
                v *= this.unary();
            else if (this.take('/'))
                v /= this.unary();
            else if (this.take('%'))
                v %= this.unary();
            else
                break;
        }
        return v;
    }

    unary() {
        this.enter();
        let v;
        if (this.take('-'))
            v = -this.unary();
        else if (this.take('+'))
            v = this.unary();
        else
            v = this.power();
        this.leave();
        return v;
    }

    power() {
        const base = this.postfix();
        if (this.take('^'))
            return Math.pow(base, this.unary());
        return base;
    }

    postfix() {
        let v = this.primary();
        while (this.take('!'))
            v = factorial(v);
        return v;
    }

    primary() {
        const tok = this.peek();
        if (!tok)
            throw new CalcError('incomplete expression');
        if (tok.type === 'num') {
            this.i++;
            return tok.value;
        }
        if (tok.type === 'ident') {
            this.i++;
            if (CONSTANTS.has(tok.value) && !(this.peek()?.type === 'op' && this.peek().value === '('))
                return CONSTANTS.get(tok.value);
            const fn = FUNCTIONS.get(tok.value);
            if (!fn)
                throw new CalcError(`unknown name "${tok.value}"`);
            const [minArgs, maxArgs, impl] = fn;
            if (!this.take('('))
                throw new CalcError(`${tok.value} needs (…)`);
            const args = [this.expr()];
            while (this.take(','))
                args.push(this.expr());
            if (!this.take(')'))
                throw new CalcError('missing )');
            if (args.length < minArgs || args.length > maxArgs)
                throw new CalcError(`${tok.value} takes ${minArgs === maxArgs ? minArgs : `${minArgs}-${maxArgs}`} argument(s)`);
            return impl(...args);
        }
        if (this.take('(')) {
            const v = this.expr();
            if (!this.take(')'))
                throw new CalcError('missing )');
            return v;
        }
        throw new CalcError(`unexpected "${tok.value}"`);
    }
}

/**
 * Evaluate an expression.
 * @returns {{ok: true, value: number, operations: number} | {ok: false, error: string}}
 *   operations = number of operator, function and constant tokens (0 for a bare number).
 */
export function evaluate(input) {
    if (typeof input !== 'string' || !input.trim())
        return { ok: false, error: 'empty' };
    if (input.length > MAX_INPUT_LENGTH)
        return { ok: false, error: 'too long' };
    try {
        const tokens = tokenize(input);
        const p = new Parser(tokens);
        const value = p.expr();
        if (p.i !== tokens.length)
            throw new CalcError(`unexpected "${tokens[p.i].value}"`);
        if (!Number.isFinite(value))
            throw new CalcError('the result is not a finite number');
        const operations = tokens.filter(t => t.type !== 'num' && !(t.type === 'op' && '()'.includes(t.value))).length;
        return { ok: true, value, operations };
    } catch (e) {
        if (e instanceof CalcError)
            return { ok: false, error: e.message };
        throw e;
    }
}

/** Display form: up to 12 significant digits, no float noise (0.1+0.2 -> 0.3). */
export function formatNumber(value) {
    if (Object.is(value, -0))
        return '0';
    if (Number.isInteger(value) && Math.abs(value) < 1e15)
        return String(value);
    return String(Number.parseFloat(value.toPrecision(12)));
}

/** Global search shows the calculator only for input that looks like arithmetic. */
export function looksLikeMath(text) {
    return /\d/.test(text) && /[-+*/%^!()×÷]|\b(?:sqrt|cbrt|abs|round|floor|ceil|sin|cos|tan|asin|acos|atan|ln|log2?|exp|pow|min|max|pi|tau)\b/i.test(text);
}
