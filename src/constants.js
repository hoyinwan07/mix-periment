// Every tunable number in one place, with the reason it has that value.
// Loaded first; other scripts read it as PM.config.
(function (root) {
  const PM = (root.PM = root.PM || {});

  PM.config = Object.freeze({
    // ---- Perception (CIEDE2000 ΔE) ----
    /** Below this, two colors look identical to most people. */
    DE_IMPERCEPTIBLE: 1,
    /** Classic just-noticeable difference (Mahy et al. 1994, measured for CIE76); a rule of thumb here. */
    DE_NOTICEABLE: 2.3,
    /** Best mix still this far off = the tubes can't reach the target (gamut warning). */
    DE_OUT_OF_GAMUT: 5,
    /** A mapped (reduced-chroma) target counts as reachable if the mix lands this close. */
    DE_REACHABLE: 2.5,

    // ---- Solver ----
    /** Coarse ratio grid: 20 steps = 5% increments. */
    GRID_STEPS: 20,
    /** Most tubes per recipe. More piles = more waste and muddier mixes. */
    MAX_TUBES: 3,
    /** How many of the best coarse combinations get fine-tuned. */
    REFINE_TOP: 10,
    /** Prefer a recipe with fewer tubes if it is within this ΔE of the best one. */
    PARSIMONY_DE: 0.5,
    /** Binary-search steps when mapping an out-of-gamut target (2^-7 ≈ 1% chroma precision). */
    GAMUT_SEARCH_STEPS: 7,
    /** Under 5% of the mix is shown as "a touch" rather than whole parts. */
    TOUCH_FRACTION: 0.05,
    /** Largest total of whole parts we'll ask a painter to count out. */
    MAX_PARTS: 20,
    /** Rounding to whole parts may cost at most this much ΔE versus the exact ratio. */
    PARTS_TOLERANCE_DE: 1,

    // ---- Recipe guidance ----
    /** Overshooting a tube (by 25%, or 2% of the mix) shifts the color more than this = "strong". */
    STRONG_TUBE_DE: 3,
    /** A weighted ΔE2000 lightness / chroma / hue term this large is worth a coaching tip. */
    COACH_TERM_DE: 1.5,
    /** Tubes with at least this chroma count as "colored" (candidates for complements). */
    CHROMATIC_MIN_C: 15,
    /** Tubes with less chroma than this count as neutral (whites, blacks, grays). */
    NEUTRAL_MAX_C: 12,
    /** A neutral darker than this L* is treated as the palette's black. */
    BLACK_MAX_L: 35,
    /** A neutral lighter than this L* is treated as the palette's white. */
    WHITE_MIN_L: 85,
    /** Below this chroma a color has no meaningful hue to coach on. */
    HUE_MIN_C: 8,
    /** Only suggest a tube as a hue fix / complement if it's within this many degrees. */
    HUE_MATCH_MAX_DEG: 70,

    // ---- UI ----
    DEFAULT_TARGET: '#7A8B5C',
    /** Debounce for re-solving while the picker is being dragged. */
    SOLVE_DEBOUNCE_MS: 120,
    /** Duration of slider glide animations (release / reset / add / remove). */
    TWEEN_MS: 320,
    /** Share of the mix (%) a newly added sandbox tube starts at. */
    ADD_TUBE_AMOUNT: 5,
    /** Uploaded photos are downscaled to this many pixels on the long side. */
    IMAGE_MAX_PX: 1600,
    /** Eyedropper averages a (2r+1)² block of pixels to ignore photo noise. */
    SAMPLE_RADIUS: 2,
    /** Must match the phone breakpoint in style.css (vertical sliders). */
    PHONE_MEDIA: '(max-width: 520px)',
  });
})(typeof window !== 'undefined' ? window : globalThis);
