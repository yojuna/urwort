/* search.js — API-first search with IDB fallback (v3)
 *
 * No offline seeding required. The API is the primary source.
 * IndexedDB is a cache that grows as entries are fetched/synced.
 *
 * Public API:
 *   Search.query(q, callback)         — debounced search
 *   Search.getEntry(id)               — full entry by ID (IDB → API)
 *   Search.sync(onProgress)           — background full sync (API → IDB)
 *   Search.detectDir(input)           — 'de-en' | null
 */

'use strict';

const Search = (() => {
  const API_BASE    = '/api';
  const DEBOUNCE_MS = 180;
  let debounceTimer = null;

  // ── Helpers ────────────────────────────────────────────────────────────────

  function detectDir(input) {
    return /[äöüÄÖÜß]/.test(input) ? 'de-en' : null;
  }

  // ── Search ─────────────────────────────────────────────────────────────────

  /**
   * Search for lemmas / inflected forms.
   * Strategy:
   *   1. Local IDB prefix match (instant if entries are cached)
   *   2. API /search?q=... (handles inflected forms, FTS5)
   *
   * callback is called with { status: 'loading'|'done', results, source }
   * where results is an array shaped like API /search results:
   *   { id, lemma, pos, gender, cefr_level, hint, matched_form? }
   */
  function query(q, callback) {
    const trimmed = q.trim();
    if (trimmed.length < 2) {
      clearTimeout(debounceTimer);
      callback({ status: 'done', results: [] });
      return;
    }

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      // 1. Local IDB (fast path when synced)
      try {
        const local = await DB.entriesSearch(trimmed, 15);
        if (local.length > 0) {
          // Normalize to search-result shape
          const results = local.map(e => ({
            id:         e.id,
            lemma:      e.lemma,
            pos:        e.pos,
            gender:     e.gender,
            cefr_level: e.cefr_level,
            hint:       (e.translations || [])[0] || '',
          }));
          callback({ status: 'done', results, source: 'local' });
          return;
        }
      } catch (e) {
        console.warn('[search] IDB error:', e);
      }

      // 2. API search (also catches inflected forms via SQL forms table)
      callback({ status: 'loading' });
      try {
        const res = await fetch(
          `${API_BASE}/search?q=${encodeURIComponent(trimmed)}`,
          { signal: AbortSignal.timeout(5000) }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        callback({ status: 'done', results: data.results || [], source: 'api' });
      } catch (e) {
        if (e.name === 'AbortError') {
          callback({ status: 'done', results: [], error: 'timeout' });
        } else {
          callback({ status: 'done', results: [], error: e.message });
        }
      }
    }, DEBOUNCE_MS);
  }

  // ── Full entry lookup ──────────────────────────────────────────────────────

  /**
   * Get a full entry by ID (e.g. "Haus|NOUN").
   * Checks IDB cache first; fetches from API on miss and caches the result.
   * @returns {Promise<object|null>}
   */
  async function getEntry(id) {
    // 1. IDB cache
    const cached = await DB.entryGet(id);
    if (cached) return cached;

    // 2. API
    try {
      const res = await fetch(
        `${API_BASE}/entry/${encodeURIComponent(id)}`,
        { signal: AbortSignal.timeout(8000) }
      );
      if (!res.ok) return null;
      const entry = await res.json();

      // Cache for next time
      await DB.entryPut(entry);
      return entry;
    } catch (e) {
      console.error('[search] getEntry error:', e);
      return null;
    }
  }

  // ── Background sync ────────────────────────────────────────────────────────

  /**
   * Page through /api/sync and write every entry into IDB.
   * Enables offline search once complete.
   *
   * @param {function} onProgress  called with { done, total, hasMore }
   * @returns {Promise<number>}  total entries synced in this session
   */
  async function sync(onProgress) {
    let cursor   = await DB.getSyncCursor();
    let total    = 0;
    let hasMore  = true;

    while (hasMore) {
      let data;
      try {
        const res = await fetch(
          `${API_BASE}/sync?since=${cursor}&limit=500`,
          { signal: AbortSignal.timeout(15000) }
        );
        if (!res.ok) break;
        data = await res.json();
      } catch (e) {
        console.error('[search] sync fetch error:', e);
        break;
      }

      if (!data.entries || data.entries.length === 0) break;

      // Batch write to IDB
      for (const entry of data.entries) {
        await DB.entryPut(entry);
      }
      total  += data.entries.length;
      cursor  = data.next_cursor || cursor;
      hasMore = !!data.has_more;

      await DB.setSyncCursor(cursor);

      if (onProgress) onProgress({ done: total, hasMore, cursor });

      // Yield to keep the UI responsive
      if (hasMore) await new Promise(r => setTimeout(r, 30));
    }

    return total;
  }

  // ── Expose ─────────────────────────────────────────────────────────────────
  return { query, getEntry, sync, detectDir };
})();

window.Search = Search;
