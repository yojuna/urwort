/* ui.js — DOM rendering helpers
   All direct DOM manipulation lives here.
   app.js wires events; ui.js renders output.
*/

const UI = (() => {

  // ---- Toast ----
  let toastTimer = null;
  function toast(msg, duration = 2200) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  // ---- Gender label ----
  const GENDER_LABEL = { m: 'der', f: 'die', n: 'das' };
  function genderBadge(gender) {
    if (!gender) return '';
    return `<span class="result-gender">${GENDER_LABEL[gender] || gender}</span>`;
  }

  // ---- Suggestions dropdown ----
  const MAX_SUGGESTIONS = 5;

  // Highlight the query string inside the word (case-insensitive)
  function highlightMatch(word, q) {
    const idx = word.toLowerCase().indexOf(q.toLowerCase());
    if (idx === -1) return word;
    return word.slice(0, idx)
      + `<mark>${word.slice(idx, idx + q.length)}</mark>`
      + word.slice(idx + q.length);
  }

  function renderSuggestions(entries, q, dir) {
    const el = document.getElementById('suggestions');
    if (!entries || entries.length === 0) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    const top = entries.slice(0, MAX_SUGGESTIONS);
    el.innerHTML = top.map(entry => {
      const trans = (entry.l1?.en || []).slice(0, 2).join(', ');
      const gender = entry.gender ? ` <span style="color:var(--accent);font-size:0.75rem">${{ m:'der', f:'die', n:'das' }[entry.gender]}</span>` : '';
      return `<li class="suggestion-item" role="option"
                  data-word="${entry.w}" data-dir="${dir}">
        <span class="suggestion-word">${highlightMatch(entry.w, q)}${gender}</span>
        <span class="suggestion-meta">${trans}</span>
      </li>`;
    }).join('');
    el.hidden = false;
  }

  function hideSuggestions() {
    const el = document.getElementById('suggestions');
    el.hidden = true;
    el.innerHTML = '';
  }

  const MAX_RESULTS = 5;

  // ---- Render a list of result cards ----
  function renderResults(entries, dir, bookmarkedSet) {
    const list = document.getElementById('results-list');
    const status = document.getElementById('search-status');

    if (entries === null) {
      list.innerHTML = '';
      status.textContent = '';
      return;
    }

    if (entries.length === 0) {
      list.innerHTML = `<li class="empty-msg">No results found.</li>`;
      status.textContent = '';
      return;
    }

    const total = entries.length;
    const shown = entries.slice(0, MAX_RESULTS);
    status.textContent = total > MAX_RESULTS
      ? `${total} results — showing top ${MAX_RESULTS}`
      : `${total} result${total !== 1 ? 's' : ''}`;

    list.innerHTML = shown.map(entry => {
      const isBookmarked = bookmarkedSet.has(entry.w + '|' + dir);
      const trans = (entry.l1?.en || []).slice(0, 3).join(', ');
      return `
        <li class="result-card" data-word="${entry.w}" data-dir="${dir}">
          <div class="result-left">
            <div class="result-word">
              ${entry.w}
              ${genderBadge(entry.gender)}
              <span class="result-pos">${entry.pos || ''}</span>
            </div>
            <div class="result-translations">${trans}</div>
          </div>
          <button class="result-bookmark-btn ${isBookmarked ? 'bookmarked' : ''}"
                  data-word="${entry.w}" data-dir="${dir}"
                  aria-label="${isBookmarked ? 'Remove bookmark' : 'Bookmark'}"
                  title="${isBookmarked ? 'Remove bookmark' : 'Bookmark'}">
            ${isBookmarked ? '🔖' : '🔖'}
          </button>
        </li>`;
    }).join('');
  }

  function setSearchStatus(msg, loading = false) {
    const el = document.getElementById('search-status');
    el.innerHTML = loading
      ? `<span class="spinner"></span>${msg}`
      : msg;
  }

  // ---- Render word detail page ----
  async function renderDetail(entry, dir) {
    const isBookmarked = await DB.bookmarkExists(entry.w, dir);
    const translationLabel = dir === 'de-en' ? 'English translations' : 'German translations';
    const dirLabel         = dir === 'de-en' ? '🇩🇪 → 🇬🇧' : '🇬🇧 → 🇩🇪';

    const html = `
      <div class="detail-word">${entry.w}</div>
      <div class="detail-meta">
        ${entry.gender ? `<span class="badge badge-accent">${GENDER_LABEL[entry.gender] || entry.gender}</span>` : ''}
        ${entry.pos    ? `<span class="badge">${entry.pos}</span>` : ''}
        <span class="badge">${dirLabel}</span>
      </div>

      <div class="detail-section-title">${translationLabel}</div>
      <div class="detail-translations">
        ${(entry.l1?.en || []).map(t => `<span class="translation-chip">${t}</span>`).join('')}
      </div>

      ${entry.l1?.ex && entry.l1.ex.length ? `
        <div class="detail-section-title">Examples</div>
        <div class="detail-examples">
          ${entry.l1.ex.map(e => `<div class="example-item">${e}</div>`).join('')}
        </div>` : ''}

      <button class="bookmark-detail-btn ${isBookmarked ? 'bookmarked' : ''}"
              id="detail-bookmark-btn"
              data-word="${entry.w}" data-dir="${dir}">
        ${isBookmarked ? '🔖 Bookmarked' : '🔖 Bookmark this word'}
      </button>`;

    document.getElementById('word-detail').innerHTML = html;
  }

  // ---- Render history list ----
  function renderHistory(items) {
    const list  = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');
    if (!items.length) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = items.map(item => `
      <li class="result-card" data-word="${item.word}" data-dir="${item.dir}">
        <div class="result-left">
          <div class="result-word">${item.word}</div>
          <div class="result-translations">${item.dir === 'de-en' ? 'DE → EN' : 'EN → DE'}</div>
        </div>
      </li>`).join('');
  }

  // ---- Render bookmarks list ----
  function renderBookmarks(items) {
    const list  = document.getElementById('bookmarks-list');
    const empty = document.getElementById('bookmarks-empty');
    if (!items.length) {
      list.innerHTML = '';
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    list.innerHTML = items.map(item => `
      <li class="result-card" data-word="${item.word}" data-dir="${item.dir}">
        <div class="result-left">
          <div class="result-word">
            ${item.word}
            ${genderBadge(item.entry?.gender)}
            <span class="result-pos">${item.entry?.pos || ''}</span>
          </div>
          <div class="result-translations">${(item.entry?.l1?.en || []).join(', ')}</div>
        </div>
      </li>`).join('');
  }

  return {
    toast,
    renderResults,
    renderSuggestions,
    hideSuggestions,
    setSearchStatus,
    renderDetail,
    renderHistory,
    renderBookmarks,
  };
})();

window.UI = UI;
