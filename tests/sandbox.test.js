const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('./setup');
const { seededRandom } = require('./random');

const { rebalance, wholeShares } = PM.sandbox;
const sum = (values) => values.reduce((total, v) => total + v, 0);
const random = seededRandom(7);

test('whole shares are whole numbers adding up to exactly 100', () => {
  assert.deepEqual(wholeShares([43.5, 43.5, 13]), [44, 43, 13]);
  assert.deepEqual(wholeShares([1, 1, 1]), [34, 33, 33]);

  for (let run = 0; run < 200; run++) {
    const tubeCount = random.wholeNumber(1, 5);
    const amounts = random.amounts(tubeCount);
    const shares = wholeShares(amounts);

    assert.equal(sum(shares), 100, amounts.join(','));
    assert.ok(shares.every(Number.isInteger), amounts.join(','));
  }
});

test('whole shares keep a small but real amount at 1% or more', () => {
  assert.deepEqual(wholeShares([99.6, 0.4]), [99, 1]);
  assert.deepEqual(wholeShares([0, 0]), [0, 0]);
});

test('rebalance keeps the set tube and scales the others to fill the rest', () => {
  assert.deepEqual(rebalance([60, 30, 10], 0, 80), [80, 15, 5]);
  assert.deepEqual(rebalance([60, 30, 10], 2, 40), [40, 20, 40]);
  assert.deepEqual(rebalance([44, 43, 13], 0, 80), [80, 15, 5]);
});

test('rebalance always gives whole numbers adding up to 100', () => {
  for (let run = 0; run < 200; run++) {
    const tubeCount = random.wholeNumber(2, 5);
    const amounts = random.amounts(tubeCount);
    const draggedTube = random.wholeNumber(0, tubeCount - 1);
    const shares = rebalance(amounts, draggedTube, random.amount());

    assert.equal(sum(shares), 100, amounts.join(','));
    assert.ok(shares.every(Number.isInteger), amounts.join(','));
  }
});

test('rebalance brings zeroed tubes back evenly', () => {
  assert.deepEqual(rebalance([100, 0, 0], 0, 70), [70, 15, 15]);
});

test('rebalance clamps the value and treats a lone tube as the whole mix', () => {
  assert.deepEqual(rebalance([50, 50], 0, 120), [100, 0]);
  assert.deepEqual(rebalance([40], 0), [100]);
  assert.deepEqual(rebalance([40], 0, 0), [0]);
});
