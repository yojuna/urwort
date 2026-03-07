/* db.js — thin IndexedDB wrapper
   Stores: search history + bookmarks
   DB name: urwort  version: 1
   Stores:
     history   { id (autoIncrement), word, dir, ts }
     bookmarks { id (word+dir key), word, dir, entry }
*/

const DB_NAME    = 'urwort';
const DB_VERSION = 1;

let _db = null;

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = e.target.result;

      if (!db.objectStoreNames.contains('history')) {
        const hs = db.createObjectStore('history', { keyPath: 'id', autoIncrement: true });
        hs.createIndex('word', 'word', { unique: false });
        hs.createIndex('ts',   'ts',   { unique: false });
      }

      if (!db.objectStoreNames.contains('bookmarks')) {
        db.createObjectStore('bookmarks', { keyPath: 'id' });
      }
    };

    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror   = (e) => reject(e.target.error);
  });
}

// ---- generic helpers ----

function txStore(storeName, mode) {
  return openDB().then(db => {
    const tx    = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    return { tx, store };
  });
}

function promisifyReq(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

// ---- history ----

/**
 * Add a search to history (deduplicates by word+dir, keeps newest).
 * @param {string} word
 * @param {string} dir  'de-en' | 'en-de'
 */
async function historyAdd(word, dir) {
  const { store } = await txStore('history', 'readwrite');
  // remove any existing entry with same word+dir to avoid duplicates
  const idx     = store.index('word');
  const cursor  = await promisifyReq(idx.openCursor(IDBKeyRange.only(word)));
  if (cursor) {
    // walk cursor to find matching dir
    let c = cursor;
    while (c) {
      if (c.value.dir === dir) c.delete();
      c = await promisifyReq(c.continue()).catch(() => null);
    }
  }
  return promisifyReq(store.add({ word, dir, ts: Date.now() }));
}

/**
 * Get history, newest first, up to `limit` items.
 */
async function historyGetAll(limit = 100) {
  const { store } = await txStore('history', 'readonly');
  const idx = store.index('ts');
  return new Promise((resolve, reject) => {
    const results = [];
    const req = idx.openCursor(null, 'prev');
    req.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    req.onerror = () => reject(req.error);
  });
}

/**
 * Clear all history.
 */
async function historyClear() {
  const { store } = await txStore('history', 'readwrite');
  return promisifyReq(store.clear());
}

// ---- bookmarks ----

/**
 * @param {object} entry  full word entry object
 * @param {string} dir
 */
async function bookmarkAdd(entry, dir) {
  const { store } = await txStore('bookmarks', 'readwrite');
  return promisifyReq(store.put({ id: entry.w + '|' + dir, word: entry.w, dir, entry }));
}

async function bookmarkRemove(word, dir) {
  const { store } = await txStore('bookmarks', 'readwrite');
  return promisifyReq(store.delete(word + '|' + dir));
}

async function bookmarkExists(word, dir) {
  const { store } = await txStore('bookmarks', 'readonly');
  const result = await promisifyReq(store.get(word + '|' + dir));
  return result !== undefined;
}

async function bookmarksGetAll() {
  const { store } = await txStore('bookmarks', 'readonly');
  return promisifyReq(store.getAll());
}

// expose as global (no module bundler)
window.DB = {
  historyAdd,
  historyGetAll,
  historyClear,
  bookmarkAdd,
  bookmarkRemove,
  bookmarkExists,
  bookmarksGetAll,
};
