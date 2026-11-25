// Recipe search.
//
// 1. Candidates: every 1-, 2- and 3-tube combination × a 5% ratio grid, mixed once and cached
//    per palette. (Mixing is the expensive part; the cache makes re-solving while the user drags
//    the color picker a cheap scan.)
// 2. Score every candidate against the target with CIEDE2000, keep the best ratio per combination.
// 3. Fine-tune the best few combinations by moving paint between tubes in shrinking steps.
// 4. Prefer fewer tubes when the difference is negligible; round to whole "parts" for the painter.
// 5. Out-of-gamut targets keep their hue and value and get the highest reachable chroma instead.
(function (root) {
  const PM = (root.PM = root.PM || {});
  const C = PM.config;

  /** @typedef {{ id: string, name: string, hex: string, strength: number }} Tube */
  /** @typedef {{ tube: Tube, frac: number, parts: number }} RecipeItem */
  /**
   * @typedef {object} Recipe
   * @property {string} targetHex
   * @property {number[]} targetLab
   * @property {RecipeItem[]} items sorted largest pile first; parts = 0 means "a touch"
   * @property {number} dE CIEDE2000 between target and mix
   * @property {string} mixHex
   * @property {number[]} mixLab
   * @property {boolean} outOfGamut
   * @property {number} chromaReach 0–1 share of the target's chroma the mix reaches (1 if in gamut)
   */

  const entries = (tubes, fractions) => tubes.map((tube, i) => ({ tube, w: fractions[i] }));
  const score = (targetLab, tubes, fractions) =>
    PM.deltaE2000(targetLab, PM.mixLab(entries(tubes, fractions))).dE;

  function* combinations(n, k, start = 0, picked = []) {
    if (picked.length === k) {
      yield picked.slice();
      return;
    }
    for (let i = start; i < n; i++) {
      picked.push(i);
      yield* combinations(n, k, i + 1, picked);
      picked.pop();
    }
  }

  /** All ratios for k tubes on the coarse grid, each tube ≥ one step. */
  function gridRatios(k) {
    const N = C.GRID_STEPS;
    const out = [];
    if (k === 1) out.push([1]);
    else if (k === 2) for (let a = 1; a < N; a++) out.push([a / N, (N - a) / N]);
    else
      for (let a = 1; a < N - 1; a++)
        for (let b = 1; a + b < N; b++) out.push([a / N, b / N, (N - a - b) / N]);
    return out;
  }

  // ---- Candidate cache (one palette + max-tubes setting at a time) ----
  let cache = { key: '', groups: [] };

  const paletteKey = (palette, maxTubes) =>
    maxTubes + '|' + palette.map((t) => `${t.id}:${t.hex}:${t.strength}`).join(',');

  /** @returns {{ tubes: Tube[], ratios: number[][], labs: number[][] }[]} */
  function candidates(palette, maxTubes) {
    const key = paletteKey(palette, maxTubes);
    if (cache.key === key) return cache.groups;
    const groups = [];
    for (let k = 1; k <= Math.min(maxTubes, palette.length); k++) {
      const ratios = gridRatios(k);
      for (const idx of combinations(palette.length, k)) {
        const tubes = idx.map((i) => palette[i]);
        groups.push({ tubes, ratios, labs: ratios.map((r) => PM.mixLab(entries(tubes, r))) });
      }
    }
    cache = { key, groups };
    return groups;
  }

  /** Move paint between pairs of tubes in shrinking steps while ΔE improves. */
  function refine(targetLab, tubes, fractions) {
    let best = score(targetLab, tubes, fractions);
    if (fractions.length === 1) return { fractions, dE: best };
    for (let step = 0.04; step >= 0.0025; step /= 2) {
      let improved = true;
      while (improved) {
        improved = false;
        for (let i = 0; i < fractions.length; i++) {
          for (let j = 0; j < fractions.length; j++) {
            if (i === j || fractions[j] - step < 0.005) continue;
            const candidate = fractions.slice();
            candidate[i] += step;
            candidate[j] -= step;
            const s = score(targetLab, tubes, candidate);
            if (s < best - 1e-6) {
              best = s;
              fractions = candidate;
              improved = true;
            }
          }
        }
      }
    }
    return { fractions, dE: best };
  }

  /** Best recipe (exact fractions) for a Lab target. */
  function search(targetLab, groups) {
    const [tL, ta, tb] = targetLab;
    const perGroup = groups.map((g) => {
      // Pick each group's closest grid ratio with plain Lab distance (cheap: ~200k checks for a
      // 20-tube palette), then rank groups by CIEDE2000. Refinement below polishes the ratio.
      let bestIndex = 0;
      let bestDist = Infinity;
      for (let i = 0; i < g.labs.length; i++) {
        const [L, a, b] = g.labs[i];
        const dist = (L - tL) ** 2 + (a - ta) ** 2 + (b - tb) ** 2;
        if (dist < bestDist) {
          bestDist = dist;
          bestIndex = i;
        }
      }
      const dE = PM.deltaE2000(targetLab, g.labs[bestIndex]).dE;
      return { tubes: g.tubes, fractions: g.ratios[bestIndex], dE };
    });
    perGroup.sort((a, b) => a.dE - b.dE);

    const refined = perGroup
      .slice(0, C.REFINE_TOP)
      .map((g) => ({ tubes: g.tubes, ...refine(targetLab, g.tubes, g.fractions.slice()) }));
    const bestDE = Math.min(...refined.map((r) => r.dE));
    return refined
      .filter((r) => r.dE <= bestDE + C.PARSIMONY_DE)
      .sort((a, b) => a.tubes.length - b.tubes.length || a.dE - b.dE)[0];
  }

  /**
   * Smallest whole-number parts (each ≥ 1) for the main piles that stay close to the exact ratio.
   * Tubes under TOUCH_FRACTION get 0 parts ("a touch") and keep their exact share when scoring.
   */
  function toParts(targetLab, tubes, fractions, exactDE) {
    if (fractions.length === 1) return [1];
    const main = fractions.map((_, i) => i).filter((i) => fractions[i] >= C.TOUCH_FRACTION);
    const mainShare = main.reduce((sum, i) => sum + fractions[i], 0);
    let fallback = null;

    for (let total = main.length; total <= C.MAX_PARTS; total++) {
      const exact = main.map((i) => (fractions[i] / mainShare) * total);
      const piles = exact.map((v) => Math.max(1, Math.floor(v)));
      let remaining = total - piles.reduce((sum, p) => sum + p, 0);
      exact
        .map((v, k) => ({ remainder: v - Math.floor(v), k }))
        .sort((a, b) => b.remainder - a.remainder)
        .forEach(({ k }) => {
          if (remaining > 0) {
            piles[k]++;
            remaining--;
          }
        });

      const pileSum = piles.reduce((sum, p) => sum + p, 0);
      const parts = fractions.map(() => 0);
      const rounded = fractions.slice();
      main.forEach((i, k) => {
        parts[i] = piles[k];
        rounded[i] = (piles[k] / pileSum) * mainShare;
      });
      const dE = score(targetLab, tubes, rounded);
      if (!fallback || dE < fallback.dE) fallback = { parts, dE };
      if (dE <= exactDE + C.PARTS_TOLERANCE_DE) return parts;
    }
    return fallback.parts;
  }

  /**
   * @param {string} targetHex
   * @param {Tube[]} palette
   * @param {number} [maxTubes]
   * @returns {Recipe | null} null for an empty palette
   */
  function solve(targetHex, palette, maxTubes = C.MAX_TUBES) {
    if (!palette.length) return null;
    const targetLab = PM.hexToLab(targetHex);
    const groups = candidates(palette, maxTubes);
    let pick = search(targetLab, groups);
    let chromaReach = 1;

    if (pick.dE > C.DE_OUT_OF_GAMUT) {
      // CIEDE2000 alone would happily pick a gray of the right value. Instead keep the target's
      // hue and value, and binary-search the highest chroma the tubes can actually reach.
      const target = PM.lch(targetLab);
      let lo = 0;
      let hi = 1;
      let mapped = null;
      for (let step = 0; step < C.GAMUT_SEARCH_STEPS; step++) {
        const mid = (lo + hi) / 2;
        const candidate = search(PM.lchToLab({ ...target, C: target.C * mid }), groups);
        if (candidate.dE <= C.DE_REACHABLE) {
          lo = mid;
          mapped = candidate;
        } else {
          hi = mid;
        }
      }
      if (mapped) {
        pick = { ...mapped, dE: score(targetLab, mapped.tubes, mapped.fractions) };
        chromaReach = lo;
      }
    }

    const parts = toParts(targetLab, pick.tubes, pick.fractions, pick.dE);
    const items = pick.tubes
      .map((tube, i) => ({ tube, frac: pick.fractions[i], parts: parts[i] }))
      .sort((a, b) => b.frac - a.frac);
    const mixHex = PM.mixHex(items.map((it) => ({ tube: it.tube, w: it.frac })));
    return {
      targetHex,
      targetLab: [...targetLab],
      items,
      dE: pick.dE,
      mixHex,
      mixLab: [...PM.hexToLab(mixHex)],
      outOfGamut: pick.dE > C.DE_OUT_OF_GAMUT,
      chromaReach,
    };
  }

  /**
   * How far the mix moves if you overshoot tube `i` by 25% (at least 2% of the whole mix,
   * since nobody measures a dab more precisely). Above STRONG_TUBE_DE = "add slowly".
   * @param {{ tube: Tube, w: number }[]} mix
   */
  function overshootDE(mix, i) {
    const total = mix.reduce((sum, e) => sum + e.w, 0);
    const over = mix.map((e, k) =>
      k === i ? { tube: e.tube, w: e.w + Math.max(e.w * 0.25, total * 0.02) } : e,
    );
    return PM.deltaE2000(PM.mixLab(mix), PM.mixLab(over)).dE;
  }

  PM.solver = { solve, overshootDE };
})(typeof window !== 'undefined' ? window : globalThis);
