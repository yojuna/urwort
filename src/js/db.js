/* db.js — Dexie-backed database (layered schema v2)
 *
 * Requires: vendor/dexie.min.js loaded before this file
 *
 * Schema v4 — four stores:
 *
 *   wordIndex  — Layer 1: search index (word, pos, gender, hint) — seeded once
 *   wordData   — Layer 2: full entries (l1, sources) — lazy populated
 *   history    — Layer 4: recent searches (user data)
 *   bookmarks  — Layer 4: saved words (user data)
 *
 * Migration from v3:
 *   - wordCache → wordData (renamed, same structure)
 *   - wordIndex added (new, for search)
 */

const db = new Dexie('urwort');

// v1 definition kept so Dexie can migrate existing IndexedDB smoothly
db.version(1).stores({
  history:   '++id, word, dir, ts',
  bookmarks: 'id, word, dir',
  wordCache: 'id, word, dir, cachedAt',
});

// v2: add savedAt index to bookmarks (needed for orderBy('savedAt'))
db.version(2).stores({
  history:   '++id, word, dir, ts',
  bookmarks: 'id, word, dir, savedAt',
  wordCache: 'id, word, dir, cachedAt',
});

// v3: add compound indexes [word+dir] to silence Dexie perf warnings
//     and speed up dedup queries in historyAdd / bookmarkExists
db.version(3).stores({
  history:   '++id, word, dir, ts, [word+dir]',
  bookmarks: 'id, word, dir, savedAt, [word+dir]',
  wordCache: 'id, word, dir, cachedAt',
});

// v4: add wordIndex (Layer 1) and rename wordCache → wordData (Layer 2)
db.version(4).stores({
  wordIndex: 'id, word, dir, pos, [word+dir]',  // Layer 1: search index
  wordData:  'id, word, dir, cachedAt',         // Layer 2: full entries (renamed from wordCache)
  history:   '++id, word, dir, ts, [word+dir]',
  bookmarks: 'id, word, dir, savedAt, [word+dir]',
}).upgrade(async (tx) => {
  // Migrate wordCache → wordData
  const oldCache = await tx.table('wordCache').toArray();
  if (oldCache.length > 0) {
    await tx.table('wordData').bulkPut(oldCache.map(row => ({
      ...row,
      // Ensure entry structure matches v2 format (no id/meta fields)
    })));
  }
  // wordIndex will be populated by seeding (Step 3)
});

// ── History ──────────────────────────────────────────────────────────────────

/**
 * Record a search. Deduplicates by word+dir (keeps newest timestamp).
 * @param {string} word
 * @param {string} dir   'de-en' | 'en-de'
 * @param {string[]} [translations]  top-2 translations to show in history list
 */
async function historyAdd(word, dir, translations = []) {
  // Compound index [word+dir] makes this dedup query fast
  await db.history.where('[word+dir]').equals([word, dir]).delete();
  return db.history.add({ word, dir, translations, ts: Date.now() });
}

/**
 * Return history newest-first, up to `limit` entries.
 */
async function historyGetAll(limit = 100) {
  return db.history
    .orderBy('ts')
    .reverse()
    .limit(limit)
    .toArray();
}

async function historyClear() {
  return db.history.clear();
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

/**
 * Bookmark a word. Stores the full entry for offline display.
 * @param {object} entry  — full word entry object from dictionary
 * @param {string} dir    — 'de-en' | 'en-de'
 */
async function bookmarkAdd(entry, dir) {
  return db.bookmarks.put({
    id:    entry.w + '|' + dir,
    word:  entry.w,
    dir,
    entry,
    savedAt: Date.now(),
  });
}

async function bookmarkRemove(word, dir) {
  return db.bookmarks.delete(word + '|' + dir);
}

async function bookmarkExists(word, dir) {
  const count = await db.bookmarks.where({ id: word + '|' + dir }).count();
  return count > 0;
}

async function bookmarksGetAll() {
  return db.bookmarks.orderBy('savedAt').reverse().toArray();
}

// ── Word Index (Layer 1 — search) ────────────────────────────────────────────

/**
 * Get a single word from the index. Returns null if not found.
 * Used by history/bookmarks to get hint translations.
 */
async function wordIndexGet(word, dir) {
  const row = await db.wordIndex.get(word + '|' + dir);
  return row || null;
}

/**
 * Query the index by prefix. Used for search.
 * @param {string} query  — prefix to match (e.g. "sch")
 * @param {string} dir    — 'de-en' | 'en-de'
 * @param {number} limit  — max results (default 20)
 */
async function wordIndexQuery(query, dir, limit = 20) {
  const q = query.trim();
  if (q.length < 1) return [];
  
  // Simple prefix search (case-sensitive for now; will enhance in Step 4)
  // For case-insensitive, we'll need to store wordLower as an indexed field
  const results = await db.wordIndex
    .where('word')
    .startsWith(q)
    .filter(row => row.dir === dir)
    .limit(limit)
    .toArray();
  
  // If no results and query is lowercase, try capitalized
  if (results.length === 0 && q[0] >= 'a' && q[0] <= 'z') {
    const qCap = q[0].toUpperCase() + q.slice(1);
    return db.wordIndex
      .where('word')
      .startsWith(qCap)
      .filter(row => row.dir === dir)
      .limit(limit)
      .toArray();
  }
  
  return results;
}

/**
 * Seed the index from JSON chunks. Called by seeding worker.
 * @param {Array} entries  — array of index entries from chunk (format: {w, pos, gender, hint})
 * @param {string} dir      — 'de-en' | 'en-de'
 */
async function wordIndexSeed(entries, dir) {
  // Build rows with id = "word|dir"
  const rows = entries.map(e => ({
    id:     e.w + '|' + dir,
    word:   e.w,
    dir,
    pos:    e.pos || '',
    gender: e.gender || null,
    hint:   e.hint || '',
  }));
  
  // Bulk add (Dexie handles duplicates by id)
  return db.wordIndex.bulkPut(rows);
}

// ── Word Data (Layer 2 — full entries, lazy populated) ────────────────────────

/**
 * Store a full entry. Called when a word detail is opened for the first time.
 * @param {object} entry  — full entry with l1, sources
 * @param {string} dir    — 'de-en' | 'en-de'
 */
async function wordDataPut(entry, dir) {
  return db.wordData.put({
    id:       entry.w + '|' + dir,
    word:     entry.w,
    dir,
    pos:      entry.pos || '',
    gender:   entry.gender || null,
    l1:       entry.l1 || { en: [], ex: [] },
    sources:  entry.sources || {},
    cachedAt: Date.now(),
  });
}

/**
 * Retrieve a full entry. Returns null if not cached.
 */
async function wordDataGet(word, dir) {
  const row = await db.wordData.get(word + '|' + dir);
  if (!row) return null;
  
  // Return in the same format as build-dict output
  return {
    w:      row.word,
    pos:    row.pos,
    gender: row.gender,
    l1:     row.l1,
    sources: row.sources,
  };
}

// ── Backward compatibility (deprecated, will be removed after Step 5) ──────────

async function wordCacheGet(word, dir) {
  return wordDataGet(word, dir);
}

async function wordCachePut(entry, dir) {
  return wordDataPut(entry, dir);
}

// ── Expose as global ──────────────────────────────────────────────────────────

window.DB = {
  // history
  historyAdd,
  historyGetAll,
  historyClear,
  // bookmarks
  bookmarkAdd,
  bookmarkRemove,
  bookmarkExists,
  bookmarksGetAll,
  // word index (Layer 1)
  wordIndexGet,
  wordIndexQuery,
  wordIndexSeed,
  // word data (Layer 2)
  wordDataGet,
  wordDataPut,
  // backward compatibility (deprecated)
  wordCacheGet,
  wordCachePut,
};
