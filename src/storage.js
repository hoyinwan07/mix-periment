// localStorage with a safe fallback. Storage can be missing or throw (private browsing,
// blocked cookies, some file:// contexts, quota). The app must never crash because of it,
// so failures fall back to an in-memory store for the session.
(function (root) {
  const PM = (root.PM = root.PM || {});
  const memory = new Map();

  function backend() {
    try {
      return typeof root.localStorage !== 'undefined' ? root.localStorage : null;
    } catch {
      return null; // Accessing localStorage itself can throw a SecurityError.
    }
  }

  function get(key) {
    try {
      const store = backend();
      if (store) return store.getItem(key);
    } catch {
      /* fall through to memory */
    }
    return memory.has(key) ? memory.get(key) : null;
  }

  function set(key, value) {
    memory.set(key, value);
    try {
      const store = backend();
      if (store) store.setItem(key, value);
    } catch {
      /* keep the in-memory copy */
    }
  }

  function remove(key) {
    memory.delete(key);
    try {
      const store = backend();
      if (store) store.removeItem(key);
    } catch {
      /* nothing else to do */
    }
  }

  PM.storage = { get, set, remove };
})(typeof window !== 'undefined' ? window : globalThis);
