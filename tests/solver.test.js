const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('./setup');

const palette = PM.palette.reset();
const byName = (name) => palette.find((t) => t.name === name);

test('recovers a known mix (round trip)', () => {
  const cases = [
    [
      ['Soft Mixing White', 0.6],
      ['Cadmium Yellow Medium', 0.4],
    ],
    [
      ['Soft Mixing White', 0.7],
      ['French Ultramarine', 0.2],
      ['Burnt Umber', 0.1],
    ],
    [
      ['Cadmium Red', 0.5],
      ['Alizarin Crimson', 0.5],
    ],
  ];
  for (const mix of cases) {
    const hex = PM.mixHex(mix.map(([name, w]) => ({ tube: byName(name), w })));
    const recipe = PM.solver.solve(hex, palette);
    assert.ok(recipe.dE < 0.5, `${hex}: dE ${recipe.dE}`);
    assert.deepEqual(recipe.items.map((i) => i.tube.name).sort(), mix.map(([name]) => name).sort());
  }
});

test('recipe shape: sorted largest first, whole parts, fractions sum to 1', () => {
  const recipe = PM.solver.solve('#E8C4A0', palette);
  const fracs = recipe.items.map((i) => i.frac);
  assert.deepEqual(
    fracs,
    [...fracs].sort((a, b) => b - a),
  );
  assert.ok(Math.abs(fracs.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  for (const item of recipe.items) {
    assert.ok(Number.isInteger(item.parts) && item.parts >= 0);
    assert.equal(item.parts === 0, item.frac < PM.config.TOUCH_FRACTION);
  }
});

test('respects the max-tubes setting', () => {
  for (const max of [1, 2, 3]) {
    assert.ok(PM.solver.solve('#6F7E8B', palette, max).items.length <= max);
  }
});

test('out-of-gamut targets are flagged and keep their hue', () => {
  const recipe = PM.solver.solve('#FF00FF', palette);
  assert.equal(recipe.outOfGamut, true);
  assert.ok(recipe.chromaReach > 0 && recipe.chromaReach < 1);
  const hueGap = Math.abs(PM.lch(recipe.mixLab).h - PM.lch(recipe.targetLab).h);
  assert.ok(Math.min(hueGap, 360 - hueGap) < 30, 'should stay near magenta, not drift to gray');
});

test('handles tiny and empty palettes', () => {
  assert.equal(PM.solver.solve('#123456', []), null);
  const single = PM.solver.solve('#123456', [palette[0]]);
  assert.equal(single.items.length, 1);
  assert.equal(single.items[0].parts, 1);
});

test('overshootDE flags strong tubes more than weak ones', () => {
  const mix = [
    { tube: byName('Soft Mixing White'), w: 0.9 },
    { tube: byName('Ivory Black'), w: 0.1 },
  ];
  assert.ok(PM.solver.overshootDE(mix, 1) > PM.solver.overshootDE(mix, 0));
});
