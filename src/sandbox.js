// Pure sandbox math (no DOM), so it can be unit-tested. The sandbox works in whole percents.
(function (root) {
  const PM = (root.PM = root.PM || {});

  /**
   * Scale `amounts` to whole numbers that add up to exactly `total` (largest-remainder rounding).
   * Any tube above 0 keeps at least 1, so a small but real amount never shows as 0%.
   * @param {number[]} amounts
   * @param {number} [total]
   * @returns {number[]}
   */
  function wholeShares(amounts, total = 100) {
    const sum = amounts.reduce((s, a) => s + a, 0);
    if (!sum || total <= 0) return amounts.map(() => 0);
    const exact = amounts.map((a) => (a / sum) * total);
    const shares = exact.map(Math.floor);
    if (amounts.filter((a) => a > 0).length <= total) {
      amounts.forEach((a, i) => {
        if (a > 0 && !shares[i]) shares[i] = 1;
      });
    }
    let diff = total - shares.reduce((s, v) => s + v, 0);
    const byRemainder = exact
      .map((v, i) => i)
      .sort((a, b) => exact[b] - shares[b] - (exact[a] - shares[a]));
    for (let k = 0; diff > 0; k = (k + 1) % byRemainder.length, diff--) shares[byRemainder[k]]++;
    for (; diff < 0; diff++) shares[shares.indexOf(Math.max(...shares))]--;
    return shares;
  }

  /**
   * Whole-percent shares after one tube is set to `value`: that tube keeps its value and the
   * others split the rest in their current proportions, so the shares always add up to 100.
   * If the others are all at 0, they split the rest evenly (so lowering one tube brings them back).
   * A lone tube is the whole mix: 100, or 0 if it was set to 0.
   * @param {number[]} amounts current shares
   * @param {number} index the tube being set
   * @param {number} [value] its new share; defaults to its current one
   * @returns {number[]}
   */
  function rebalance(amounts, index, value = amounts[index]) {
    const held = Math.round(Math.min(100, Math.max(0, value)));
    if (amounts.length === 1) return [held > 0 ? 100 : 0];
    const rest = amounts.reduce((sum, a, i) => (i === index ? sum : sum + a), 0);
    const weights = amounts.map((a, i) => (i === index ? 0 : rest > 0 ? a : 1));
    const shares = wholeShares(weights, 100 - held);
    shares[index] = held;
    return shares;
  }

  PM.sandbox = { wholeShares, rebalance };
})(typeof window !== 'undefined' ? window : globalThis);
