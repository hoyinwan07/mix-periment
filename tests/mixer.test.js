const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('./helpers/setup');

const tube = (hex, strength = 1) => ({ hex, strength });
const ULTRAMARINE = tube('#23308A');
const CAD_YELLOW = tube('#F5B300');
const CAD_RED = tube('#C8302A');
const VIRIDIAN = tube('#14634F');
const WHITE = tube('#F3F0E8', 3);

test('every default tube is reconstructed as a spectrum that reproduces its hex', () => {
  for (const { hex } of PM.palette.DEFAULTS) {
    assert.ok(PM.uplift(hex).fitError < 0.05, hex);
  }
});

test('a single tube mixes to itself', () => {
  for (const { hex } of PM.palette.DEFAULTS) {
    assert.ok(PM.deltaE2000(PM.hexToLab(hex), PM.mixLab([{ tube: tube(hex), w: 1 }])).dE < 0.05);
  }
});

test('blue + yellow makes green, not gray (subtractive, unlike RGB averaging)', () => {
  const mix = PM.lch(
    PM.mixLab([
      { tube: ULTRAMARINE, w: 1 },
      { tube: CAD_YELLOW, w: 1 },
    ]),
  );
  assert.ok(mix.h > 120 && mix.h < 220, `hue ${mix.h.toFixed(0)}° should be green/teal`);
  assert.ok(mix.C > 8, 'should keep some chroma');
});

test('complements neutralize each other', () => {
  const mix = PM.lch(
    PM.mixLab([
      { tube: CAD_RED, w: 1 },
      { tube: VIRIDIAN, w: 1 },
    ]),
  );
  assert.ok(mix.C < PM.lch(PM.hexToLab(CAD_RED.hex)).C / 3);
});

test('adding white only ever lightens', () => {
  let previous = -Infinity;
  for (const share of [0, 0.25, 0.5, 0.75, 0.9]) {
    const L = PM.mixLab([
      { tube: ULTRAMARINE, w: 1 - share },
      { tube: WHITE, w: share },
    ])[0];
    assert.ok(L > previous);
    previous = L;
  }
});

test('mixLab returns a fresh array each call (no shared buffers leak out)', () => {
  const a = PM.mixLab([{ tube: CAD_RED, w: 1 }]);
  const b = PM.mixLab([{ tube: ULTRAMARINE, w: 1 }]);
  assert.notDeepEqual(a, b);
});
