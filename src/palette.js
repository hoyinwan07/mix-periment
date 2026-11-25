// The user's tubes: defaults, validation, persistence, and JSON import / export.
(function (root) {
  const PM = (root.PM = root.PM || {});
  const KEY = 'mixperiment.palette.v1';
  const NAME_MAX = 60;
  const STRENGTH_MIN = 0.1;
  const STRENGTH_MAX = 10;

  /** @typedef {{ id: string, name: string, hex: string, strength: number }} Tube */

  // Starting estimates for Winsor & Newton Artists' Oil masstones; users should edit each hex to
  // match a swatch they painted. Strength = tinting-strength multiplier in the mixing model
  // (white is higher because titanium-based whites tint strongly).
  const DEFAULTS = Object.freeze([
    { name: 'Soft Mixing White', hex: '#F3F0E8', strength: 3 },
    { name: 'Ivory Black', hex: '#1E1D1B', strength: 1 },
    { name: 'Burnt Umber', hex: '#4A3426', strength: 1 },
    { name: 'Cadmium Red', hex: '#C8302A', strength: 1 },
    { name: 'Alizarin Crimson', hex: '#7E1A2C', strength: 1 },
    { name: 'French Ultramarine', hex: '#23308A', strength: 1 },
    { name: 'Cerulean Blue', hex: '#2E7DB5', strength: 1 },
    { name: 'Viridian Hue', hex: '#14634F', strength: 1 },
    { name: 'Permanent Green Light', hex: '#3F9B46', strength: 1 },
    { name: 'Cadmium Yellow Medium', hex: '#F5B300', strength: 1 },
  ]);

  const uid = () =>
    root.crypto && typeof root.crypto.randomUUID === 'function'
      ? root.crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);

  /** Clamp a tinting strength into the supported range (defaults to 1). */
  function normalizeStrength(value) {
    const n = Number(value);
    return n >= STRENGTH_MIN && n <= STRENGTH_MAX ? n : 1;
  }

  /**
   * Validate untrusted tube data (localStorage or an imported file). Invalid entries are dropped,
   * names are trimmed plain text (always rendered with textContent, never as HTML).
   * @param {unknown} list
   * @returns {Tube[] | null} null if `list` isn't an array
   */
  function sanitize(list) {
    if (!Array.isArray(list)) return null;
    const out = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') continue;
      const hex = PM.parseHex(item.hex);
      const name = typeof item.name === 'string' ? item.name.trim().slice(0, NAME_MAX) : '';
      if (!hex || !name) continue;
      out.push({
        id: typeof item.id === 'string' && item.id ? item.id : uid(),
        name,
        hex,
        strength: normalizeStrength(item.strength),
      });
    }
    return out;
  }

  const defaults = () => sanitize(DEFAULTS.map((t) => ({ ...t })));

  /** @returns {Tube[]} saved tubes, or the defaults if nothing valid is saved */
  function load() {
    try {
      const saved = sanitize(JSON.parse(PM.storage.get(KEY)));
      if (saved) return saved;
    } catch {
      /* corrupt JSON: fall back to defaults */
    }
    return defaults();
  }

  function save(tubes) {
    PM.storage.set(KEY, JSON.stringify(tubes));
  }

  function reset() {
    PM.storage.remove(KEY);
    return defaults();
  }

  function exportJSON(tubes) {
    const data = {
      app: 'mix-periment',
      version: 1,
      tubes: tubes.map(({ name, hex, strength }) => ({ name, hex, strength })),
    };
    return JSON.stringify(data, null, 2);
  }

  /**
   * Parse an exported palette file (or a bare array of tubes).
   * @throws {Error} with a user-facing message if nothing valid is in the file
   */
  function importJSON(text) {
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      throw new Error("That file isn't valid JSON.");
    }
    const tubes = sanitize(Array.isArray(data) ? data : data && data.tubes);
    if (!tubes || !tubes.length) throw new Error('No valid tubes found in that file.');
    return tubes;
  }

  PM.palette = {
    load,
    save,
    reset,
    exportJSON,
    importJSON,
    sanitize,
    normalizeStrength,
    uid,
    DEFAULTS,
  };
})(typeof window !== 'undefined' ? window : globalThis);
