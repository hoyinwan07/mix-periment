const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('./helpers/setup');

const palette = PM.palette.reset();
const lab = (hex) => PM.hexToLab(hex);

test('identical colors get a single "spot on" tip', () => {
  const tips = PM.coach.tips(lab('#7A8B5C'), lab('#7A8B5C'), palette);

  assert.equal(tips.length, 1);
  assert.match(tips[0], /Spot on/);
});

test('value is coached first: too dark / too light', () => {
  assert.match(PM.coach.tips(lab('#808080'), lab('#505050'), palette)[0], /Too dark/);
  assert.match(PM.coach.tips(lab('#505050'), lab('#808080'), palette)[0], /Too light/);
});

test('saturation and hue tips name a real tube from the palette', () => {
  const tooSaturated = PM.coach.tips(lab('#8A6A60'), lab('#C8302A'), palette).join(' ');
  assert.match(tooSaturated, /Too saturated/);
  const names = palette.map((t) => t.name);
  assert.ok(names.some((n) => tooSaturated.includes(n)));
});

test('neutrals finds the palette white and black', () => {
  const { white, black } = PM.coach.neutrals(palette);
  assert.equal(white.name, 'Soft Mixing White');
  assert.equal(black.name, 'Ivory Black');
  assert.deepEqual(PM.coach.neutrals([]), { white: null, black: null });
});
