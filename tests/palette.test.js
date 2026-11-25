const test = require('node:test');
const assert = require('node:assert/strict');
const PM = require('./setup');

test('sanitize drops invalid tubes and clamps strength', () => {
  const tubes = PM.palette.sanitize([
    { name: 'Ok', hex: '#abc', strength: 50 },
    { name: '', hex: '#FFFFFF' },
    { name: 'Bad hex', hex: 'nope' },
    null,
    'string',
  ]);
  assert.equal(tubes.length, 1);
  assert.equal(tubes[0].hex, '#AABBCC');
  assert.equal(tubes[0].strength, 1);
  assert.ok(tubes[0].id);
});

test('names are kept as plain text (rendered with textContent, never HTML)', () => {
  const [tube] = PM.palette.importJSON('[{"name":"<img src=x onerror=alert(1)>","hex":"#fff"}]');
  assert.equal(tube.name, '<img src=x onerror=alert(1)>');
});

test('export -> import round-trips', () => {
  const original = PM.palette.reset();
  const restored = PM.palette.importJSON(PM.palette.exportJSON(original));
  assert.deepEqual(
    restored.map(({ name, hex, strength }) => ({ name, hex, strength })),
    original.map(({ name, hex, strength }) => ({ name, hex, strength })),
  );
});

test('import rejects junk with a readable error', () => {
  assert.throws(() => PM.palette.importJSON('not json'), /valid JSON/);
  assert.throws(() => PM.palette.importJSON('{"tubes":[]}'), /No valid tubes/);
});

test('save / load persist, and reset always returns the defaults', () => {
  const custom = [{ id: 'x', name: 'Only tube', hex: '#123456', strength: 2 }];
  PM.palette.save(custom);
  assert.deepEqual(PM.palette.load(), custom);
  assert.equal(PM.palette.reset().length, PM.palette.DEFAULTS.length);
  assert.equal(PM.palette.load().length, PM.palette.DEFAULTS.length);
});

test('storage survives a broken localStorage', () => {
  const original = globalThis.localStorage;
  globalThis.localStorage = {
    getItem() {
      throw new Error('SecurityError');
    },
    setItem() {
      throw new Error('QuotaExceeded');
    },
    removeItem() {
      throw new Error('SecurityError');
    },
  };
  try {
    PM.storage.set('k', 'v');
    assert.equal(PM.storage.get('k'), 'v');
    assert.doesNotThrow(() => PM.palette.load());
  } finally {
    globalThis.localStorage = original;
  }
});
