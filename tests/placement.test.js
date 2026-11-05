// Panel placement (bottom centre by default).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { panelRect, EDGE_GAP } from '../lib/placement.js';

const monitor = { x: 0, y: 0, width: 1600, height: 1000 };
// A 32px top bar and a 64px bottom dock.
const workArea = { x: 0, y: 32, width: 1600, height: 904 };

test('default is bottom centre, above a bottom dock', () => {
    const r = panelRect({ monitor, workArea, width: 760, height: 620 });
    assert.equal(r.position, 'bottom');
    assert.equal(r.x, (1600 - 760) / 2);
    assert.equal(r.y + r.height, workArea.y + workArea.height - EDGE_GAP);
    assert.equal(r.width, 760);
    assert.equal(r.height, 620);
});

test('centred on the monitor even when a side dock narrows the work area', () => {
    const r = panelRect({ monitor, workArea: { x: 72, y: 32, width: 1528, height: 968 }, width: 760, height: 620 });
    assert.equal(r.x + r.width / 2, 800);
});

test('a second monitor uses its own coordinates', () => {
    const m2 = { x: 1600, y: 0, width: 1920, height: 1080 };
    const r = panelRect({ monitor: m2, workArea: m2, width: 760, height: 620 });
    assert.equal(r.x, 1600 + (1920 - 760) / 2);
    assert.equal(r.y, 1080 - EDGE_GAP - 620);
});

test('top and center positions; unknown values fall back to bottom', () => {
    assert.equal(panelRect({ monitor, workArea, width: 760, height: 620, position: 'top' }).y, 32 + EDGE_GAP);
    const c = panelRect({ monitor, workArea, width: 760, height: 620, position: 'center' });
    assert.equal(c.y, Math.round(32 + (904 - 620) / 2));
    assert.equal(panelRect({ monitor, workArea, width: 760, height: 620, position: 'nope' }).position, 'bottom');
});

test('clamped to fit a small work area, never off-screen', () => {
    const small = { x: 0, y: 0, width: 640, height: 480 };
    const r = panelRect({ monitor: small, workArea: small, width: 760, height: 620 });
    assert.equal(r.width, 640 - 2 * EDGE_GAP);
    assert.equal(r.height, 480 - 2 * EDGE_GAP);
    assert.ok(r.x >= EDGE_GAP && r.y >= EDGE_GAP);
    assert.ok(r.x + r.width <= 640 - EDGE_GAP && r.y + r.height <= 480 - EDGE_GAP);
});

test('a missing or empty work area falls back to the monitor', () => {
    const r = panelRect({ monitor, workArea: { x: 0, y: 0, width: 0, height: 0 }, width: 760, height: 620 });
    assert.equal(r.y + r.height, 1000 - EDGE_GAP);
});
