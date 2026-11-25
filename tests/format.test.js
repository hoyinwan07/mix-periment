const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('./setup');

const sum = (labels) => labels.reduce((total, l) => total + parseFloat(l), 0);

test('share labels always add up to exactly 100%', () => {
  let seed = 42;
  const random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let run = 0; run < 500; run++) {
    const amounts = Array.from({ length: 1 + Math.floor(random() * 4) }, () => random() * 100);
    assert.equal(sum(PM.format.shareLabels(amounts)).toFixed(1), '100.0', amounts.join(','));
  }
});

test('share labels use one format per mix', () => {
  assert.deepEqual(PM.format.shareLabels([55, 3.9]), ['93.4%', '6.6%']);
  assert.deepEqual(PM.format.shareLabels([43.5, 43.5, 13]), ['44%', '43%', '13%']);
  assert.deepEqual(PM.format.shareLabels([0, 0]), ['0%', '0%']);
});

test('deltaELabel maps differences to plain language', () => {
  assert.equal(PM.format.deltaELabel(0.5), 'imperceptible difference');
  assert.equal(PM.format.deltaELabel(2), 'barely noticeable');
  assert.equal(PM.format.deltaELabel(4), 'close, tweak by eye');
  assert.equal(PM.format.deltaELabel(9), 'out of reach with these tubes');
});
