// Subtractive mixing: single-constant Kubelka-Munk on reconstructed reflectance spectra.
//
// 1. Each tube's hex is "uplifted" to a smooth reflectance curve R(λ), 380–730 nm in 10 nm bins,
//    using the sigmoid-polynomial model of Jakob & Hanika (2019).
// 2. Per wavelength, K/S = (1-R)^2 / 2R. A mix averages K/S weighted by parts × tinting strength,
//    then converts back: R = 1 + K/S - sqrt((K/S)^2 + 2 K/S).
// 3. The mixed spectrum goes back to XYZ with the CIE 1931 2° observer (analytic fit by
//    Wyman, Sloan & Shirley 2013), white-balanced so a perfect reflector = D65 white.
// Because mixing happens per wavelength, blue + yellow overlap only in green, so the mix is green.
(function (root) {
  const PM = (root.PM = root.PM || {});

  const N = 36;
  const WL = Array.from({ length: N }, (_, i) => 380 + 10 * i);

  const g = (x, mu, s1, s2) => {
    const t = (x - mu) / (x < mu ? s1 : s2);
    return Math.exp(-0.5 * t * t);
  };
  const xbar = (l) =>
    1.056 * g(l, 599.8, 37.9, 31.0) +
    0.362 * g(l, 442.0, 16.0, 26.7) -
    0.065 * g(l, 501.1, 20.4, 26.2);
  const ybar = (l) => 0.821 * g(l, 568.8, 46.9, 40.5) + 0.286 * g(l, 530.9, 16.3, 31.1);
  const zbar = (l) => 1.217 * g(l, 437.0, 11.8, 36.0) + 0.681 * g(l, 459.0, 26.0, 13.8);

  // Weights so that XYZ = Σ R(λ)·w(λ), with R ≡ 1 giving exactly the D65 white point.
  const WX = new Float64Array(N);
  const WY = new Float64Array(N);
  const WZ = new Float64Array(N);
  (function () {
    let sx = 0;
    let sy = 0;
    let sz = 0;
    for (let i = 0; i < N; i++) {
      WX[i] = xbar(WL[i]);
      WY[i] = ybar(WL[i]);
      WZ[i] = zbar(WL[i]);
      sx += WX[i];
      sy += WY[i];
      sz += WZ[i];
    }
    for (let i = 0; i < N; i++) {
      WX[i] *= 0.95047 / sx;
      WY[i] *= 1 / sy;
      WZ[i] *= 1.08883 / sz;
    }
  })();

  const R_MIN = 1e-4;

  const R_MAX = 1 - 1e-4;

  function spectrumToXyz(R) {
    let x = 0;
    let y = 0;
    let z = 0;
    for (let i = 0; i < N; i++) {
      x += R[i] * WX[i];
      y += R[i] * WY[i];
      z += R[i] * WZ[i];
    }
    return [x, y, z];
  }
  const spectrumToLab = (R) => PM.xyzToLab(spectrumToXyz(R));
  const spectrumToHex = (R) =>
    PM.rgbToHex(PM.xyzToLinear(spectrumToXyz(R)).map((c) => PM.toGamma(PM.clamp01(c))));

  // --- Spectral uplifting (hex -> smooth reflectance) ---
  const sig = (z) => 0.5 + z / (2 * Math.sqrt(1 + z * z));
  function curve(c, out) {
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      out[i] = Math.min(R_MAX, Math.max(R_MIN, sig(c[0] * t * t + c[1] * t + c[2])));
    }
    return out;
  }

  function solve3(A, b) {
    // Cramer's rule for a 3×3 system.
    const det = (m) =>
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const D = det(A);
    if (Math.abs(D) < 1e-14) return null;
    return [0, 1, 2].map(
      (k) => det(A.map((row, r) => row.map((v, c) => (c === k ? b[r] : v)))) / D,
    );
  }

  /**
   * Reflectance curve + K/S for a tube color (cached per hex). The returned arrays are shared:
   * treat them as read-only.
   * @returns {{ R: Float64Array, KS: Float64Array, fitError: number }}
   */
  const upliftCache = new Map();
  function uplift(hex) {
    if (upliftCache.has(hex)) return upliftCache.get(hex);
    const target = PM.hexToLab(hex);
    const tmp = new Float64Array(N);
    const labOf = (c) => spectrumToLab(curve(c, tmp));
    let c = [0, 0, 0];
    const start = labOf(c);
    // Continuation: walk the target from mid-gray to the real color for robust convergence.
    const STEPS = 8;
    for (let s = 1; s <= STEPS; s++) {
      const t = s / STEPS;
      const goal = start.map((v, k) => v + (target[k] - v) * t);
      let lambda = 1e-3;
      for (let it = 0; it < 40; it++) {
        const cur = labOf(c);
        const r = cur.map((v, k) => v - goal[k]);
        const err = r[0] * r[0] + r[1] * r[1] + r[2] * r[2];
        if (err < 1e-6) break;
        const J = [
          [0, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ];
        for (let j = 0; j < 3; j++) {
          const cp = c.slice();
          cp[j] += 1e-4;
          const lp = labOf(cp);
          for (let k = 0; k < 3; k++) J[k][j] = (lp[k] - cur[k]) / 1e-4;
        }
        // Levenberg–Marquardt step: (JᵀJ + λI) δ = -Jᵀr
        const A = [0, 1, 2].map((i) =>
          [0, 1, 2].map(
            (j) =>
              J[0][i] * J[0][j] + J[1][i] * J[1][j] + J[2][i] * J[2][j] + (i === j ? lambda : 0),
          ),
        );
        const bb = [0, 1, 2].map((i) => -(J[0][i] * r[0] + J[1][i] * r[1] + J[2][i] * r[2]));
        const d = solve3(A, bb);
        if (!d) break;
        const cn = c.map((v, k) => v + d[k]);
        const ln = labOf(cn);
        const en = ln.reduce((acc, v, k) => acc + (v - goal[k]) * (v - goal[k]), 0);
        if (en < err) {
          c = cn;
          lambda = Math.max(lambda / 3, 1e-7);
        } else {
          lambda *= 4;
        }
      }
    }
    const R = curve(c, new Float64Array(N));
    const KS = new Float64Array(N);
    for (let i = 0; i < N; i++) KS[i] = ((1 - R[i]) * (1 - R[i])) / (2 * R[i]);
    const fitError = PM.deltaE2000(target, spectrumToLab(R)).dE;
    const out = { R, KS, fitError };
    upliftCache.set(hex, out);
    return out;
  }

  // Scratch buffers reused by every mix: the solver calls this ~200k times per palette, so we
  // avoid allocating. Internal only — callers get a fresh Lab array or hex string, never these.
  const mixKS = new Float64Array(N);
  const mixR = new Float64Array(N);

  /** @param {{ tube: { hex: string, strength?: number }, w: number }[]} entries */
  function mixSpectrum(entries) {
    const out = mixR;
    let total = 0;
    mixKS.fill(0);
    for (const e of entries) {
      const c = e.w * (e.tube.strength || 1);
      if (c <= 0) continue;
      const ks = uplift(e.tube.hex).KS;
      for (let i = 0; i < N; i++) mixKS[i] += c * ks[i];
      total += c;
    }
    if (total <= 0) {
      out.fill(R_MAX);
      return out;
    }
    for (let i = 0; i < N; i++) {
      const k = mixKS[i] / total;
      out[i] = 1 + k - Math.sqrt(k * k + 2 * k);
    }
    return out;
  }

  /** Mix tubes in the given amounts; returns a new CIELAB array. */
  const mixLab = (entries) => spectrumToLab(mixSpectrum(entries));
  /** Mix tubes in the given amounts; returns a hex string. */
  const mixHex = (entries) => spectrumToHex(mixSpectrum(entries));

  Object.assign(PM, { uplift, mixLab, mixHex });
})(typeof window !== 'undefined' ? window : globalThis);
