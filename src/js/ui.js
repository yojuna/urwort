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
      if (!entry || !entry.w) {
        console.warn('[ui] renderResults: invalid entry', entry);
        return '';
      }
      const isBookmarked = bookmarkedSet.has(entry.w + '|' + dir);
      // Index rows (from wordIndex IDB) have `hint`; full entries have `l1.en`
      const trans = entry.hint
        ? entry.hint
        : (entry.l1?.en || []).slice(0, 3).join(', ');
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

  // ---- Render Kaikki.org section (expandable card) ----
  function renderKaikkiSection(entry) {
    const kaikki = entry.sources?.kaikki;
    
    // No Kaikki data yet
    if (!kaikki) {
      return '';
    }

    // If attempted but failed (404, etc.)
    if (kaikki.attempted && !kaikki.entries) {
      return '';
    }

    // Has data — render expandable card
    const wordId = entry.w.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    const cardId = `kaikki-${wordId}`;
    
    let content = '';

    // Etymology
    if (kaikki.etymology) {
      content += `
        <div class="kaikki-item">
          <div class="kaikki-label">Etymology</div>
          <div class="kaikki-value">${escapeHtml(kaikki.etymology)}</div>
        </div>`;
    }

    // IPA pronunciation
    if (kaikki.ipa && kaikki.ipa.length > 0) {
      const uniqueIpa = [...new Set(kaikki.ipa)];
      content += `
        <div class="kaikki-item">
          <div class="kaikki-label">Pronunciation</div>
          <div class="kaikki-value">${uniqueIpa.map(ipa => `<span class="kaikki-ipa">/${escapeHtml(ipa)}/</span>`).join(' ')}</div>
        </div>`;
    }

    // Audio links
    if (kaikki.audio && kaikki.audio.length > 0) {
      const audioLinks = kaikki.audio.filter(Boolean).slice(0, 3); // Limit to 3
      content += `
        <div class="kaikki-item">
          <div class="kaikki-label">Audio</div>
          <div class="kaikki-value">
            ${audioLinks.map(url => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="kaikki-audio-link">🔊 Listen</a>`).join(' ')}
          </div>
        </div>`;
    }

    // Senses (definitions)
    if (kaikki.allSenses && kaikki.allSenses.length > 0) {
      content += `
        <div class="kaikki-item">
          <div class="kaikki-label">Definitions</div>
          <div class="kaikki-senses">
            ${kaikki.allSenses.map((sense, idx) => {
              const glosses = sense.glosses || sense.raw_glosses || [];
              const tags = sense.tags || [];
              const synonyms = sense.synonyms || [];
              return `
                <div class="kaikki-sense">
                  ${glosses.length > 0 ? `<div class="kaikki-gloss">${idx + 1}. ${glosses.map(g => escapeHtml(g)).join('; ')}</div>` : ''}
                  ${tags.length > 0 ? `<div class="kaikki-tags">${tags.map(t => `<span class="kaikki-tag">${escapeHtml(t)}</span>`).join(' ')}</div>` : ''}
                  ${synonyms.length > 0 ? `<div class="kaikki-synonyms">Synonyms: ${synonyms.map(s => escapeHtml(s)).join(', ')}</div>` : ''}
                </div>`;
            }).join('')}
          </div>
        </div>`;
    }

    // Inflected forms
    if (kaikki.allForms && kaikki.allForms.length > 0) {
      const forms = kaikki.allForms.slice(0, 10); // Limit to 10 forms
      content += `
        <div class="kaikki-item">
          <div class="kaikki-label">Forms</div>
          <div class="kaikki-value">${forms.map(f => {
            const form = typeof f === 'string' ? f : (f.form || f);
            return `<span class="kaikki-form">${escapeHtml(form)}</span>`;
          }).join(' ')}</div>
        </div>`;
    }

    if (!content) {
      return ''; // No content to show
    }

    return `
      <div class="kaikki-card">
        <button class="kaikki-toggle" id="${cardId}-toggle" aria-expanded="false" aria-controls="${cardId}-content">
          <span class="kaikki-toggle-icon">▶</span>
          <span class="kaikki-toggle-label">Kaikki.org (Wiktionary)</span>
        </button>
        <div class="kaikki-content" id="${cardId}-content" hidden>
          ${content}
        </div>
      </div>`;
  }

  // Simple HTML escape helper
  function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // ---- Render word detail page ----
  async function renderDetail(entry, dir) {
    if (!entry || !entry.w) {
      console.error('[ui] renderDetail: invalid entry', { entry, dir });
      document.getElementById('word-detail').innerHTML = `
        <div class="detail-word">Error: Word data not found</div>
        <div class="detail-meta">Please try searching again.</div>
      `;
      return;
    }

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

      ${renderKaikkiSection(entry)}

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
    list.innerHTML = items.map(item => {
      const trans = (item.translations || []).join(', ');
      return `
      <li class="result-card" data-word="${item.word}" data-dir="${item.dir}">
        <div class="result-left">
          <div class="result-word">${item.word}</div>
          ${trans ? `<div class="result-translations">${trans}</div>` : ''}
        </div>
      </li>`;
    }).join('');
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
    setSearchStatus,
    renderDetail,
    renderHistory,
    renderBookmarks,
  };
})();

window.UI = UI;
