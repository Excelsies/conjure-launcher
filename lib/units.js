// Unit conversion for the calculator: "10 km to mi", "72 f in c", "2*1.5 gb to mib". Offline only (no currency).
// Form: <amount> <unit> (to | in | as | -> | =>) <unit>; the amount is any calculator expression and may be
// left out ("km to mi" converts 1). Pure; the calculator's own parser evaluates the amount.

import { evaluate } from './calc.js';

// [dimension, factor to the dimension's base unit, display symbol, ...aliases]. Temperatures are affine and
// handled separately. "m" is meters (minutes are "min"), "c" Celsius (cups are "cup"), "t" metric tons.
const TABLE = [
    ['length', 0.001, 'mm', 'millimeter', 'millimeters', 'millimetre', 'millimetres'],
    ['length', 0.01, 'cm', 'centimeter', 'centimeters', 'centimetre', 'centimetres'],
    ['length', 1, 'm', 'meter', 'meters', 'metre', 'metres'],
    ['length', 1000, 'km', 'kilometer', 'kilometers', 'kilometre', 'kilometres'],
    ['length', 0.0254, 'in', 'inch', 'inches', '"'],
    ['length', 0.3048, 'ft', 'foot', 'feet', "'"],
    ['length', 0.9144, 'yd', 'yard', 'yards'],
    ['length', 1609.344, 'mi', 'mile', 'miles'],
    ['length', 1852, 'nmi', 'nautical-mile', 'nautical-miles'],
    ['mass', 1e-6, 'mg', 'milligram', 'milligrams'],
    ['mass', 0.001, 'g', 'gram', 'grams'],
    ['mass', 1, 'kg', 'kilogram', 'kilograms', 'kilo', 'kilos'],
    ['mass', 1000, 't', 'tonne', 'tonnes', 'metric-ton', 'metric-tons'],
    ['mass', 0.028349523125, 'oz', 'ounce', 'ounces'],
    ['mass', 0.45359237, 'lb', 'lbs', 'pound', 'pounds'],
    ['mass', 6.35029318, 'st', 'stone', 'stones'],
    ['volume', 0.001, 'ml', 'milliliter', 'milliliters', 'millilitre', 'millilitres'],
    ['volume', 1, 'l', 'liter', 'liters', 'litre', 'litres'],
    ['volume', 1000, 'm3', 'm³', 'cubic-meter', 'cubic-meters'],
    ['volume', 0.00492892159375, 'tsp', 'teaspoon', 'teaspoons'],
    ['volume', 0.01478676478125, 'tbsp', 'tablespoon', 'tablespoons'],
    ['volume', 0.0295735295625, 'floz', 'fl-oz', 'fluid-ounce', 'fluid-ounces'],
    ['volume', 0.2365882365, 'cup', 'cups'],
    ['volume', 0.473176473, 'pt', 'pint', 'pints'],
    ['volume', 0.946352946, 'qt', 'quart', 'quarts'],
    ['volume', 3.785411784, 'gal', 'gallon', 'gallons'],
    ['area', 1, 'm2', 'm²', 'sq-m', 'square-meter', 'square-meters'],
    ['area', 1e6, 'km2', 'km²', 'sq-km', 'square-kilometer', 'square-kilometers'],
    ['area', 0.09290304, 'ft2', 'ft²', 'sq-ft', 'square-foot', 'square-feet'],
    ['area', 1e4, 'ha', 'hectare', 'hectares'],
    ['area', 4046.8564224, 'acre', 'acres'],
    ['area', 2589988.110336, 'mi2', 'mi²', 'sq-mi', 'square-mile', 'square-miles'],
    ['time', 0.001, 'ms', 'millisecond', 'milliseconds'],
    ['time', 1, 's', 'sec', 'secs', 'second', 'seconds'],
    ['time', 60, 'min', 'mins', 'minute', 'minutes'],
    ['time', 3600, 'h', 'hr', 'hrs', 'hour', 'hours'],
    ['time', 86400, 'd', 'day', 'days'],
    ['time', 604800, 'wk', 'week', 'weeks'],
    ['time', 31557600, 'yr', 'year', 'years'],
    ['speed', 1, 'm/s', 'mps'],
    ['speed', 1 / 3.6, 'km/h', 'kmh', 'kph'],
    ['speed', 0.44704, 'mph'],
    ['speed', 1852 / 3600, 'kn', 'knot', 'knots'],
    ['speed', 0.3048, 'ft/s', 'fps'],
    ['data', 0.125, 'bit', 'bits'],
    ['data', 1, 'B', 'b', 'byte', 'bytes'],
    ['data', 1e3, 'KB', 'kb', 'kilobyte', 'kilobytes'],
    ['data', 1e6, 'MB', 'mb', 'megabyte', 'megabytes'],
    ['data', 1e9, 'GB', 'gb', 'gigabyte', 'gigabytes'],
    ['data', 1e12, 'TB', 'tb', 'terabyte', 'terabytes'],
    ['data', 1024, 'KiB', 'kib', 'kibibyte', 'kibibytes'],
    ['data', 1024 ** 2, 'MiB', 'mib', 'mebibyte', 'mebibytes'],
    ['data', 1024 ** 3, 'GiB', 'gib', 'gibibyte', 'gibibytes'],
    ['data', 1024 ** 4, 'TiB', 'tib', 'tebibyte', 'tebibytes'],
];

const TEMPERATURE = new Map([
    ['c', 'C'], ['°c', 'C'], ['celsius', 'C'], ['f', 'F'], ['°f', 'F'], ['fahrenheit', 'F'], ['k', 'K'], ['kelvin', 'K'],
]);
const TO_KELVIN = { C: v => v + 273.15, F: v => (v - 32) * 5 / 9 + 273.15, K: v => v };
const FROM_KELVIN = { C: v => v - 273.15, F: v => (v - 273.15) * 9 / 5 + 32, K: v => v };
const TEMP_SYMBOL = { C: '°C', F: '°F', K: 'K' };

const UNITS = new Map();
for (const [dimension, factor, symbol, ...aliases] of TABLE) {
    for (const name of [symbol, ...aliases])
        UNITS.set(name.toLowerCase(), { dimension, factor, symbol });
}

/** @returns {{kind: 'linear', dimension: string, factor: number, symbol: string} | {kind: 'temp', scale: string} | null} */
export function lookupUnit(word) {
    const w = word.toLowerCase();
    if (TEMPERATURE.has(w))
        return { kind: 'temp', scale: TEMPERATURE.get(w) };
    const u = UNITS.get(w);
    return u ? { kind: 'linear', ...u } : null;
}

const SEPARATORS = new Set(['to', 'in', 'as', '->', '=>']);
// The unit written right after the amount, possibly with no space ("10km", "5'", "72°f").
const TRAILING_UNIT = /([a-zA-Zµ°²³"'/][a-zA-Z0-9µ°²³"'/-]*)\s*$/;

/**
 * @param {string} text
 * @returns {{ok: true, value: number, symbol: string, amount: number, from: string} | {ok: false, error: string} | null}
 *   null when the text is not a conversion at all (so the calculator tries plain arithmetic).
 */
export function convert(text) {
    if (typeof text !== 'string')
        return null;
    const words = text.trim().split(/\s+/);
    if (words.length < 3 || !SEPARATORS.has(words.at(-2).toLowerCase()))
        return null;
    const to = lookupUnit(words.at(-1));
    const head = words.slice(0, -2).join(' ');
    const m = TRAILING_UNIT.exec(head);
    const from = m && lookupUnit(m[1]);
    if (!to || !from)
        return null;
    const amountText = head.slice(0, m.index).trim();
    let amount = 1;
    if (amountText) {
        const r = evaluate(amountText);
        if (!r.ok)
            return null;
        amount = r.value;
    }
    if (from.kind === 'temp' || to.kind === 'temp') {
        if (from.kind !== to.kind)
            return { ok: false, error: 'those units measure different things' };
        return { ok: true, value: FROM_KELVIN[to.scale](TO_KELVIN[from.scale](amount)), symbol: TEMP_SYMBOL[to.scale], amount, from: TEMP_SYMBOL[from.scale] };
    }
    if (from.dimension !== to.dimension)
        return { ok: false, error: 'those units measure different things' };
    return { ok: true, value: amount * from.factor / to.factor, symbol: to.symbol, amount, from: from.symbol };
}

/** Display form for conversions: 6 significant digits, no float noise. */
export function formatConverted(value) {
    if (Object.is(value, -0) || Math.abs(value) < 1e-12)
        return '0';
    return String(Number.parseFloat(value.toPrecision(6)));
}
