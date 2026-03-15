/* app.js — main application (v3: API-backed, no offline seeding) */

(async () => {

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    currentEntryId: null,
    bookmarkedSet:  new Set(),
    syncActive:     false,
  };

  // ── Routing ────────────────────────────────────────────────────────────────
  const PAGES = ['search', 'history', 'bookmarks', 'resources', 'settings'];

  function showPage(name) {
    if (!PAGES.includes(name)) name = 'search';
    PAGES.forEach(p => {
      document.getElementById('page-' + p)?.classList.toggle('active', p === name);
    });
    document.getElementById('page-detail')?.classList.remove('active');
    document.querySelectorAll('.nav-item').forEach(el =>
      el.classList.toggle('active', el.dataset.page === name)
    );
    if (name === 'history')   loadHistory();
    if (name === 'bookmarks') loadBookmarks();
    if (name === 'settings')  refreshSettingsPage();
  }

  function handleHash() {
    const hash = location.hash.replace('#', '') || 'search';
    if (hash === 'detail') {
      PAGES.forEach(p => document.getElementById('page-' + p)?.classList.remove('active'));
      document.getElementById('page-detail')?.classList.add('active');
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    } else {
      document.getElementById('page-detail')?.classList.remove('active');
      showPage(hash);
    }
  }

  window.addEventListener('hashchange', handleHash);
  handleHash();

  // ── Bookmark set ───────────────────────────────────────────────────────────
  async function refreshBookmarkSet() {
    const all = await DB.bookmarksGetAll();
    state.bookmarkedSet = new Set(all.map(b => b.id));
  }
  await refreshBookmarkSet();

  // ── Search ─────────────────────────────────────────────────────────────────
  const searchInput = document.getElementById('search-input');
  const clearBtn    = document.getElementById('search-clear');

  searchInput?.addEventListener('input', () => {
    const q = searchInput.value;
    clearBtn.hidden = q.length === 0;
    runSearch(q);
  });

  clearBtn?.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.hidden   = true;
    UI.renderResults([], state.bookmarkedSet);
    UI.setSearchStatus('');
    searchInput.focus();
  });

  function runSearch(q) {
    Search.query(q, ({ status, results, error }) => {
      if (status === 'loading') {
        UI.setSearchStatus('Searching…', true);
        return;
      }
      const list = results || [];
      UI.renderResults(list, state.bookmarkedSet);
      if (error) {
        UI.setSearchStatus(navigator.onLine ? 'Search error' : 'Offline — showing local results');
      } else {
        UI.setSearchStatus(
          list.length
            ? `${list.length} result${list.length !== 1 ? 's' : ''}`
            : q.trim().length >= 2 ? 'No results' : ''
        );
      }
    });
  }

  // ── Result card clicks ─────────────────────────────────────────────────────
  document.getElementById('results-list')?.addEventListener('click', async (e) => {
    const bmBtn = e.target.closest('.result-bookmark-btn');
    if (bmBtn) {
      e.stopPropagation();
      await toggleBookmark(bmBtn.dataset.id);
      return;
    }
    const card = e.target.closest('.result-card');
    if (card && card.dataset.id) openDetail(card.dataset.id);
  });

  ['history-list', 'bookmarks-list'].forEach(listId => {
    document.getElementById(listId)?.addEventListener('click', (e) => {
      const card = e.target.closest('.result-card');
      if (card && card.dataset.id) openDetail(card.dataset.id);
    });
  });

  // ── Open word detail ───────────────────────────────────────────────────────
  async function openDetail(id) {
    if (!id) return;

    // Switch to detail page and show spinner
    PAGES.forEach(p => document.getElementById('page-' + p)?.classList.remove('active'));
    document.getElementById('page-detail')?.classList.add('active');
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    location.hash = 'detail';

    const loadingEl = document.getElementById('detail-loading');
    if (loadingEl) loadingEl.hidden = false;
    document.getElementById('word-detail').innerHTML = '';

    try {
      const entry = await Search.getEntry(id);
      if (!entry) {
        UI.toast('Word not found');
        history.back();
        return;
      }

      state.currentEntryId = id;
      await DB.historyAdd(entry.lemma, entry);
      await UI.renderDetail(entry, state.bookmarkedSet);

      // Wire detail bookmark button
      wireDetailBookmarkBtn(id, entry);

    } catch (err) {
      console.error('[app] openDetail error:', err);
      UI.toast('Failed to load word');
      history.back();
    } finally {
      if (loadingEl) loadingEl.hidden = true;
    }
  }

  function wireDetailBookmarkBtn(id, entry) {
    const btn = document.getElementById('detail-bookmark-btn');
    if (!btn) return;
    // Clone to remove stale listeners
    const fresh = btn.cloneNode(true);
    btn.parentNode.replaceChild(fresh, btn);
    fresh.addEventListener('click', async () => {
      await toggleBookmark(id, entry);
    });
  }

  // ── Back button ────────────────────────────────────────────────────────────
  document.getElementById('back-btn')?.addEventListener('click', () => history.back());

  // ── Toggle bookmark ────────────────────────────────────────────────────────
  async function toggleBookmark(id, entry) {
    const exists = await DB.bookmarkExists(id);
    if (exists) {
      await DB.bookmarkRemove(id);
      UI.toast('Bookmark removed');
    } else {
      const e = entry || await DB.entryGet(id);
      if (e) await DB.bookmarkAdd(e);
      UI.toast('Bookmarked!');
    }
    await refreshBookmarkSet();
    // Re-render detail if still on same word
    if (state.currentEntryId === id) {
      const e = await DB.entryGet(id);
      if (e) {
        await UI.renderDetail(e, state.bookmarkedSet);
        wireDetailBookmarkBtn(id, e);
      }
    }
    const q = searchInput?.value || '';
    if (q.length >= 2) runSearch(q);
  }

  // ── History page ───────────────────────────────────────────────────────────
  document.getElementById('clear-history-btn')?.addEventListener('click', async () => {
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

  // ── Settings page ──────────────────────────────────────────────────────────
  async function refreshSettingsPage() {
    const count  = await DB.entriesCount();
    const cursor = await DB.getSyncCursor();
    const el = id => document.getElementById(id);
    if (el('setting-entry-count')) el('setting-entry-count').textContent = count.toLocaleString();
    if (el('setting-sync-cursor')) {
      el('setting-sync-cursor').textContent = cursor
        ? new Date(cursor).toLocaleString() : 'Never';
    }
    if (el('setting-sync-status')) {
      el('setting-sync-status').textContent = state.syncActive ? 'Syncing…' : (count > 0 ? 'Up to date' : 'Not synced');
    }
  }

  document.getElementById('btn-sync-now')?.addEventListener('click', async () => {
    UI.toast('Starting sync…');
    await startBackgroundSync(true);
    UI.toast('Sync complete');
    refreshSettingsPage();
  });

  document.getElementById('btn-clear-cache')?.addEventListener('click', async () => {
    if (!confirm('Clear all cached entries? You can re-sync at any time.')) return;
    await DB.entriesClear();
    await DB.setSyncCursor(0);
    UI.toast('Cache cleared');
    refreshSettingsPage();
  });

  // ── Background sync ────────────────────────────────────────────────────────
  async function startBackgroundSync(force = false) {
    if (state.syncActive) return;
    if (!navigator.onLine) return;

    state.syncActive = true;
    setSyncIndicator(true);

    try {
      await Search.sync(({ done }) => {
        const dot = document.getElementById('sync-dot');
        if (dot) dot.title = `Synced ${done.toLocaleString()} entries`;
      });
    } catch (e) {
      console.warn('[app] background sync error:', e);
    } finally {
      state.syncActive = false;
      setSyncIndicator(false);
    }
  }

  function setSyncIndicator(active) {
    const dot = document.getElementById('sync-dot');
    if (!dot) return;
    dot.hidden = !active;
    dot.classList.toggle('sync-dot-active', active);
  }

  // Kick off background sync after 1.5 s (allows app to render first)
  setTimeout(() => startBackgroundSync(), 1500);

  // ── Online / offline indicator ─────────────────────────────────────────────
  function updateOnlineStatus() {
    const bar = document.getElementById('offline-bar');
    if (bar) bar.hidden = navigator.onLine;
  }
  window.addEventListener('online',  updateOnlineStatus);
  window.addEventListener('offline', updateOnlineStatus);
  updateOnlineStatus();

  // ── Service Worker ─────────────────────────────────────────────────────────
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

})();
