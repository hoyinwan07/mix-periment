// Sandbox amount slider: a native <input type="range"> (keyboard + screen-reader support for
// free) layered over a custom track. The track fills from the left in the tube's color, so the
// filled length is the tube's share of the mix. The native thumb is invisible: press or drag
// anywhere on the track. The tube color comes from the --c custom property on the root element.
(function (root) {
  const PM = (root.PM = root.PM || {});
  const TICKS = [25, 50, 75];

  /**
   * @param {{ label: string, value: number, onInput: (value: number) => void,
   *   onCommit: (value: number) => void }} options
   *   value = share of the mix (0–100); onInput fires while dragging, onCommit on release
   */
  function createSlider({ label, value, onInput, onCommit }) {
    const rootEl = document.createElement('div');
    rootEl.className = 'slider';

    const track = document.createElement('div');
    track.className = 'track';
    const ticks = TICKS.map((p) => {
      const tick = document.createElement('span');
      tick.className = 'tick';
      tick.style.left = p + '%';
      return tick;
    });
    const fill = document.createElement('div');
    fill.className = 'fill';
    track.append(...ticks, fill);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = String(value);
    input.setAttribute('aria-label', `${label} share of the mix`);
    input.addEventListener('input', () => onInput(Number(input.value)));
    input.addEventListener('change', () => onCommit(Number(input.value)));

    rootEl.append(track, input);

    /** Sync the fill (and the input, unless the user is mid-drag) to `amount`. */
    function update(amount) {
      fill.style.width = amount + '%';
      if (Math.abs(Number(input.value) - amount) >= 0.5) input.value = String(amount);
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
