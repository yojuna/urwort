/* search.worker.js — Web Worker: all dictionary search logic runs here
 *
 * Runs off the main thread so searching 30k-entry JSON chunks never
 * causes UI jank on older phones.
 *
 * Protocol — main thread posts:
 *   { type: 'SEARCH', id, query, dir }
 *   { type: 'LOOKUP', id, word,  dir }
 *
 * Worker replies:
 *   { type: 'SEARCH_RESULT', id, status: 'loading' | 'done', results[] }
 *   { type: 'LOOKUP_RESULT', id, entry | null }
 *   { type: 'ERROR',         id, message }
 *
 * The worker is PWA-safe: it uses self.fetch which is available in
 * dedicated workers and is intercepted by the Service Worker cache.
 */

'use strict';

// ── In-memory chunk cache (persists for the worker's lifetime = tab session) ──
const chunkCache = new Map(); // key: "dir:letter" → entry[]

// ── Umlaut map for German letters that share a base letter chunk ──────────────
const UMLAUT_MAP = {
  'ä': 'a', 'ö': 'o', 'ü': 'u', 'ß': 's',
  'Ä': 'a', 'Ö': 'o', 'Ü': 'u',
};

function chunkLetter(char) {
  const c = char.toLowerCase();
  return UMLAUT_MAP[char] || (c >= 'a' && c <= 'z' ? c : 'misc');
}

// ── Fetch a letter chunk (cache-first within the worker) ──────────────────────
async function loadChunk(dir, letter) {
  const key = `${dir}:${letter}`;
  if (chunkCache.has(key)) return chunkCache.get(key);

  const url = `/data/${dir}/${letter}.json`;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[worker] chunk not found: ${url} (${res.status})`);
      chunkCache.set(key, []);
      return [];
    }
    // Guard: nginx SPA fallback returns text/html for missing paths
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('json')) {
      console.error(`[worker] expected JSON but got "${ct}" for ${url}`);
      chunkCache.set(key, []);
      return [];
    }
    const data = await res.json();
    chunkCache.set(key, data);
    return data;
  } catch (err) {
    console.error(`[worker] failed to load chunk ${url}:`, err);
    chunkCache.set(key, []);
    return [];
  }
}

// ── Scoring: exact(3) > prefix(2) > substring(1) ─────────────────────────────
function score(wordLower, q) {
  if (wordLower === q)          return 3;
  if (wordLower.startsWith(q))  return 2;
  if (wordLower.includes(q))    return 1;
  return 0;
}

// ── Filter + rank a loaded chunk ──────────────────────────────────────────────
function filterChunk(entries, q) {
  const results = [];
  for (const entry of entries) {
    const s = score(entry.w.toLowerCase(), q);
    if (s > 0) results.push({ entry, score: s });
  }
  results.sort((a, b) =>
    b.score - a.score ||
    a.entry.w.localeCompare(b.entry.w, undefined, { sensitivity: 'base' })
  );
  return results.map(r => r.entry);
}

// ── Debounce state ────────────────────────────────────────────────────────────
let debounceTimer = null;
const DEBOUNCE_MS = 200;

// ── Message handler ───────────────────────────────────────────────────────────
self.onmessage = function (e) {
  const msg = e.data;

  switch (msg.type) {

    case 'SEARCH': {
      clearTimeout(debounceTimer);
      const { id, query: rawQuery, dir } = msg;
      const q = rawQuery.trim().toLowerCase();

      if (q.length < 2) {
        self.postMessage({ type: 'SEARCH_RESULT', id, status: 'done', results: [] });
        return;
      }

      // Post 'loading' immediately so the UI can show a spinner
      self.postMessage({ type: 'SEARCH_RESULT', id, status: 'loading', results: [] });

      debounceTimer = setTimeout(async () => {
        try {
          const letter  = chunkLetter(q[0]);
          const entries = await loadChunk(dir, letter);
          const results = filterChunk(entries, q);
          self.postMessage({ type: 'SEARCH_RESULT', id, status: 'done', results });
        } catch (err) {
          self.postMessage({ type: 'ERROR', id, message: err.message });
        }
      }, DEBOUNCE_MS);
      break;
    }

    case 'LOOKUP': {
      // Immediate, no debounce — used when opening word detail
      const { id, word, dir } = msg;
      (async () => {
        try {
          const letter  = chunkLetter(word[0]);
          const entries = await loadChunk(dir, letter);
          const entry   = entries.find(
            e => e.w.toLowerCase() === word.toLowerCase()
          ) || null;
          self.postMessage({ type: 'LOOKUP_RESULT', id, entry });
        } catch (err) {
          self.postMessage({ type: 'ERROR', id, message: err.message });
        }
      })();
      break;
    }

    default:
      console.warn('[search.worker] Unknown message type:', msg.type);
  }
};
