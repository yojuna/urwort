/* app.js — main application: init, routing, event wiring */

(async () => {

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    dir:          localStorage.getItem('urwort:dir') || 'de-en',
    currentEntry: null,
    bookmarkedSet: new Set(), // 'word|dir' keys for O(1) lookup in result cards
  };

  // ── Routing ────────────────────────────────────────────────────────────────
  const PAGES = ['search', 'history', 'bookmarks', 'resources'];

  function showPage(name) {
    if (!PAGES.includes(name)) name = 'search';
    PAGES.forEach(p => {
      document.getElementById('page-' + p).classList.toggle('active', p === name);
    });
    document.getElementById('page-detail').classList.remove('active');
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === name);
    });
    if (name === 'history')   loadHistory();
    if (name === 'bookmarks') loadBookmarks();
  }

  function handleHash() {
    const hash = location.hash.replace('#', '') || 'search';
    if (hash === 'detail') {
      PAGES.forEach(p => document.getElementById('page-' + p).classList.remove('active'));
      document.getElementById('page-detail').classList.add('active');
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    } else {
      document.getElementById('page-detail').classList.remove('active');
      showPage(hash);
    }
  }

  window.addEventListener('hashchange', handleHash);
  handleHash();

  // ── Direction toggle ───────────────────────────────────────────────────────
  function setDir(dir) {
    state.dir = dir;
    localStorage.setItem('urwort:dir', dir);
    document.getElementById('btn-de-en').classList.toggle('active', dir === 'de-en');
    document.getElementById('btn-en-de').classList.toggle('active', dir === 'en-de');
    const q = document.getElementById('search-input').value;
    if (q.length >= 2) runSearch(q);
  }

  document.getElementById('btn-de-en').addEventListener('click', () => setDir('de-en'));
  document.getElementById('btn-en-de').addEventListener('click', () => setDir('en-de'));
  setDir(state.dir);

  // ── Bookmark set (for result-card star icons) ──────────────────────────────
  async function refreshBookmarkSet() {
    const all = await DB.bookmarksGetAll();
    state.bookmarkedSet = new Set(all.map(b => b.id));
  }
  await refreshBookmarkSet();

  // ── Search input ───────────────────────────────────────────────────────────
  const searchInput = document.getElementById('search-input');
  const clearBtn    = document.getElementById('search-clear');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value;
    clearBtn.hidden = q.length === 0;
    if (q.length === 0) UI.hideSuggestions();
    // Auto-detect DE input via umlaut chars
    const detected = Search.detectDir(q);
    if (detected && detected !== state.dir) setDir(detected);
    runSearch(q);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.hidden   = true;
    UI.hideSuggestions();
    UI.renderResults(null, state.dir, state.bookmarkedSet);
    UI.setSearchStatus('');
    searchInput.focus();
  });

  // Dismiss dropdown when tapping outside
  document.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('.search-input-wrap')) UI.hideSuggestions();
  });

  function runSearch(q) {
    Search.query(q, state.dir, (status, results) => {
      if (status === 'loading') {
        UI.setSearchStatus('Searching…', true);
        return;
      }
      UI.renderResults(results, state.dir, state.bookmarkedSet);
      // Show dropdown only when input is focused and has text
      if (document.activeElement === searchInput && q.trim().length >= 2) {
        UI.renderSuggestions(results, q.trim(), state.dir);
      } else {
        UI.hideSuggestions();
      }
    });
  }

  // ── Suggestion clicks ──────────────────────────────────────────────────────
  document.getElementById('suggestions').addEventListener('pointerdown', (e) => {
    // pointerdown so we fire before the input blur hides the dropdown
    const item = e.target.closest('.suggestion-item');
    if (!item) return;
    e.preventDefault(); // keep input focus
    const { word, dir } = item.dataset;
    UI.hideSuggestions();
    searchInput.value = word;
    clearBtn.hidden = false;
    openDetail(word, dir);
  });

  // ── Result card clicks ─────────────────────────────────────────────────────
  document.getElementById('results-list').addEventListener('click', async (e) => {
    const bmBtn = e.target.closest('.result-bookmark-btn');
    if (bmBtn) {
      e.stopPropagation();
      await toggleBookmark(bmBtn.dataset.word, bmBtn.dataset.dir);
      return;
    }
    const card = e.target.closest('.result-card');
    if (card) openDetail(card.dataset.word, card.dataset.dir);
  });

  ['history-list', 'bookmarks-list'].forEach(listId => {
    document.getElementById(listId).addEventListener('click', (e) => {
      const card = e.target.closest('.result-card');
      if (card) openDetail(card.dataset.word, card.dataset.dir);
    });
  });

  // ── Open word detail ───────────────────────────────────────────────────────
  async function openDetail(word, dir) {
    UI.hideSuggestions();
    await DB.historyAdd(word, dir);

    // Layer 2 cache check first (offline-forever after first view)
    let entry = await DB.wordCacheGet(word, dir);

    if (!entry) {
      // Not cached yet — fetch from chunk via worker
      entry = await Search.lookup(word, dir);
      if (entry) {
        // Persist to Layer 2 cache so it's available offline forever
        await DB.wordCachePut(entry, dir);
      } else {
        entry = { w: word, pos: '', gender: null, l1: { en: [], ex: [] } };
      }
    }

    state.currentEntry = { entry, dir };
    await UI.renderDetail(entry, dir);
    wireDetailBookmarkBtn(word, dir, entry);
    location.hash = 'detail';
  }

  function wireDetailBookmarkBtn(word, dir, entry) {
    const btn = document.getElementById('detail-bookmark-btn');
    if (!btn) return;
    // Replace node to remove stale listeners
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', async () => {
      await toggleBookmark(word, dir, entry);
      await UI.renderDetail(entry, dir);
      wireDetailBookmarkBtn(word, dir, entry);
    });
  }

  // ── Back button ────────────────────────────────────────────────────────────
  document.getElementById('back-btn').addEventListener('click', () => history.back());

  // ── Toggle bookmark ────────────────────────────────────────────────────────
  async function toggleBookmark(word, dir, entry) {
    const exists = await DB.bookmarkExists(word, dir);
    if (exists) {
      await DB.bookmarkRemove(word, dir);
      UI.toast('Bookmark removed');
    } else {
      // Use passed entry, or look it up, or fallback
      const e = entry
        || await DB.wordCacheGet(word, dir)
        || await Search.lookup(word, dir)
        || { w: word, pos: '', gender: null, l1: { en: [], ex: [] } };
      await DB.bookmarkAdd(e, dir);
      UI.toast('Bookmarked!');
    }
    await refreshBookmarkSet();
    const q = searchInput.value;
    if (q.length >= 2) runSearch(q);
  }

  // ── History page ───────────────────────────────────────────────────────────
  document.getElementById('clear-history-btn').addEventListener('click', async () => {
    await DB.historyClear();
    loadHistory();
    UI.toast('History cleared');
  });

  async function loadHistory() {
    const items = await DB.historyGetAll();
    UI.renderHistory(items);
  }

  // ── Bookmarks page ─────────────────────────────────────────────────────────
  async function loadBookmarks() {
    const items = await DB.bookmarksGetAll();
    UI.renderBookmarks(items);
  }

  // ── Service Worker registration ────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('[app] SW registration failed:', err);
    });
  }

})();
