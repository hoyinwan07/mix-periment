const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('./setup');

// Reference pairs from Sharma, Wu & Dalal (2005), "The CIEDE2000 Color-Difference Formula:
// Implementation Notes, Supplementary Test Data, and Mathematical Observations".
const SHARMA_PAIRS = [
  [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
  [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
  [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
  [[50, 0, 0], [50, -1, 2], 2.3669],
  [[50, 2.5, 0], [73, 25, -18], 27.1492],
  [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
];

test('deltaE2000 matches the Sharma 2005 reference data', () => {
  for (const [lab1, lab2, expected] of SHARMA_PAIRS) {
    assert.equal(PM.deltaE2000(lab1, lab2).dE.toFixed(4), expected.toFixed(4));
  }
});

test('deltaE2000 is symmetric and 0 for identical colors', () => {
  const a = [62, 10, -30];
  const b = [55, -4, 12];

  assert.equal(PM.deltaE2000(a, a).dE, 0);
  assert.ok(Math.abs(PM.deltaE2000(a, b).dE - PM.deltaE2000(b, a).dE) < 1e-9);
});

test('parseHex normalizes valid input and rejects invalid input', () => {
  assert.equal(PM.parseHex('#abc'), '#AABBCC');
  assert.equal(PM.parseHex('7a8b5c'), '#7A8B5C');
  assert.equal(PM.parseHex('  #7A8B5C '), '#7A8B5C');

  for (const bad of ['', '#12345', '#GGGGGG', 'red', null, undefined, 42]) {
    assert.equal(PM.parseHex(bad), null, String(bad));
  }
});

test('hex -> Lab -> hex round-trips', () => {
  for (const hex of ['#000000', '#FFFFFF', '#7A8B5C', '#23308A', '#F5B300']) {
    assert.equal(PM.labToHex(PM.hexToLab(hex)), hex);
  }
});

test('grayOf keeps lightness and removes chroma', () => {
  const gray = PM.hexToLab(PM.grayOf('#C8302A'));

  assert.ok(Math.abs(gray[0] - PM.hexToLab('#C8302A')[0]) < 0.5);
  assert.ok(PM.lch(gray).C < 1);
});
