/* seed.worker.js — One-time dictionary seeding worker
 *
 * Runs on first launch only. Fetches slim index chunks and inserts
 * them into the wordIndex IndexedDB store via Dexie.
 *
 * Protocol — app.js posts:
 *   { type: 'START' }
 *
 * Worker replies:
 *   { type: 'PROGRESS', done, total, letter, dir }
 *   { type: 'COMPLETE' }
 *   { type: 'ERROR', message }
 *
 * The worker imports Dexie and db.js so it can write directly to IDB.
 * This is safe — IndexedDB is accessible from dedicated workers.
 */

'use strict';

importScripts('/js/vendor/dexie.min.js');

// ---------------------------------------------------------------------------
// Inline minimal Dexie schema (mirrors db.js v4 wordIndex store only)
// We can't import db.js because it references `window` (DOM API).
// ---------------------------------------------------------------------------

const db = new Dexie('urwort');

db.version(1).stores({
  history:   '++id, word, dir, ts',
  bookmarks: 'id, word, dir',
  wordCache: 'id, word, dir, cachedAt',
});
db.version(2).stores({
  history:   '++id, word, dir, ts',
  bookmarks: 'id, word, dir, savedAt',
  wordCache: 'id, word, dir, cachedAt',
});
db.version(3).stores({
  history:   '++id, word, dir, ts, [word+dir]',
  bookmarks: 'id, word, dir, savedAt, [word+dir]',
  wordCache: 'id, word, dir, cachedAt',
});
db.version(4).stores({
  wordIndex: 'id, word, dir, pos, [word+dir]',
  wordData:  'id, word, dir, cachedAt',
  history:   '++id, word, dir, ts, [word+dir]',
  bookmarks: 'id, word, dir, savedAt, [word+dir]',
});

// ---------------------------------------------------------------------------
// Letters + directions to seed
// ---------------------------------------------------------------------------

const LETTERS = [
  'a','b','c','d','e','f','g','h','i','j','k','l','m',
  'n','o','p','q','r','s','t','u','v','w','x','y','z','misc'
];
const DIRS = ['de-en', 'en-de'];

// Total tasks: 27 letters x 2 directions = 54 fetches
const TOTAL = LETTERS.length * DIRS.length;

// ---------------------------------------------------------------------------
// Checkpoint management (resume after refresh)
// Uses IndexedDB since localStorage isn't available in workers
// ---------------------------------------------------------------------------

const CHECKPOINT_STORE = 'seedCheckpoint';

// Add checkpoint store to Dexie schema
db.version(5).stores({
  wordIndex: 'id, word, dir, pos, [word+dir]',
  wordData:  'id, word, dir, cachedAt',
  history:   '++id, word, dir, ts, [word+dir]',
  bookmarks: 'id, word, dir, savedAt, [word+dir]',
  [CHECKPOINT_STORE]: 'key',  // key = 'chunk-{dir}-{letter}'
});

function getChunkKey(dir, letter) {
  return `chunk-${dir}-${letter}`;
}

async function isChunkSeeded(dir, letter) {
  try {
    const key = getChunkKey(dir, letter);
    const count = await db[CHECKPOINT_STORE].where('key').equals(key).count();
    return count > 0;
  } catch {
    return false;
  }
}

async function markChunkSeeded(dir, letter) {
  try {
    const key = getChunkKey(dir, letter);
    await db[CHECKPOINT_STORE].put({ key });
  } catch (e) {
    console.warn('[seed] failed to save checkpoint:', e);
  }
}

async function getSeededCount() {
  try {
    return await db[CHECKPOINT_STORE].count();
  } catch {
    return 0;
  }
}

async function clearCheckpoint() {
  try {
    await db[CHECKPOINT_STORE].clear();
  } catch {}
}

// ---------------------------------------------------------------------------
// Seeding logic (with checkpoint/resume)
// ---------------------------------------------------------------------------

async function seedAll() {
  // Check how many chunks are already seeded
  let done = await getSeededCount();

  // If already fully seeded, skip
  if (done >= TOTAL) {
    self.postMessage({ type: 'COMPLETE' });
    return;
  }

  const resumed = done > 0;
  if (resumed) {
    self.postMessage({ type: 'PROGRESS', done, total: TOTAL, letter: '', dir: '', resumed: true });
  }

  for (const dir of DIRS) {
    for (const letter of LETTERS) {
      // Skip if already seeded
      if (await isChunkSeeded(dir, letter)) {
        continue;
      }

      const url = `/data/${dir}/index/${letter}.json`;
      let entries = [];
      let success = false;

      try {
        const res = await fetch(url);
        if (res.ok) {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('json')) {
            entries = await res.json();
            success = true;
          }
        }
      } catch (e) {
        // Network error — skip this chunk, continue seeding
        console.warn(`[seed] failed to fetch ${url}:`, e.message);
      }

      if (entries.length > 0) {
        // Build rows for wordIndex
        const rows = entries.map(e => ({
          id:     e.w + '|' + dir,
          word:   e.w,
          dir,
          pos:    e.pos    || '',
          gender: e.gender || null,
          hint:   e.hint   || '',
        }));

        try {
          await db.wordIndex.bulkPut(rows);
          // Only mark as seeded if bulkPut succeeded
          await markChunkSeeded(dir, letter);
          success = true;
        } catch (e) {
          console.error(`[seed] bulkPut error for ${dir}/${letter}:`, e.message);
        }
      }

      if (success) {
        done++;
      }

      self.postMessage({ type: 'PROGRESS', done, total: TOTAL, letter, dir, resumed });
    }
  }

  // Clear checkpoint on complete (cleanup)
  if (done >= TOTAL) {
    await clearCheckpoint();
    self.postMessage({ type: 'COMPLETE' });
  }
}

// ---------------------------------------------------------------------------
// Message handler
// ---------------------------------------------------------------------------

self.onmessage = function (e) {
  if (e.data.type === 'START') {
    seedAll().catch(err => {
      self.postMessage({ type: 'ERROR', message: err.message });
    });
  }
};
