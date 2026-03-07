/* search.js — main-thread bridge to search.worker.js
 *
 * Spawns the Web Worker once and routes messages to/from it.
 * The main thread never does any JSON parsing or array filtering.
 *
 * Public API (same shape as before so app.js needs minimal changes):
 *   Search.query(rawInput, dir, callback)
 *     callback(status, results)  status: 'loading' | 'done' | null
 *
 *   Search.lookup(word, dir) → Promise<entry | null>
 *
 *   Search.detectDir(input)  → 'de-en' | null
 */

const Search = (() => {
  // ── German character detection ────────────────────────────────────────────
  const DE_CHARS = /[äöüÄÖÜß]/;

  function detectDir(input) {
    return DE_CHARS.test(input) ? 'de-en' : null;
  }

  // ── Worker setup ──────────────────────────────────────────────────────────
  let worker = null;
  let msgId  = 0;

  // Pending lookup promises: id → { resolve, reject }
  const pending = new Map();

  // Active search callback (only one at a time — newest wins)
  let searchCallback = null;
  let searchId       = null;

  function getWorker() {
    if (worker) return worker;

    worker = new Worker('js/search.worker.js');

    worker.onmessage = (e) => {
      const msg = e.data;

      switch (msg.type) {
        case 'SEARCH_RESULT':
          // Only deliver results for the most recent search request
          if (msg.id === searchId && searchCallback) {
            searchCallback(msg.status, msg.results);
            if (msg.status === 'done') {
              searchCallback = null;
              searchId       = null;
            }
          }
          break;

        case 'LOOKUP_RESULT': {
          const p = pending.get(msg.id);
          if (p) { p.resolve(msg.entry); pending.delete(msg.id); }
          break;
        }

        case 'ERROR': {
          const p = pending.get(msg.id);
          if (p) { p.reject(new Error(msg.message)); pending.delete(msg.id); }
          console.error('[search] Worker error:', msg.message);
          break;
        }
      }
    };

    worker.onerror = (err) => {
      console.error('[search] Worker fatal error:', err);
      // Reject all pending lookups
      for (const [, p] of pending) p.reject(err);
      pending.clear();
      worker = null; // allow respawn on next call
    };

    return worker;
  }

  // ── Public: query (debounced inside worker) ───────────────────────────────
  function query(rawInput, dir, callback) {
    const q = rawInput.trim();
    if (q.length < 2) {
      callback(null, []);
      return;
    }

    const id       = ++msgId;
    searchId       = id;
    searchCallback = callback;

    getWorker().postMessage({ type: 'SEARCH', id, query: q, dir });
  }

  // ── Public: immediate lookup (no debounce) ────────────────────────────────
  function lookup(word, dir) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject });
      getWorker().postMessage({ type: 'LOOKUP', id, word, dir });
    });
  }

  return { query, lookup, detectDir };
})();

window.Search = Search;
