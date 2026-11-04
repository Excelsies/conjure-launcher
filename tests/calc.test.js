// Calculator: arithmetic, precedence, errors, and input that must never reach JavaScript.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, formatNumber, looksLikeMath, MAX_INPUT_LENGTH } from '../lib/calc.js';

const val = s => {
    const r = evaluate(s);
    assert.ok(r.ok, `${s}: ${r.error}`);
    return r.value;
};
const fails = s => assert.equal(evaluate(s).ok, false, `${s} should fail`);

test('arithmetic and precedence', () => {
    assert.equal(val('2+2'), 4);
    assert.equal(val('2+3*4'), 14);
    assert.equal(val('(2+3)*4'), 20);
    assert.equal(val('10/4'), 2.5);
    assert.equal(val('10 % 4'), 2);
    assert.equal(val('7 × 6 ÷ 2'), 21);
    assert.equal(val('2^10'), 1024);
    assert.equal(val('2^3^2'), 512, 'power is right-associative');
    assert.equal(val('-2^2'), -4, 'unary minus binds looser than ^');
    assert.equal(val('2^-1'), 0.5);
    assert.equal(val('--3'), 3);
    assert.equal(val('5!'), 120);
    assert.equal(val('3!!'), 720);
    assert.equal(val('1e3 + .5'), 1000.5);
    assert.equal(val('2.5E-1'), 0.25);
});

test('functions and constants', () => {
    assert.equal(val('sqrt(16)'), 4);
    assert.equal(val('max(1, 9, 3)'), 9);
    assert.equal(val('pow(2, 8)'), 256);
    assert.equal(val('abs(-3) + floor(2.7) + ceil(0.1)'), 6);
    assert.equal(val('log(1000)'), 3);
    assert.equal(val('ln(e)'), 1);
    assert.ok(Math.abs(val('sin(pi/2)') - 1) < 1e-12);
    assert.equal(val('2*π'), 2 * Math.PI);
    assert.equal(val('SQRT(9)'), 3, 'names are case-insensitive');
});

test('errors are results, not exceptions', () => {
    for (const s of ['', '   ', '2+', '(1+2', '1+2)', '*3', '1 2', '1/0', '0/0', 'sqrt(-1)', '171!', '2.5!', '(-1)!',
        'sqrt', 'sqrt()', 'pow(1)', 'min()', 'foo(1)', 'x+1', '1,2', 'pi(2)', '1..2', '2**3'])
        fails(s);
});

test('input that could reach JavaScript objects or code is rejected', () => {
    for (const s of ['constructor', 'constructor(1)', '__proto__', 'toString(1)', 'valueOf()', 'hasOwnProperty(1)',
        'this', 'globalThis', 'process.exit(1)', 'eval(1)', 'Function("x")()', 'alert(1)', '1;2', '`1`', '"1"',
        'a=1', '[1]', '{}', '$1', '\\u0031', '1\n+1']) {
        const r = evaluate(s);
        if (s === '1\n+1')
            assert.equal(r.ok && r.value, 2, 'newlines are plain whitespace');
        else
            assert.equal(r.ok, false, `${JSON.stringify(s)} must be rejected`);
    }
});

test('depth and length limits', () => {
    assert.equal(evaluate('('.repeat(70) + '1' + ')'.repeat(70)).ok, false);
    assert.equal(val('('.repeat(30) + '1' + ')'.repeat(30)), 1);
    assert.equal(evaluate('-'.repeat(100) + '1').ok, false, 'a long unary chain hits the depth limit');
    assert.equal(evaluate('1+'.repeat(MAX_INPUT_LENGTH) + '1').ok, false);
});

test('operation count tells a bare number apart from an expression', () => {
    assert.equal(evaluate('42').operations, 0);
    assert.equal(evaluate('(42)').operations, 0);
    assert.ok(evaluate('4*2').operations > 0);
    assert.ok(evaluate('pi').operations > 0);
});

test('formatting hides float noise', () => {
    assert.equal(formatNumber(0.1 + 0.2), '0.3');
    assert.equal(formatNumber(1 / 3), '0.333333333333');
    assert.equal(formatNumber(-0), '0');
    assert.equal(formatNumber(1e21), '1e+21');
    assert.equal(formatNumber(123456789), '123456789');
    assert.equal(formatNumber(2.5), '2.5');
});

test('looksLikeMath gates global search', () => {
    for (const s of ['2+2', '12*3', 'sqrt(2)', '5!', '2 pi'])
        assert.ok(looksLikeMath(s), s);
    for (const s of ['firefox', 'gimp 2', '42', 'win10', 'plus', 'pi'])
        assert.ok(!looksLikeMath(s), s);
});

// Found by mutation probe M25: only the documented table is reachable. A lookup on Math (or any
// object) would make these work, and "constructor" would then fail only by luck.
test('only the documented functions and constants exist', () => {
    for (const s of ['random()', 'hypot(3, 4)', 'sign(-2)', 'trunc(1.5)', 'clz32(1)', 'fround(1)', 'imul(2, 3)',
        'LN2', 'SQRT2', 'E2', 'atan2(1, 1)', 'expm1(1)', 'log10(10)']) {
        const r = evaluate(s);
        assert.equal(r.ok, false, `${s} must not evaluate`);
        assert.match(r.error, /unknown name/, `${s}: ${r.error}`);
    }
});
