// Color-theory guidance, as pure functions of Lab colors and the palette (no DOM).
// Tips follow the order painters correct a mix in: value first, then chroma, then hue.
(function (root) {
  const PM = (root.PM = root.PM || {});
  const C = PM.config;

  /** @typedef {{ id: string, name: string, hex: string, strength: number }} Tube */

  const hueDistance = (a, b) => {
    const d = Math.abs(a - b) % 360;
    return Math.min(d, 360 - d);
  };

  /**
   * The colored tube whose hue is closest to `hue`, or null if none is close enough.
   * @param {Tube[]} palette
   * @param {number} hue CIELAB hue angle in degrees
   * @returns {Tube | null}
   */
  function tubeNearHue(palette, hue) {
    let best = null;
    let bestDistance = Infinity;
    for (const tube of palette) {
      const { C: chroma, h } = PM.lch(PM.hexToLab(tube.hex));
      if (chroma <= C.CHROMATIC_MIN_C) continue;
      const d = hueDistance(h, hue);
      if (d < bestDistance) {
        bestDistance = d;
        best = tube;
      }
    }
    return bestDistance <= C.HUE_MATCH_MAX_DEG ? best : null;
  }

  /**
   * The palette's white and black, if it has them (lightest / darkest low-chroma tube).
   * @param {Tube[]} palette
   * @returns {{ white: Tube | null, black: Tube | null }}
   */
  function neutrals(palette) {
    const grays = palette
      .map((tube) => ({ tube, lab: PM.hexToLab(tube.hex) }))
      .filter(({ lab }) => PM.lch(lab).C < C.NEUTRAL_MAX_C)
      .sort((a, b) => a.lab[0] - b.lab[0]);
    if (!grays.length) return { white: null, black: null };
    const darkest = grays[0];
    const lightest = grays[grays.length - 1];
    return {
      black: darkest.lab[0] < C.BLACK_MAX_L ? darkest.tube : null,
      white: lightest.lab[0] > C.WHITE_MIN_L ? lightest.tube : null,
    };
  }

  /**
   * Correction tips for getting from `mixLab` to `targetLab`.
   * @param {number[]} targetLab
   * @param {number[]} mixLab
   * @param {Tube[]} palette
   * @param {{ maxedOut?: boolean }} [options] maxedOut: the solver already hit the gamut limit
   * @returns {string[]}
   */
  function tips(targetLab, mixLab, palette, { maxedOut = false } = {}) {
    const d = PM.deltaE2000(targetLab, mixLab);
    if (d.dE < C.DE_IMPERCEPTIBLE) {
      return ['Spot on. The difference is below what most people can see.'];
    }
    const target = PM.lch(targetLab);
    const mix = PM.lch(mixLab);
    const values = `(${PM.format.valueLabel(mixLab)} vs ${PM.format.valueLabel(targetLab)})`;
    const out = [];

    if (d.dL <= -C.COACH_TERM_DE) {
      out.push(`Too dark ${values}. Add a little white or a lighter tube.`);
    } else if (d.dL >= C.COACH_TERM_DE) {
      out.push(`Too light ${values}. Add a little of a darker tube, or use less white.`);
    }

    if (d.dC >= C.COACH_TERM_DE) {
      const complement = tubeNearHue(palette, mix.h + 180);
      const what = complement ? `${complement.name} (its complement)` : 'its complement';
      out.push(`Too saturated. Dull it with a touch of ${what}, or a gray of the same value.`);
    } else if (d.dC <= -C.COACH_TERM_DE) {
      out.push(
        maxedOut
          ? 'Too dull, but this is as saturated as your current tubes get at this hue and value.'
          : 'Too dull. Use less of whatever is neutralizing it (black, umber or a complement). ' +
              'If there is none, your tubes may not reach this saturation.',
      );
    }

    const hasHue = target.C > C.HUE_MIN_C && mix.C > C.HUE_MIN_C / 2;
    if (hasHue && Math.abs(d.dH) >= C.COACH_TERM_DE) {
      const direction = Math.sign(d.dh); // + = mix sits counter-clockwise of the target hue
      const fix = tubeNearHue(palette, target.h - direction * 60);
      const leans = PM.hueName(target.h + direction * 40);
      const toward = PM.hueName(target.h - direction * 40);
      out.push(
        `Hue leans ${leans}. Nudge it toward ${toward}${fix ? ` with a touch of ${fix.name}` : ''}.`,
      );
    }

    if (!out.length) out.push('Close. Fine-tune by eye under your studio light.');
    return out;
  }

  PM.coach = { tips, tubeNearHue, neutrals };
})(typeof window !== 'undefined' ? window : globalThis);
