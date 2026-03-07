/* search.js — IDB-first search (v2)
 *
 * v2 replaces the chunk-scanning Web Worker with direct IndexedDB prefix
 * queries via Dexie (wordIndex store). Results are immediate after seeding.
 *
 * Public API (same shape as v1 — app.js needs no changes):
 *
 *   Search.query(rawInput, dir, callback)
 *     callback(status, results)  status: 'loading' | 'done' | null
 *     results: array of { w, pos, gender, hint } — same fields the UI needs
 *
 *   Search.lookup(word, dir) → Promise<full-entry | null>
 *     Returns full entry from wordData (IDB) or fetches from data chunk.
 *
 *   Search.detectDir(input) → 'de-en' | null
 *
 *   Search.isSeeded() → boolean
 *
 *   Search.seed(onProgress) → Promise<void>
 *     Runs seeding via seed.worker.js. Resolves when complete.
 */

'use strict';

const Search = (() => {
  // ── German character detection ─────────────────────────────────────────────
  const DE_CHARS = /[äöüÄÖÜß]/;

  function detectDir(input) {
    return DE_CHARS.test(input) ? 'de-en' : null;
  }

  // ── Seeding state ──────────────────────────────────────────────────────────
  const SEEDED_KEY = 'urwort:seeded';

  function isSeeded() {
    return localStorage.getItem(SEEDED_KEY) === '1';
  }

  function markSeeded() {
    localStorage.setItem(SEEDED_KEY, '1');
  }

  /**
   * Seed the dictionary index via seed.worker.js.
   * @param {function} onProgress  called with { done, total, letter, dir }
   * @returns {Promise<void>}
   */
  function seed(onProgress) {
    return new Promise((resolve, reject) => {
      const w = new Worker('/js/seed.worker.js');

      w.onmessage = (e) => {
        const msg = e.data;
        if (msg.type === 'PROGRESS') {
          if (typeof onProgress === 'function') onProgress(msg);
        } else if (msg.type === 'COMPLETE') {
          markSeeded();
          w.terminate();
          resolve();
        } else if (msg.type === 'ERROR') {
          w.terminate();
          reject(new Error(msg.message));
        }
      };

      w.onerror = (err) => {
        w.terminate();
        reject(err);
      };

      w.postMessage({ type: 'START' });
    });
  }

  // ── Debounce helper ────────────────────────────────────────────────────────
  let debounceTimer = null;
  const DEBOUNCE_MS = 150;

  // ── Search: IDB prefix query ───────────────────────────────────────────────
  /**
   * Query wordIndex for entries whose word starts with `q`, scoped to `dir`.
   * Returns up to MAX_RESULTS entries (already in result-card format).
   */
  const MAX_RESULTS = 20; // fetch a bit more so we can sort; UI caps at 5

  function query(rawInput, dir, callback) {
    const q = rawInput.trim();

    if (q.length < 2) {
      clearTimeout(debounceTimer);
      callback(null, []);
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      try {
        let results = await DB.wordIndexQuery(q, dir, MAX_RESULTS);
        console.log('[search] wordIndexQuery raw results', { q, dir, count: results.length, first: results[0] });

        // If no results and not already capitalized, try capitalized form
        // (German nouns are capitalized, so "haus" → try "Haus")
        if (results.length === 0 && q[0] >= 'a' && q[0] <= 'z') {
          const qCap = q[0].toUpperCase() + q.slice(1);
          results = await DB.wordIndexQuery(qCap, dir, MAX_RESULTS);
          console.log('[search] wordIndexQuery capitalized results', { qCap, dir, count: results.length });
        }

        // Normalize IDB rows (word) to UI format (w)
        const normalized = results.map(row => {
          if (!row || !row.word) {
            console.warn('[search] invalid row in results', row);
            return null;
          }
          return {
            w:      row.word,   // IDB has 'word', UI expects 'w'
            pos:    row.pos,
            gender: row.gender,
            hint:   row.hint,
          };
        }).filter(Boolean); // Remove any null entries

        console.log('[search] normalized results', { count: normalized.length, first: normalized[0] });
        callback('done', normalized);
      } catch (err) {
        console.error('[search] IDB query error:', err);
        callback('done', []);
      }
    }, DEBOUNCE_MS);
  }

  // ── Lookup: full entry from IDB or data chunk ─────────────────────────────
  /**
   * Get the full entry for a word (Layer 2).
   * 1. Check wordData in IDB (cache hit → instant).
   * 2. On miss: fetch /data/{dir}/data/{letter}.json, find entry, cache it.
   * @returns {Promise<object|null>}
   */
  async function lookup(word, dir) {
    // 1. IDB cache check
    const cached = await DB.wordDataGet(word, dir);
    if (cached) return cached;

    // 2. Fetch from data chunk
    const letter = getLetter(word);
    const url = `/data/${dir}/data/${letter}.json`;

    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) return null;

      const chunk = await res.json();
      // Find the entry in the chunk
      const entry = chunk.find(e => e.w === word);
      if (!entry) return null;

      // Cache it for next time
      await DB.wordDataPut(entry, dir);
      return entry;
    } catch (e) {
      console.error(`[search] lookup fetch error for "${word}":`, e);
      return null;
    }
  }

  // ── Helper: word → chunk letter ────────────────────────────────────────────
  const UMLAUT_MAP = {
    '\u00e4': 'a', '\u00f6': 'o', '\u00fc': 'u', '\u00df': 's',
    '\u00c4': 'a', '\u00d6': 'o', '\u00dc': 'u',
  };

  function getLetter(word) {
    if (!word) return 'misc';
    const first = word[0].toLowerCase();
    if (first >= 'a' && first <= 'z') return first;
    return UMLAUT_MAP[word[0]] || 'misc';
  }

  // ── Expose ─────────────────────────────────────────────────────────────────
  return { query, lookup, detectDir, isSeeded, seed };
})();

window.Search = Search;
