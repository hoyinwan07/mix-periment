// Repeatable "random" test inputs: the same seed gives the same numbers on every run,
// so a failing case can always be reproduced.

/**
 * @param {number} seed any whole number above 0
 */
function seededRandom(seed) {
  let state = seed;

  /** A number from 0 up to (not including) 1. Park-Miller generator: simple and repeatable. */
  function fraction() {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  }

  /** A whole number from `min` to `max`, both included. */
  function wholeNumber(min, max) {
    return min + Math.floor(fraction() * (max - min + 1));
  }

  /** A paint amount from 0 up to 100. */
  function amount() {
    return fraction() * 100;
  }

  /** `count` paint amounts, one per tube in a mix. */
  function amounts(count) {
    return Array.from({ length: count }, amount);
  }

  return { wholeNumber, amount, amounts };
}

module.exports = { seededRandom };
