/* app.js — main application: init, routing, event wiring (v2) */

(async () => {

  // ── Seeding: run before anything else ─────────────────────────────────────
  if (!Search.isSeeded()) {
    const overlay   = document.getElementById('seed-overlay');
    const bar       = document.getElementById('seed-bar');
    const statusEl  = document.getElementById('seed-status');

    overlay.hidden = false;

    try {
      await Search.seed(({ done, total, letter, dir }) => {
        const pct = Math.round((done / total) * 100);
        bar.style.width = pct + '%';
        statusEl.textContent = `${dir}  /  ${letter}.json  (${done}/${total})`;
      });
    } catch (err) {
      // Seeding failed (e.g. offline on first launch)
      statusEl.textContent = 'Failed to build dictionary. Please connect to the internet and reload.';
      console.error('[app] seeding error:', err);
      // Leave overlay visible — app is unusable without index
      return;
    }

    overlay.hidden = true;
  }

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    dir:          localStorage.getItem('urwort:dir') || 'de-en',
    currentEntry: null,
    bookmarkedSet: new Set(), // 'word|dir' keys for O(1) lookup in result cards
  };

  // ── Routing ────────────────────────────────────────────────────────────────
  const PAGES = ['search', 'history', 'bookmarks', 'resources', 'settings'];

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
    // Auto-detect DE input via umlaut chars
    const detected = Search.detectDir(q);
    if (detected && detected !== state.dir) setDir(detected);
    runSearch(q);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.hidden   = true;
    UI.renderResults(null, state.dir, state.bookmarkedSet);
    UI.setSearchStatus('');
    searchInput.focus();
  });

  function runSearch(q) {
    Search.query(q, state.dir, (status, results) => {
      if (status === 'loading') {
        UI.setSearchStatus('Searching…', true);
        return;
      }
      UI.renderResults(results, state.dir, state.bookmarkedSet);
    });
  }

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
    if (!word || !dir) {
      console.error('[app] openDetail: missing word or dir', { word, dir });
      return;
    }

    // 1. Check wordData IDB cache (instant if previously opened)
    let entry = await DB.wordDataGet(word, dir);
    console.log('[app] openDetail: wordDataGet result', { word, dir, entry });

    if (!entry) {
      // 2. Not in IDB — fetch from data chunk and cache it (Layer 2)
      entry = await Search.lookup(word, dir);
      console.log('[app] openDetail: Search.lookup result', { word, dir, entry });
      
      if (!entry) {
        // Fallback: at minimum show the index row data
        const indexRow = await DB.wordIndexGet(word, dir);
        console.log('[app] openDetail: wordIndexGet fallback', { word, dir, indexRow });
        entry = {
          w:      word,
          pos:    indexRow?.pos    || '',
          gender: indexRow?.gender || null,
          l1:     { en: indexRow?.hint ? [indexRow.hint] : [], ex: [] },
        };
      }
    }

    if (!entry || !entry.w) {
      console.error('[app] openDetail: entry is invalid', { word, dir, entry });
      UI.toast('Word not found');
      return;
    }

    // Record in history with top-2 translations for quick display
    const translations = (entry.l1?.en || []).slice(0, 2);
    await DB.historyAdd(word, dir, translations);

    state.currentEntry = { entry, dir };
    await UI.renderDetail(entry, dir);
    wireDetailBookmarkBtn(word, dir, entry);
    location.hash = 'detail';
  }

  function wireDetailBookmarkBtn(word, dir, entry) {
    const btn = document.getElementById('detail-bookmark-btn');
    if (!btn) return;
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
      const e = entry
        || await DB.wordDataGet(word, dir)
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
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('[app] SW registration failed:', err);
    });
  }

})();
