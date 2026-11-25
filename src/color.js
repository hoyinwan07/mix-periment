// Color math: sRGB <-> CIELAB (D65), LCh, CIEDE2000.
// Classic script (no modules) so index.html also works when opened via file://.
(function (root) {
  const PM = (root.PM = root.PM || {});

  const D65 = [0.95047, 1.0, 1.08883];

  function clamp01(x) {
    return x < 0 ? 0 : x > 1 ? 1 : x;
  }

  function parseHex(input) {
    if (typeof input !== 'string') return null;
    let s = input.trim().replace(/^#/, '');
    if (/^[0-9a-f]{3}$/i.test(s)) s = s.replace(/./g, '$&$&'); // #abc -> #aabbcc
    if (!/^[0-9a-f]{6}$/i.test(s)) return null;
    return '#' + s.toUpperCase();
  }

  function hexToRgb(hex) {
    const h = parseHex(hex).slice(1);
    return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  }

  const toByteHex = (v) =>
    Math.round(clamp01(v) * 255)
      .toString(16)
      .padStart(2, '0');

  function rgbToHex(rgb) {
    return ('#' + rgb.map(toByteHex).join('')).toUpperCase();
  }

  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const toGamma = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

  function linearToXyz([r, g, b]) {
    return [
      0.4124564 * r + 0.3575761 * g + 0.1804375 * b,
      0.2126729 * r + 0.7151522 * g + 0.072175 * b,
      0.0193339 * r + 0.119192 * g + 0.9503041 * b,
    ];
  }

  function xyzToLinear([x, y, z]) {
    return [
      3.2404542 * x - 1.5371385 * y - 0.4985314 * z,
      -0.969266 * x + 1.8760108 * y + 0.041556 * z,
      0.0556434 * x - 0.2040259 * y + 1.0572252 * z,
    ];
  }

  function xyzToLab([x, y, z]) {
    const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116);
    const fx = f(x / D65[0]);
    const fy = f(y / D65[1]);
    const fz = f(z / D65[2]);
    return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
  }

  function labToXyz([L, a, b]) {
    const fy = (L + 16) / 116;
    const fx = fy + a / 500;
    const fz = fy - b / 200;
    const inv = (t) => (t * t * t > 216 / 24389 ? t * t * t : (116 * t - 16) / (24389 / 27));
    return [inv(fx) * D65[0], inv(fy) * D65[1], inv(fz) * D65[2]];
  }

  // Memoized: the same few palette hexes are converted thousands of times per render.
  const labCache = new Map();
  function hexToLab(hex) {
    let lab = labCache.get(hex);
    if (!lab) {
      if (labCache.size > 2000) labCache.clear(); // bound memory while the picker is dragged
      lab = Object.freeze(xyzToLab(linearToXyz(hexToRgb(hex).map(toLinear))));
      labCache.set(hex, lab);
    }
    return lab;
  }
  function labToHex(lab) {
    return rgbToHex(xyzToLinear(labToXyz(lab)).map((c) => toGamma(clamp01(c))));
  }

  function lch([L, a, b]) {
    let h = (Math.atan2(b, a) * 180) / Math.PI;
    if (h < 0) h += 360;
    return { L, C: Math.hypot(a, b), h };
  }

  function lchToLab({ L, C, h }) {
    return [L, C * Math.cos(rad(h)), C * Math.sin(rad(h))];
  }

  // Same lightness, zero chroma: what the color looks like in a black & white photo.
  function grayOf(hex) {
    return labToHex([hexToLab(hex)[0], 0, 0]);
  }

  // Munsell value is roughly L*/10 on a 0 (black) to 10 (white) scale.
  function value10(lab) {
    return Math.max(0, Math.min(10, lab[0] / 10));
  }

  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;

  // CIEDE2000 per Sharma, Wu & Dalal (2005). Lab1 = reference (target), Lab2 = sample (mix).
  // Returns total dE plus the weighted, signed lightness / chroma / hue terms (sample - reference).
  function deltaE2000(lab1, lab2) {
    const [L1, a1, b1] = lab1;
    const [L2, a2, b2] = lab2;
    const C1 = Math.hypot(a1, b1);
    const C2 = Math.hypot(a2, b2);
    const Cbar7 = Math.pow((C1 + C2) / 2, 7);
    const G = 0.5 * (1 - Math.sqrt(Cbar7 / (Cbar7 + Math.pow(25, 7))));
    const a1p = (1 + G) * a1;
    const a2p = (1 + G) * a2;
    const C1p = Math.hypot(a1p, b1);
    const C2p = Math.hypot(a2p, b2);
    const hp = (b, a) => {
      if (a === 0 && b === 0) return 0;
      const h = deg(Math.atan2(b, a));
      return h < 0 ? h + 360 : h;
    };
    const h1p = hp(b1, a1p);
    const h2p = hp(b2, a2p);

    const dLp = L2 - L1;
    const dCp = C2p - C1p;
    let dhp = 0;
    if (C1p * C2p !== 0) {
      dhp = h2p - h1p;
      if (dhp > 180) dhp -= 360;
      else if (dhp < -180) dhp += 360;
    }
    const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin(rad(dhp / 2));

    const Lbp = (L1 + L2) / 2;

    const Cbp = (C1p + C2p) / 2;
    let hbp;
    if (C1p * C2p === 0) hbp = h1p + h2p;
    else if (Math.abs(h1p - h2p) <= 180) hbp = (h1p + h2p) / 2;
    else if (h1p + h2p < 360) hbp = (h1p + h2p + 360) / 2;
    else hbp = (h1p + h2p - 360) / 2;

    const T =
      1 -
      0.17 * Math.cos(rad(hbp - 30)) +
      0.24 * Math.cos(rad(2 * hbp)) +
      0.32 * Math.cos(rad(3 * hbp + 6)) -
      0.2 * Math.cos(rad(4 * hbp - 63));
    const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
    const Cbp7 = Math.pow(Cbp, 7);
    const RC = 2 * Math.sqrt(Cbp7 / (Cbp7 + Math.pow(25, 7)));
    const SL = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
    const SC = 1 + 0.045 * Cbp;
    const SH = 1 + 0.015 * Cbp * T;
    const RT = -Math.sin(rad(2 * dTheta)) * RC;

    const tL = dLp / SL;

    const tC = dCp / SC;

    const tH = dHp / SH;
    return {
      dE: Math.sqrt(tL * tL + tC * tC + tH * tH + RT * tC * tH),
      dL: tL,
      dC: tC,
      dH: tH,
      dh: dhp,
    };
  }

  // Approximate CIELAB hue-angle anchors for painter-friendly names.
  const HUES = [
    [15, 'crimson'],
    [40, 'red'],
    [65, 'orange'],
    [95, 'yellow'],
    [120, 'yellow-green'],
    [145, 'green'],
    [190, 'teal'],
    [235, 'sky blue'],
    [275, 'blue'],
    [305, 'violet'],
    [340, 'magenta'],
  ];
  function hueName(h) {
    h = ((h % 360) + 360) % 360;
    let best = HUES[0];
    let bd = 999;
    for (const e of HUES) {
      const d = Math.min(Math.abs(h - e[0]), 360 - Math.abs(h - e[0]));
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best[1];
  }

  Object.assign(PM, {
    parseHex,
    hexToRgb,
    rgbToHex,
    toLinear,
    toGamma,
    linearToXyz,
    xyzToLinear,
    xyzToLab,
    labToXyz,
    hexToLab,
    labToHex,
    lch,
    lchToLab,
    grayOf,
    value10,
    deltaE2000,
    hueName,
    clamp01,
  });
})(typeof window !== 'undefined' ? window : globalThis);
