// UI controller: owns app state, renders it, and wires events.
// All color math lives in color / mixer / solver; guidance in coach; text in format.
(function () {
  const PM = window.PM;
  const C = PM.config;
  const $ = (id) => document.getElementById(id);
  const TARGET_KEY = 'mixperiment.target';

  /** @typedef {{ id: string, name: string, hex: string, strength: number }} Tube */
  /** Sandbox entry: amount = the tube's slider value, its share of the mix (0–100). */
  /** @typedef {{ tube: Tube, amount: number }} SandboxEntry */

  const state = {
    /** @type {Tube[]} */ palette: PM.palette.load(),
    target: PM.parseHex(PM.storage.get(TARGET_KEY)) || C.DEFAULT_TARGET,
    /** @type {ReturnType<typeof PM.solver.solve>} */ recipe: null,
    /** @type {SandboxEntry[]} */ sandbox: [],
    grayMode: false,
  };

  // ---------- DOM helpers ----------
  /** Tiny element builder. Text always goes through textContent (no HTML injection). */
  function el(tag, attrs = {}, children = []) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value);
    }
    for (const child of [].concat(children)) if (child != null) node.append(child);
    return node;
  }

  const displayHex = (hex) => (state.grayMode ? PM.grayOf(hex) : hex);

  /** Color an element's background; remembers the hex so Value view can repaint it. */
  function paint(node, hex) {
    node.dataset.hex = hex;
    node.style.backgroundColor = displayHex(hex);
    if (!node.title || node.dataset.autoTitle) {
      node.title = hex;
      node.dataset.autoTitle = '1';
    }
  }

  /** Same, for components colored through the --c custom property (sliders). */
  function paintVar(node, hex) {
    node.dataset.cvar = hex;
    node.style.setProperty('--c', displayHex(hex));
  }

  function repaintAll() {
    document.querySelectorAll('[data-hex]').forEach((n) => paint(n, n.dataset.hex));
    document.querySelectorAll('[data-cvar]').forEach((n) => paintVar(n, n.dataset.cvar));
  }

  function swatch(hex, className = 'swatch sm', title) {
    const node = el('div', title ? { class: className, title } : { class: className });
    paint(node, hex);
    return node;
  }

  const renderTips = (list, tips) =>
    list.replaceChildren(...tips.map((t) => el('li', { text: t })));

  function debounce(fn, ms) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), ms);
    };
  }

  /** Run `fn` at most once per animation frame (slider input can fire faster than we paint). */
  function perFrame(fn) {
    let queued = false;
    return () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        fn();
      });
    };
  }

  // ---------- Target input ----------
  function setTarget(hex, { fromPicker = false, fromText = false } = {}) {
    state.target = hex;
    PM.storage.set(TARGET_KEY, hex);
    if (!fromText) $('hexInput').value = hex;
    if (!fromPicker) $('picker').value = hex.toLowerCase();
    $('hexError').hidden = true;
    solveSoon();
  }

  $('picker').addEventListener('input', (e) =>
    setTarget(PM.parseHex(e.target.value), { fromPicker: true }),
  );
  $('hexInput').addEventListener('input', (e) => {
    const hex = PM.parseHex(e.target.value);
    if (hex) setTarget(hex, { fromText: true });
    else $('hexError').hidden = e.target.value.replace('#', '').length < 6;
  });
  $('hexInput').addEventListener('blur', () => {
    $('hexInput').value = state.target; // never leave an invalid value showing
    $('hexError').hidden = true;
  });
  $('maxTubes').addEventListener('change', () => solveSoon());
  $('grayMode').addEventListener('change', (e) => {
    state.grayMode = e.target.checked;
    repaintAll();
  });

  // ---------- Photo eyedropper ----------
  const eyedropper = PM.ui.createEyedropper({
    canvas: $('imageCanvas'),
    container: $('imageWrap'),
    onPick: (hex) => setTarget(hex),
  });
  $('uploadBtn').addEventListener('click', () => $('imageInput').click());
  $('imageInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      await eyedropper.load(file);
    } catch (err) {
      alert(err.message);
    }
  });

  // ---------- Solve + recipe ----------
  function solve() {
    const hasTubes = state.palette.length > 0;
    for (const id of ['resultCard', 'sandboxCard', 'stripCard']) $(id).hidden = !hasTubes;
    if (!hasTubes) {
      state.recipe = null;
      return;
    }
    state.recipe = PM.solver.solve(state.target, state.palette, Number($('maxTubes').value));
    cancelTween();
    held = null;
    state.sandbox = recipeEntries();
    renderRecipe();
    renderSandbox();
  }
  const solveSoon = debounce(solve, C.SOLVE_DEBOUNCE_MS);

  function renderRecipe() {
    const r = state.recipe;
    paint($('swTarget'), r.targetHex);
    paint($('swMix'), r.mixHex);
    $('valTarget').textContent = PM.format.valueLabel(r.targetLab);
    $('valMix').textContent = PM.format.valueLabel(r.mixLab);
    $('deBadge').textContent = `ΔE ${r.dE.toFixed(1)}: ${PM.format.deltaELabel(r.dE)}`;

    $('gamutWarn').hidden = !r.outOfGamut;
    if (r.outOfGamut) {
      $('gamutWarn').textContent =
        r.chromaReach < 1
          ? `Your tubes can't reach this color. This mix keeps its hue and value at about ` +
            `${Math.round(r.chromaReach * 100)}% of its saturation. A more saturated tube near ` +
            `this hue would close the gap.`
          : "Your tubes can't reach this color. This is the closest mix.";
    }

    $('recipeBar').replaceChildren(
      ...r.items.map((item) => {
        const segment = el('div');
        segment.style.width = item.frac * 100 + '%';
        paint(segment, item.tube.hex);
        return segment;
      }),
    );

    const mix = r.items.map((item) => ({ tube: item.tube, w: item.frac }));
    const shares = PM.format.shareLabels(r.items.map((item) => item.frac));
    $('recipeList').replaceChildren(
      ...r.items.map((item, i) => {
        const strong = r.items.length > 1 && PM.solver.overshootDE(mix, i) > C.STRONG_TUBE_DE;
        const amount = item.parts ? `${item.parts} part${item.parts > 1 ? 's' : ''}` : 'a touch';
        const dots =
          item.parts && item.parts <= C.MAX_PARTS
            ? el(
                'div',
                { class: 'dots', 'aria-hidden': 'true' },
                Array.from({ length: item.parts }, () => swatch(item.tube.hex, 'dot')),
              )
            : null;
        return el('li', {}, [
          swatch(item.tube.hex),
          el('span', { class: 'amt', text: amount }),
          el('span', { class: 'tname', text: item.tube.name }),
          strong
            ? el('span', {
                class: 'flag',
                text: 'Strong: add last, a little at a time',
                title: `Overshooting this tube a little shifts the color noticeably (ΔE > ${C.STRONG_TUBE_DE}).`,
              })
            : null,
          el('span', { class: 'pct', text: shares[i] }),
          dots,
        ]);
      }),
    );
    renderTips(
      $('coach'),
      PM.coach.tips(r.targetLab, r.mixLab, state.palette, { maxedOut: r.outOfGamut }),
    );
  }

  // ---------- Sandbox ----------
  const toMix = (entries) =>
    entries.filter((e) => e.amount > 0).map((e) => ({ tube: e.tube, w: e.amount }));

  /** The recipe in whole percents (the sandbox moves in 1% steps). @returns {SandboxEntry[]} */
  function recipeEntries() {
    const shares = PM.sandbox.wholeShares(state.recipe.items.map((item) => item.frac));
    return state.recipe.items.map((item, i) => ({ tube: item.tube, amount: shares[i] }));
  }

  const phoneLayout = window.matchMedia(C.PHONE_MEDIA);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /** Rows currently on screen, so updates don't have to query the DOM. */
  let sandboxRows = [];

  // While a slider is dragged, only its own bar moves; the other bars glide into place on
  // release. The mix, swatches and % labels already show the rebalanced mix during the drag,
  // so what you see while dragging is exactly what you get on release.
  /** @type {SandboxEntry | null} the tube being dragged, until the other bars have settled */
  let held = null;

  /** Shares (summing to 100) with the held tube fixed and the others scaled around it. */
  function settledShares() {
    const amounts = state.sandbox.map((e) => e.amount);
    const i = state.sandbox.indexOf(held);
    return i < 0 ? amounts : PM.sandbox.rebalance(amounts, i);
  }

  /** On release: glide the other bars to their rebalanced shares. */
  function settle(entry) {
    held = entry;
    tweenSandbox(settledShares(), () => {
      held = null;
    });
  }

  function renderSandbox() {
    paint($('sbTarget'), state.target);
    sandboxRows = state.sandbox.map((entry) => {
      const slider = PM.ui.createSlider({
        label: entry.tube.name,
        value: entry.amount,
        onInput: (value) => {
          cancelTween();
          held = entry;
          entry.amount = value;
          updateSandboxSoon();
        },
        onCommit: () => settle(entry),
      });
      paintVar(slider.el, entry.tube.hex);
      slider.setVertical(phoneLayout.matches);
      const share = el('span', { class: 'share' });
      const more = el('div', { class: 'swatch sm', title: 'With a bit more of this tube' });
      const remove = el('button', {
        class: 'icon',
        text: '×',
        title: 'Remove from sandbox',
        'aria-label': `Remove ${entry.tube.name} from sandbox`,
        onclick: () => removeFromSandbox(entry),
      });
      const row = el('div', { class: 'sbrow' }, [
        swatch(entry.tube.hex),
        el('div', { class: 'col' }, [
          el('span', { class: 'name', text: entry.tube.name }),
          slider.el,
        ]),
        share,
        more,
        remove,
      ]);
      return { entry, row, slider, share, more };
    });
    $('sbRows').replaceChildren(...sandboxRows.map((r) => r.row));

    const unused = state.palette.filter((t) => !state.sandbox.some((e) => e.tube.id === t.id));
    $('sbAdd').replaceChildren(
      el('option', { value: '', text: '+ Add a tube…' }),
      ...unused.map((t) => el('option', { value: t.id, text: t.name })),
    );
    $('sbAdd').hidden = !unused.length;
    updateSandbox();
  }

  function updateSandbox() {
    const shares = settledShares();
    const settled = state.sandbox.map((e, i) => ({ tube: e.tube, amount: shares[i] }));
    const labels = PM.sandbox.wholeShares(shares).map((s) => s + '%');
    const bump = Math.max(shares.reduce((sum, s) => sum + s, 0) * 0.1, 2); // "a bit more" = +10%

    sandboxRows.forEach(({ entry, slider, share, more }, i) => {
      share.textContent = labels[i];
      slider.update(entry.amount);
      const withMore = settled.map((e, j) => (j === i ? { ...e, amount: e.amount + bump } : e));
      paint(more, PM.mixHex(toMix(withMore)));
    });

    const mix = toMix(settled);
    if (!mix.length) {
      delete $('sbMix').dataset.hex;
      $('sbMix').style.backgroundColor = 'transparent';
      $('sbDE').textContent = 'empty';
      $('sbCoach').replaceChildren();
      $('stripCard').hidden = true;
      return;
    }
    const lab = PM.mixLab(mix);
    const targetLab = PM.hexToLab(state.target);
    paint($('sbMix'), PM.mixHex(mix));
    $('sbDE').textContent = `ΔE ${PM.deltaE2000(targetLab, lab).dE.toFixed(1)}`;
    renderTips($('sbCoach'), PM.coach.tips(targetLab, lab, state.palette));
    renderStrip(mix);
  }
  const updateSandboxSoon = perFrame(updateSandbox);

  // Glide animations (release / reset / add / remove) so thumbs, fills and swatches move smoothly.
  let tweenId = 0;
  const cancelTween = () => {
    tweenId++;
  };
  function tweenSandbox(targets, done) {
    const id = ++tweenId;
    const from = state.sandbox.map((e) => e.amount);
    const duration = reduceMotion.matches ? 0 : C.TWEEN_MS;
    const start = performance.now();
    const frame = (now) => {
      if (id !== tweenId) return; // superseded by the user or another animation
      const t = duration ? Math.min(1, (now - start) / duration) : 1;
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      state.sandbox.forEach((e, i) => {
        e.amount = from[i] + (targets[i] - from[i]) * eased;
      });
      updateSandbox();
      if (t < 1) requestAnimationFrame(frame);
      else if (done) done();
    };
    requestAnimationFrame(frame);
  }

  /** Glide `entry` to `value` while the other tubes scale to fill the rest. */
  const tweenShare = (entry, value, done) => {
    held = null;
    const amounts = state.sandbox.map((e) => e.amount);
    tweenSandbox(PM.sandbox.rebalance(amounts, state.sandbox.indexOf(entry), value), done);
  };

  function removeFromSandbox(entry) {
    tweenShare(entry, 0, () => {
      state.sandbox = state.sandbox.filter((e) => e !== entry);
      renderSandbox();
    });
  }

  $('sbAdd').addEventListener('change', (e) => {
    const tube = state.palette.find((t) => t.id === e.target.value);
    if (!tube) return;
    const entry = { tube, amount: 0 };
    state.sandbox.push(entry);
    renderSandbox();
    tweenShare(entry, C.ADD_TUBE_AMOUNT);
  });

  // Back to the recipe: recipe tubes glide to their amounts, extra tubes glide to 0 and leave.
  $('sbReset').addEventListener('click', () => {
    if (!state.recipe) return;
    const recipe = recipeEntries();
    const current = new Map(state.sandbox.map((e) => [e.tube.id, e.amount]));
    const extras = state.sandbox.filter((e) => !recipe.some((r) => r.tube.id === e.tube.id));
    state.sandbox = [
      ...recipe.map((r) => ({ ...r, amount: current.get(r.tube.id) ?? 0 })),
      ...extras,
    ];
    held = null;
    renderSandbox();
    tweenSandbox([...recipe.map((r) => r.amount), ...extras.map(() => 0)], () => {
      state.sandbox = state.sandbox.slice(0, recipe.length);
      renderSandbox();
    });
  });

  phoneLayout.addEventListener('change', () =>
    sandboxRows.forEach(({ slider }) => slider.setVertical(phoneLayout.matches)),
  );

  // ---------- Tints, tones & shades ----------
  /** Gray (white + black) with the same value as `lab`, so a tone changes chroma, not value. */
  function sameValueGray(white, black, lab) {
    let lo = 0;
    let hi = 1;
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      const L = PM.mixLab([
        { tube: white, w: 1 - mid },
        { tube: black, w: mid },
      ])[0];
      if (L > lab[0]) lo = mid;
      else hi = mid;
    }
    const blackShare = (lo + hi) / 2;
    return [
      { tube: white, w: 1 - blackShare },
      { tube: black, w: blackShare },
    ];
  }

  /** @param {{ tube: Tube, w: number }[]} mix */
  function renderStrip(mix) {
    const { white, black } = PM.coach.neutrals(state.palette);
    const mixTotal = mix.reduce((sum, e) => sum + e.w, 0);
    const mixLab = PM.mixLab(mix);
    const withExtra = (extra, share) =>
      PM.mixHex([
        ...mix.map((e) => ({ tube: e.tube, w: (e.w / mixTotal) * (1 - share) })),
        ...extra.map((x) => ({ tube: x.tube, w: x.w * share })),
      ]);

    const rows = [];
    if (white) rows.push(['Tint', `+ ${white.name}`, [{ tube: white, w: 1 }], [0.25, 0.5, 0.75]]);
    if (white && black) {
      rows.push([
        'Tone',
        '+ gray, same value',
        sameValueGray(white, black, mixLab),
        [0.25, 0.5, 0.75],
      ]);
    }
    if (black) rows.push(['Shade', `+ ${black.name}`, [{ tube: black, w: 1 }], [0.1, 0.25, 0.5]]);
    const complement = PM.coach.tubeNearHue(state.palette, PM.lch(mixLab).h + 180);
    if (complement && PM.lch(mixLab).C > C.HUE_MIN_C) {
      rows.push([
        'Neutralize',
        `+ ${complement.name}`,
        [{ tube: complement, w: 1 }],
        [0.1, 0.25, 0.5],
      ]);
    }

    const mixHex = PM.mixHex(mix);
    const cell = (hex, label) => el('div', { class: 'cell' }, [swatch(hex, 'swatch'), label]);
    $('strip').replaceChildren(
      ...rows.map(([name, detail, extra, steps]) =>
        el('div', { class: 'srow' }, [
          el('div', { class: 'label' }, [el('b', { text: name }), el('br'), detail]),
          cell(mixHex, 'mix'),
          ...steps.map((share) => cell(withExtra(extra, share), `+${Math.round(share * 100)}%`)),
        ]),
      ),
    );
    $('stripCard').hidden = !rows.length;
  }

  // ---------- Palette ----------
  function commitPalette() {
    PM.palette.save(state.palette);
    renderPalette();
    solveSoon();
  }

  function renderPalette() {
    const header = el('div', { class: 'prow phead' }, [
      el('span'),
      el('span', { text: 'Name' }),
      el('span', { text: 'Hex' }),
      el('span', { class: 'strength', text: 'Strength' }),
      el('span'),
    ]);
    const rows = state.palette.map((tube) => {
      const color = el('input', {
        type: 'color',
        value: tube.hex.toLowerCase(),
        'aria-label': `${tube.name} color`,
      });
      const hex = el('input', {
        type: 'text',
        class: 'hex',
        value: tube.hex,
        maxlength: '7',
        'aria-label': `${tube.name} hex`,
      });
      const name = el('input', {
        type: 'text',
        value: tube.name,
        maxlength: '60',
        'aria-label': 'Tube name',
      });
      const strength = el('input', {
        type: 'number',
        class: 'strength',
        value: String(tube.strength),
        min: '0.1',
        max: '10',
        step: '0.1',
        'aria-label': `${tube.name} tinting strength`,
      });

      color.addEventListener('change', () => {
        tube.hex = PM.parseHex(color.value);
        commitPalette();
      });
      hex.addEventListener('change', () => {
        const parsed = PM.parseHex(hex.value);
        if (parsed) {
          tube.hex = parsed;
          commitPalette();
        } else {
          hex.value = tube.hex;
        }
      });
      name.addEventListener('change', () => {
        const trimmed = name.value.trim();
        if (trimmed) {
          tube.name = trimmed;
          commitPalette();
        } else {
          name.value = tube.name;
        }
      });
      strength.addEventListener('change', () => {
        const value = Number(strength.value);
        if (PM.palette.normalizeStrength(value) === value) {
          tube.strength = value;
          commitPalette();
        } else {
          strength.value = String(tube.strength); // out of range: put the old value back
        }
      });

      const remove = el('button', {
        class: 'icon',
        text: '×',
        title: `Delete ${tube.name}`,
        'aria-label': `Delete ${tube.name}`,
        onclick: () => {
          if (!confirm(`Delete ${tube.name} from your tubes?`)) return;
          state.palette = state.palette.filter((t) => t !== tube);
          commitPalette();
        },
      });
      return el('div', { class: 'prow' }, [color, name, hex, strength, remove]);
    });
    $('paletteList').replaceChildren(header, ...rows);
  }

  $('addForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('addName').value.trim();
    if (!name) return;
    state.palette.push({
      id: PM.palette.uid(),
      name,
      hex: PM.parseHex($('addColor').value),
      strength: 1,
    });
    $('addName').value = '';
    commitPalette();
  });

  $('exportBtn').addEventListener('click', () => {
    const blob = new Blob([PM.palette.exportJSON(state.palette)], { type: 'application/json' });
    const link = el('a', {
      href: URL.createObjectURL(blob),
      download: 'mix-periment-palette.json',
    });
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  });

  $('importBtn').addEventListener('click', () => $('importInput').click());
  $('importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const tubes = PM.palette.importJSON(await file.text());
      if (
        !confirm(`Replace your ${state.palette.length} tubes with ${tubes.length} from this file?`)
      )
        return;
      state.palette = tubes;
      commitPalette();
    } catch (err) {
      alert(`Import failed: ${err.message}`);
    }
  });

  $('resetBtn').addEventListener('click', () => {
    if (!confirm('Replace your tubes with the 10 default W&N tubes?')) return;
    state.palette = PM.palette.reset();
    renderPalette();
    solveSoon();
  });

  // ---------- Start ----------
  renderPalette();
  setTarget(state.target);
})();
