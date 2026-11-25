// Sandbox amount slider: a native <input type="range"> (keyboard + screen-reader support for
// free) layered over a custom track: pill rail, tick dots, a ring at the recipe amount, and a
// fill in the tube's color from that ring to the thumb (how far you've moved from the recipe).
// The tube color comes from the --c custom property set on the returned root element.
(function (root) {
  const PM = (root.PM = root.PM || {});
  const TICKS = [0, 25, 50, 75, 100];

  const span = (className, leftPercent) => {
    const node = document.createElement('span');
    node.className = className;
    node.style.left = leftPercent + '%';
    return node;
  };

  /**
   * @param {{ label: string, base: number, value: number, onInput: (value: number) => void }} options
   *   base = recipe amount (0–100), shown as the ring; value = current amount (0–100)
   */
  function createSlider({ label, base, value, onInput }) {
    const rootEl = document.createElement('div');
    rootEl.className = 'slider';

    const rail = document.createElement('div');
    rail.className = 'rail';

    const lane = document.createElement('div');
    lane.className = 'lane';
    const fill = document.createElement('div');
    fill.className = 'fill';
    const ring = span('origin', base);
    ring.title = 'Recipe amount';
    lane.append(...TICKS.map((p) => span('tick', p)), fill, ring);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '0.1';
    input.value = String(value);
    input.setAttribute('aria-label', `${label} amount (recipe: ${base})`);
    input.addEventListener('input', () => onInput(Number(input.value)));

    rootEl.append(rail, lane, input);

    /** Sync the thumb and fill to `amount` (called on drag and during animations). */
    function update(amount) {
      const lo = Math.min(amount, base);
      const hi = Math.max(amount, base);
      // The lane is inset by the thumb radius (--r), so 0–100% lines up with the thumb's travel.
      fill.style.left = `calc(${lo}% - var(--r))`;
      fill.style.width = `calc(${hi - lo}% + 2 * var(--r))`;
      if (Math.abs(Number(input.value) - amount) > 0.05) input.value = String(amount);
    }

    /** Announce the orientation that matches the layout (vertical on phones). */
    function setVertical(vertical) {
      input.setAttribute('aria-orientation', vertical ? 'vertical' : 'horizontal');
    }

    update(value);
    return { el: rootEl, update, setVertical };
  }

  PM.ui = PM.ui || {};
  PM.ui.createSlider = createSlider;
})(typeof window !== 'undefined' ? window : globalThis);
