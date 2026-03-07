/* search.js — dictionary search logic
   - Per-letter chunk loading (lazy, cached in memory for the session)
   - Bidirectional: de-en and en-de
   - Ranking: exact > prefix > substring
   - Debounce built-in via Search.query()
*/

const Search = (() => {
  // In-memory cache: 'de-en:h' → Array of entries
  const chunkCache = {};
  let debounceTimer = null;
  const DEBOUNCE_MS = 200;

  // ---- Language detection heuristic ----
  // If the input contains German-specific characters → assume de-en
  const DE_CHARS = /[äöüÄÖÜß]/;

  function detectDir(input) {
    return DE_CHARS.test(input) ? 'de-en' : null; // null = use current toggle
  }

  // ---- Chunk loader ----
  async function loadChunk(dir, letter) {
    const key = `${dir}:${letter}`;
    if (chunkCache[key]) return chunkCache[key];

    const url = `data/${dir}/${letter}.json`;
    try {
      const res = await fetch(url);
      if (!res.ok) { chunkCache[key] = []; return []; }
      const data = await res.json();
      chunkCache[key] = data;
      return data;
    } catch {
      chunkCache[key] = [];
      return [];
    }
  }

  // ---- Scoring ----
  function score(entry, q) {
    const w = entry.w.toLowerCase();
    if (w === q)           return 3; // exact
    if (w.startsWith(q))   return 2; // prefix
    if (w.includes(q))     return 1; // substring
    return 0;
  }

  // ---- Search in a loaded chunk ----
  function filterChunk(entries, q) {
    const results = [];
    for (const entry of entries) {
      const s = score(entry, q);
      if (s > 0) results.push({ entry, score: s });
    }
    results.sort((a, b) => b.score - a.score || a.entry.w.localeCompare(b.entry.w));
    return results.map(r => r.entry);
  }

  // ---- Public: run a search (debounced) ----
  function query(rawInput, dir, onResults) {
    clearTimeout(debounceTimer);
    const q = rawInput.trim().toLowerCase();
    if (q.length < 2) { onResults(null, []); return; }

    debounceTimer = setTimeout(async () => {
      const letter = q[0];
      onResults('loading', []);
      const entries = await loadChunk(dir, letter);
      const results = filterChunk(entries, q);
      onResults('done', results);
    }, DEBOUNCE_MS);
  }

  // ---- Public: immediate (no debounce), used for history/bookmark re-lookup ----
  async function lookup(word, dir) {
    const letter = word[0].toLowerCase();
    const entries = await loadChunk(dir, letter);
    return entries.find(e => e.w.toLowerCase() === word.toLowerCase()) || null;
  }

  return { query, lookup, detectDir };
})();

window.Search = Search;
