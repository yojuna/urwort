/* app.js — main application: init, routing, event wiring */

(async () => {

  // ---- State ----
  const state = {
    dir: localStorage.getItem('urwort:dir') || 'de-en',
    currentEntry: null,
    bookmarkedSet: new Set(), // 'word|dir' keys for fast lookup in result list
  };

  // ---- Routing ----
  const PAGES = ['search', 'history', 'bookmarks', 'resources'];

  function showPage(name) {
    if (!PAGES.includes(name)) name = 'search';
    PAGES.forEach(p => {
      document.getElementById('page-' + p).classList.toggle('active', p === name);
    });
    document.querySelectorAll('.nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === name);
    });

    if (name === 'history')   loadHistory();
    if (name === 'bookmarks') loadBookmarks();
  }

  function onHashChange() {
    const hash = location.hash.replace('#', '') || 'search';
    showPage(hash);
  }

  window.addEventListener('hashchange', onHashChange);
  onHashChange();

  // ---- Direction toggle ----
  function setDir(dir) {
    state.dir = dir;
    localStorage.setItem('urwort:dir', dir);
    document.getElementById('btn-de-en').classList.toggle('active', dir === 'de-en');
    document.getElementById('btn-en-de').classList.toggle('active', dir === 'en-de');
    // re-run search if input has content
    const q = document.getElementById('search-input').value;
    if (q.length >= 2) runSearch(q);
  }

  document.getElementById('btn-de-en').addEventListener('click', () => setDir('de-en'));
  document.getElementById('btn-en-de').addEventListener('click', () => setDir('en-de'));
  setDir(state.dir); // apply stored preference on load

  // ---- Load bookmarked set (for star icons in result list) ----
  async function refreshBookmarkSet() {
    const all = await DB.bookmarksGetAll();
    state.bookmarkedSet = new Set(all.map(b => b.id));
  }
  await refreshBookmarkSet();

  // ---- Search input ----
  const searchInput = document.getElementById('search-input');
  const clearBtn    = document.getElementById('search-clear');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value;
    clearBtn.hidden = q.length === 0;

    // Auto-detect language direction from umlaut chars
    const detected = Search.detectDir(q);
    if (detected && detected !== state.dir) setDir(detected);

    runSearch(q);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.hidden = true;
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

  // ---- Result card click → detail / bookmark ----
  document.getElementById('results-list').addEventListener('click', async (e) => {
    // Bookmark button
    const bmBtn = e.target.closest('.result-bookmark-btn');
    if (bmBtn) {
      e.stopPropagation();
      await toggleBookmark(bmBtn.dataset.word, bmBtn.dataset.dir);
      return;
    }

    // Card click → detail
    const card = e.target.closest('.result-card');
    if (card) {
      openDetail(card.dataset.word, card.dataset.dir);
    }
  });

  // ---- History / bookmarks list card click → detail ----
  ['history-list', 'bookmarks-list'].forEach(id => {
    document.getElementById(id).addEventListener('click', (e) => {
      const card = e.target.closest('.result-card');
      if (card) openDetail(card.dataset.word, card.dataset.dir);
    });
  });

  // ---- Open detail ----
  async function openDetail(word, dir) {
    // Save to history
    await DB.historyAdd(word, dir);

    let entry = await Search.lookup(word, dir);
    if (!entry) {
      // Fallback: build minimal entry from what we know
      entry = { w: word, pos: '', gender: null, en: [], ex: [] };
    }
    state.currentEntry = { entry, dir };
    await UI.renderDetail(entry, dir);

    // Wire the bookmark button on the detail page
    const btn = document.getElementById('detail-bookmark-btn');
    if (btn) {
      btn.addEventListener('click', async () => {
        await toggleBookmark(word, dir);
        // re-render detail to update button state
        await UI.renderDetail(entry, dir);
        const newBtn = document.getElementById('detail-bookmark-btn');
        newBtn.addEventListener('click', () => toggleBookmark(word, dir));
      });
    }

    location.hash = 'detail';
  }

  // ---- Hash for detail page (not in nav) ----
  const origShowPage = showPage;
  // Override to handle 'detail' hash
  window.removeEventListener('hashchange', onHashChange);
  window.addEventListener('hashchange', () => {
    const hash = location.hash.replace('#', '') || 'search';
    if (hash === 'detail') {
      PAGES.forEach(p => document.getElementById('page-' + p).classList.remove('active'));
      document.getElementById('page-detail').classList.add('active');
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    } else {
      document.getElementById('page-detail').classList.remove('active');
      showPage(hash);
    }
  });
  // Trigger initial routing
  (() => {
    const hash = location.hash.replace('#', '') || 'search';
    if (hash === 'detail') {
      document.getElementById('page-detail').classList.add('active');
    } else {
      showPage(hash);
    }
  })();

  // ---- Back button ----
  document.getElementById('back-btn').addEventListener('click', () => {
    history.back();
  });

  // ---- Toggle bookmark ----
  async function toggleBookmark(word, dir) {
    const exists = await DB.bookmarkExists(word, dir);
    if (exists) {
      await DB.bookmarkRemove(word, dir);
      UI.toast('Bookmark removed');
    } else {
      const entry = await Search.lookup(word, dir) || { w: word, pos: '', gender: null, en: [], ex: [] };
      await DB.bookmarkAdd(entry, dir);
      UI.toast('Bookmarked!');
    }
    await refreshBookmarkSet();
    // Refresh current results list bookmark icons if on search page
    const q = searchInput.value;
    if (q.length >= 2) runSearch(q);
  }

  // ---- Clear history ----
  document.getElementById('clear-history-btn').addEventListener('click', async () => {
    await DB.historyClear();
    loadHistory();
    UI.toast('History cleared');
  });

  // ---- Load history ----
  async function loadHistory() {
    const items = await DB.historyGetAll();
    UI.renderHistory(items);
  }

  // ---- Load bookmarks ----
  async function loadBookmarks() {
    const items = await DB.bookmarksGetAll();
    UI.renderBookmarks(items);
  }

  // ---- Register Service Worker ----
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('SW registration failed:', err);
    });
  }

})();
