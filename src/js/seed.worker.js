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
// Seeding logic
// ---------------------------------------------------------------------------

async function seedAll() {
  let done = 0;

  for (const dir of DIRS) {
    for (const letter of LETTERS) {
      const url = `/data/${dir}/index/${letter}.json`;
      let entries = [];

      try {
        const res = await fetch(url);
        if (res.ok) {
          const ct = res.headers.get('content-type') || '';
          if (ct.includes('json')) {
            entries = await res.json();
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
        } catch (e) {
          console.error(`[seed] bulkPut error for ${dir}/${letter}:`, e.message);
        }
      }

      done++;
      self.postMessage({ type: 'PROGRESS', done, total: TOTAL, letter, dir });
    }
  }

  self.postMessage({ type: 'COMPLETE' });
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
