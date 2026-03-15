/* db.js — Dexie v2 schema (urwort2 DB) for API-backed architecture
 *
 * DB name: urwort2 (clean break from old chunk-based urwort DB)
 *
 * Stores:
 *   entries   — full entries cached from /api/entry/{id}
 *               keyed by "lemma|POS" (e.g. "Haus|NOUN")
 *   syncMeta  — sync cursor { key, value }
 *   history   — recent searches { lemma, hint, ts }
 *   bookmarks — saved entries   { id, lemma, entry, savedAt }
 */

const _db = new Dexie('urwort2');

_db.version(1).stores({
  entries:   'id, lemma, pos, updatedAt',
  syncMeta:  'key',
  history:   '++id, lemma, ts',
  bookmarks: 'id, lemma, savedAt',
});

// ── History ──────────────────────────────────────────────────────────────────

async function historyAdd(lemma, entry) {
  // Deduplicate by lemma (keep newest)
  await _db.history.where('lemma').equals(lemma).delete();
  return _db.history.add({
    lemma,
    hint: (entry?.translations || [])[0] || '',
    pos:  entry?.pos  || '',
    id:   entry?.id   || '',
    ts:   Date.now(),
  });
}

async function historyGetAll(limit = 100) {
  return _db.history.orderBy('ts').reverse().limit(limit).toArray();
}

async function historyClear() {
  return _db.history.clear();
}

// ── Bookmarks ─────────────────────────────────────────────────────────────────

async function bookmarkAdd(entry) {
  return _db.bookmarks.put({
    id:      entry.id,
    lemma:   entry.lemma,
    entry,
    savedAt: Date.now(),
  });
}

async function bookmarkRemove(id) {
  return _db.bookmarks.delete(id);
}

async function bookmarkExists(id) {
  const count = await _db.bookmarks.where('id').equals(id).count();
  return count > 0;
}

async function bookmarksGetAll() {
  return _db.bookmarks.orderBy('savedAt').reverse().toArray();
}

// ── Entries (full cached API responses) ──────────────────────────────────────

/**
 * Retrieve a cached entry by ID. Returns the full entry object (not a wrapper).
 */
async function entryGet(id) {
  const row = await _db.entries.get(id);
  return row ? row.data : null;
}

/**
 * Store a full entry received from the API.
 */
async function entryPut(entry) {
  return _db.entries.put({
    id:        entry.id,
    lemma:     entry.lemma,
    pos:       entry.pos,
    updatedAt: entry.updated_at || Date.now(),
    data:      entry,
  });
}

/**
 * Prefix-search on lemma (case-insensitive fallback to capitalised).
 * Returns array of full entry objects.
 */
async function entriesSearch(q, limit = 20) {
  const run = async (prefix) =>
    _db.entries.where('lemma').startsWith(prefix).limit(limit).toArray();

  let rows = await run(q);
  if (rows.length === 0 && q.length > 0) {
    const qCap = q[0].toUpperCase() + q.slice(1);
    if (qCap !== q) rows = await run(qCap);
  }
  return rows.map(r => r.data);
}

/**
 * Count all cached entries.
 */
async function entriesCount() {
  return _db.entries.count();
}

/**
 * Clear all cached entries (for cache-wipe from settings).
 */
async function entriesClear() {
  await _db.entries.clear();
}

// ── Sync Meta ─────────────────────────────────────────────────────────────────

async function getSyncCursor() {
  const row = await _db.syncMeta.get('last_sync_ts');
  return row ? parseInt(row.value, 10) : 0;
}

async function setSyncCursor(ts) {
  return _db.syncMeta.put({ key: 'last_sync_ts', value: String(ts) });
}

// ── Debug helpers ─────────────────────────────────────────────────────────────

async function debugInspect() {
  return {
    entries:   { count: await _db.entries.count(),   sample: await _db.entries.limit(2).toArray() },
    history:   { count: await _db.history.count(),   sample: await _db.history.limit(2).toArray() },
    bookmarks: { count: await _db.bookmarks.count(), sample: await _db.bookmarks.limit(2).toArray() },
    syncMeta:  { rows:  await _db.syncMeta.toArray() },
  };
}

// ── Expose ────────────────────────────────────────────────────────────────────

window.DB = {
  // History
  historyAdd,
  historyGetAll,
  historyClear,
  // Bookmarks
  bookmarkAdd,
  bookmarkRemove,
  bookmarkExists,
  bookmarksGetAll,
  // Entries
  entryGet,
  entryPut,
  entriesSearch,
  entriesCount,
  entriesClear,
  // Sync
  getSyncCursor,
  setSyncCursor,
  // Debug
  debug: { inspect: debugInspect },
};
