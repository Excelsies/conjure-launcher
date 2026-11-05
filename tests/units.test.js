// Unit conversion (lib/units.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { convert, formatConverted, lookupUnit } from '../lib/units.js';

const conv = text => {
    const r = convert(text);
    return r?.ok ? `${formatConverted(r.value)} ${r.symbol}` : r;
};

test('lengths, masses, volumes, areas, times, speeds and data sizes convert', () => {
    assert.equal(conv('10 km to mi'), '6.21371 mi');
    assert.equal(conv('6 ft in cm'), '182.88 cm');
    assert.equal(conv('5 in to cm'), '12.7 cm');
    assert.equal(conv('1 lb to g'), '453.592 g');
    assert.equal(conv('1 gal to l'), '3.78541 l');
    assert.equal(conv('1 acre to m2'), '4046.86 m2');
    assert.equal(conv('90 min to h'), '1.5 h');
    assert.equal(conv('100 km/h to mph'), '62.1371 mph');
    assert.equal(conv('1 GiB to MB'), '1073.74 MB');
    assert.equal(conv('8 bits to bytes'), '1 B');
});

test('temperatures convert (affine, not a factor)', () => {
    assert.equal(conv('72 f to c'), '22.2222 °C');
    assert.equal(conv('100 c in f'), '212 °F');
    assert.equal(conv('0 k to c'), '-273.15 °C');
    assert.equal(conv('-40 °f to °c'), '-40 °C');
});

test('the amount is any calculator expression, may sit against the unit, and defaults to 1', () => {
    assert.equal(conv('2*5 km to mi'), '6.21371 mi');
    assert.equal(conv('10km to mi'), '6.21371 mi');
    assert.equal(conv('km to mi'), '0.621371 mi');
    assert.equal(conv('1/2 cup to ml'), '118.294 ml');
});

test('American and British spellings both work as input; output uses symbols', () => {
    assert.equal(conv('3 meters to feet'), '9.84252 ft');
    assert.equal(conv('3 metres to feet'), '9.84252 ft');
    assert.equal(conv('2 liters to quarts'), '2.11338 qt');
});

test('units that measure different things give an error, not a number', () => {
    assert.deepEqual(convert('10 kg to km'), { ok: false, error: 'those units measure different things' });
    assert.deepEqual(convert('10 c to km'), { ok: false, error: 'those units measure different things' });
});

test('anything else is not a conversion, so plain arithmetic still works', () => {
    for (const text of ['12*3', 'sqrt(2)', '10 km', 'to be or not', '10 parsecs to km', '5 apples to oranges', 'x km to mi'])
        assert.equal(convert(text), null, text);
    assert.equal(lookupUnit('m').symbol, 'm');
    assert.equal(lookupUnit('min').symbol, 'min');
    assert.equal(lookupUnit('c').kind, 'temp');
    assert.equal(lookupUnit('cup').symbol, 'cup');
});
