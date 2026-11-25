// Pure text formatting for the UI (no DOM), so it can be unit-tested.
(function (root) {
  const PM = (root.PM = root.PM || {});
  const C = PM.config;

  /**
   * Percent labels for one mix: one format for every tube, adding up to exactly 100%.
   * One decimal for all tubes if any tube is under 10% (small amounts matter most),
   * otherwise whole numbers. Uses largest-remainder rounding so labels never sum to 99.6 or 101.
   * @param {number[]} amounts
   * @returns {string[]}
   */
  function shareLabels(amounts) {
    const total = amounts.reduce((sum, a) => sum + a, 0);
    if (!total) {
      return amounts.map(() => '0%');
    }

    const decimals = amounts.some((a) => a > 0 && a / total < 0.1) ? 1 : 0;
    const unit = 10 ** decimals; // count in tenths of a percent when decimals = 1
    const exact = amounts.map((a) => (a / total) * 100 * unit);
    const rounded = exact.map(Math.floor);
    let remaining = 100 * unit - rounded.reduce((sum, v) => sum + v, 0);

    exact
      .map((v, i) => ({ remainder: v - Math.floor(v), i }))
      .sort((a, b) => b.remainder - a.remainder)
      .forEach(({ i }) => {
        if (remaining > 0) {
          rounded[i]++;
          remaining--;
        }
      });
    return rounded.map((v) => (v / unit).toFixed(decimals) + '%');
  }

  /** Munsell-style value label, e.g. "value 5.5/10". */
  const valueLabel = (lab) => `value ${PM.value10(lab).toFixed(1)}/10`;

  /** Plain-language meaning of a ΔE2000 difference. */
  function deltaELabel(dE) {
    if (dE < C.DE_IMPERCEPTIBLE) return 'imperceptible difference';
    if (dE < C.DE_NOTICEABLE) return 'barely noticeable';
    if (dE < C.DE_OUT_OF_GAMUT) return 'close, tweak by eye';
    return 'out of reach with these tubes';
  }

  PM.format = { shareLabels, valueLabel, deltaELabel };
})(typeof window !== 'undefined' ? window : globalThis);
