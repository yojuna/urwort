/* db.js — Dexie-backed database (layered schema)
 *
 * Requires: vendor/dexie.min.js loaded before this file
 *
 * Schema v2 — three stores:
 *
 *   history   — recent searches (Layer 4 user data)
 *   bookmarks — saved words     (Layer 4 user data)
 *   wordCache — Layer 2/3 entry payloads cached after first API/file hit
 *               so they are available offline forever once viewed
 *
 * Entry shape (mirrors build-dict output):
 *   {
 *     id, w, pos, gender,
 *     meta: { freq, level },
 *     l1:  { en[], ex[] },
 *     sources: { freedict: { senses } }
 *   }
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

// ── History ──────────────────────────────────────────────────────────────────

/**
 * Record a search. Deduplicates by word+dir (keeps newest timestamp).
 */
async function historyAdd(word, dir) {
  // Compound index [word+dir] makes this dedup query fast
  await db.history.where('[word+dir]').equals([word, dir]).delete();
  return db.history.add({ word, dir, ts: Date.now() });
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

// ── Word cache (Layer 2 — offline-forever after first view) ──────────────────

/**
 * Cache a full entry after it's been loaded.
 * Called by app.js when a word detail is opened.
 */
async function wordCachePut(entry, dir) {
  return db.wordCache.put({
    id:       entry.w + '|' + dir,
    word:     entry.w,
    dir,
    entry,
    cachedAt: Date.now(),
  });
}

/**
 * Retrieve a cached entry. Returns null if not in cache.
 */
async function wordCacheGet(word, dir) {
  const row = await db.wordCache.get(word + '|' + dir);
  return row ? row.entry : null;
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
  // word cache
  wordCachePut,
  wordCacheGet,
};
