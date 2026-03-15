/* ui.js — DOM rendering (v3)
 *
 * All direct DOM manipulation lives here.
 * app.js wires events; ui.js renders.
 *
 * Entry shape (from API /entry/{id}):
 *   id, lemma, pos, gender, ipa, audio_url, syllabification
 *   etymology, translations[], definitions_de[], senses[], examples[]
 *   inflections[], synonyms[], antonyms[], hypernyms[], hyponyms[]
 *   derived[], related[], collocations[], frequency_class, frequency_per_m
 *   cefr_level, rhymes, homophones[], proverbs[], wikidata_id, wikipedia
 *   compound_parts, case_government, auxiliary, verb_class
 *   usage_labels[], subject_domains[], sources{}
 *
 * Search result shape (from API /search):
 *   id, lemma, pos, gender, cefr_level, hint, matched_form?
 */

const UI = (() => {

  // ── Toast ──────────────────────────────────────────────────────────────────

  let toastTimer = null;

  function toast(msg, duration = 2200) {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), duration);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  const GENDER_LABEL = { m: 'der', f: 'die', n: 'das' };

  function escapeHtml(text) {
    if (text == null) return '';
    const d = document.createElement('div');
    d.textContent = String(text);
    return d.innerHTML;
  }

  function genderBadge(gender) {
    if (!gender) return '';
    const label = GENDER_LABEL[gender] || gender;
    return `<span class="badge badge-gender badge-${gender}">${label}</span>`;
  }

  function cefrBadge(level) {
    if (!level) return '';
    return `<span class="badge badge-cefr badge-cefr-${level.toLowerCase()}">${level}</span>`;
  }

  function posBadge(pos) {
    if (!pos) return '';
    return `<span class="badge badge-pos">${escapeHtml(pos)}</span>`;
  }

  function chip(text, cls = '') {
    return `<span class="chip ${cls}">${escapeHtml(text)}</span>`;
  }

  function safeArr(val) {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      try { return JSON.parse(val); } catch { return [val]; }
    }
    return [];
  }

  // ── Search status ──────────────────────────────────────────────────────────

  function setSearchStatus(msg, loading = false) {
    const el = document.getElementById('search-status');
    if (!el) return;
    el.innerHTML = loading
      ? `<span class="spinner"></span>${escapeHtml(msg)}`
      : escapeHtml(msg);
  }

  // ── Result list ────────────────────────────────────────────────────────────

  function renderResults(entries, bookmarkedSet) {
    const list = document.getElementById('results-list');
    if (!list) return;

    if (!entries || entries.length === 0) {
      list.innerHTML = '';
      return;
    }

    const shown = entries.slice(0, 8);
    list.innerHTML = shown.map(entry => {
      if (!entry || !entry.id) return '';
      const isBookmarked = bookmarkedSet.has(entry.id);
      // hint comes from search API; translations[0] comes from full entry
      const hint = entry.hint
        || (Array.isArray(entry.translations) ? entry.translations[0] : '')
        || '';
      const matchedForm = entry.matched_form
        ? `<span class="result-matched-form">↳ ${escapeHtml(entry.matched_form)}</span>` : '';
      return `
        <li class="result-card" data-id="${escapeHtml(entry.id)}">
          <div class="result-left">
            <div class="result-word">
              ${escapeHtml(entry.lemma)}
              ${genderBadge(entry.gender)}
              ${posBadge(entry.pos)}
              ${cefrBadge(entry.cefr_level)}
            </div>
            ${hint ? `<div class="result-hint">${escapeHtml(hint)}</div>` : ''}
            ${matchedForm}
          </div>
          <button class="result-bookmark-btn ${isBookmarked ? 'bookmarked' : ''}"
                  data-id="${escapeHtml(entry.id)}"
                  aria-label="${isBookmarked ? 'Remove bookmark' : 'Bookmark'}">
            🔖
          </button>
        </li>`;
    }).join('');
  }

  // ── History list ───────────────────────────────────────────────────────────

  function renderHistory(items) {
    const list  = document.getElementById('history-list');
    const empty = document.getElementById('history-empty');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = items.map(item => `
      <li class="result-card" data-id="${escapeHtml(item.id || '')}">
        <div class="result-left">
          <div class="result-word">${escapeHtml(item.lemma)}</div>
          ${item.hint ? `<div class="result-hint">${escapeHtml(item.hint)}</div>` : ''}
        </div>
      </li>`).join('');
  }

  // ── Bookmarks list ─────────────────────────────────────────────────────────

  function renderBookmarks(items) {
    const list  = document.getElementById('bookmarks-list');
    const empty = document.getElementById('bookmarks-empty');
    if (!list) return;
    if (!items.length) {
      list.innerHTML = '';
      if (empty) empty.hidden = false;
      return;
    }
    if (empty) empty.hidden = true;
    list.innerHTML = items.map(item => {
      const e = item.entry || {};
      const hint = (safeArr(e.translations))[0] || '';
      return `
        <li class="result-card" data-id="${escapeHtml(item.id)}">
          <div class="result-left">
            <div class="result-word">
              ${escapeHtml(item.lemma)}
              ${genderBadge(e.gender)}
              ${posBadge(e.pos)}
            </div>
            ${hint ? `<div class="result-hint">${escapeHtml(hint)}</div>` : ''}
          </div>
        </li>`;
    }).join('');
  }

  // ── Word Detail ────────────────────────────────────────────────────────────

  async function renderDetail(entry, bookmarkedSet) {
    const container = document.getElementById('word-detail');
    if (!container || !entry) return;

    const isBookmarked = bookmarkedSet.has(entry.id);

    const translations = safeArr(entry.translations);
    const definitions  = safeArr(entry.definitions_de);
    const senses       = safeArr(entry.senses);
    const examples     = safeArr(entry.examples);
    const inflections  = safeArr(entry.inflections);
    const synonyms     = safeArr(entry.synonyms);
    const antonyms     = safeArr(entry.antonyms);
    const derived      = safeArr(entry.derived);
    const related      = safeArr(entry.related);
    const usageLabels  = safeArr(entry.usage_labels);
    const domains      = safeArr(entry.subject_domains);

    // ── Header ───────────────────────────────────────────────────────────────

    const ipaHtml = entry.ipa
      ? `<span class="detail-ipa">[${escapeHtml(entry.ipa)}]</span>` : '';

    const audioHtml = entry.audio_url
      ? `<button class="detail-audio-btn" data-url="${escapeHtml(entry.audio_url)}"
                  title="Play pronunciation" aria-label="Play pronunciation">🔊</button>` : '';

    const syllabHtml = entry.syllabification
      ? `<span class="detail-syllabification">${escapeHtml(entry.syllabification)}</span>` : '';

    const verbMetaHtml = renderVerbMeta(entry);
    const labelsHtml   = usageLabels.length
      ? `<div class="detail-labels">${usageLabels.map(l => `<span class="label-chip">${escapeHtml(l)}</span>`).join('')}</div>`
      : '';
    const domainsHtml  = domains.length
      ? `<div class="detail-labels">${domains.map(d => `<span class="label-chip label-domain">${escapeHtml(d)}</span>`).join('')}</div>`
      : '';

    // ── Sections (collapsible) ────────────────────────────────────────────────

    const sections = [];

    // Translations — collapsible, chips wrap naturally
    if (translations.length) {
      const transHtml = `<div class="chip-row chip-row-wrap">${translations.map(t => chip(t, 'chip-translation')).join('')}</div>`;
      sections.push(collapsible('Translations · DE → EN', transHtml, 'trans', true));
    }

    // German definitions / senses
    const sensesHtml = renderSenses(senses, definitions);
    if (sensesHtml) {
      sections.push(collapsible('Definitions', sensesHtml, 'defs', true));
    }

    // Inflections
    const inflHtml = renderInflections(inflections, entry.pos);
    if (inflHtml) {
      sections.push(collapsible('Inflections', inflHtml, 'infl', true));
    }

    // Synonyms / Antonyms
    const synHtml = renderSynonyms(synonyms, antonyms);
    if (synHtml) {
      sections.push(collapsible('Synonyms & Antonyms', synHtml, 'syn'));
    }

    // Examples
    if (examples.length) {
      const exHtml = examples.slice(0, 8).map(ex => {
        if (typeof ex === 'string') return `<div class="example-item">${escapeHtml(ex)}</div>`;
        // Kaikki format: {de, en}
        const de  = ex.de || ex.text || ex.sentence || ex.example || '';
        const en  = ex.en || '';
        const src = ex.source ? `<span class="example-source">${escapeHtml(ex.source)}</span>` : '';
        return `<div class="example-item">${escapeHtml(de)}${en ? `<span class="example-translation"> — ${escapeHtml(en)}</span>` : ''}${src}</div>`;
      }).join('');
      sections.push(collapsible('Examples', `<div class="examples-list">${exHtml}</div>`, 'ex'));
    }

    // Etymology
    if (entry.etymology) {
      sections.push(collapsible('Etymology',
        `<p class="etymology-text">${escapeHtml(entry.etymology)}</p>`, 'etym'));
    }

    // Related / Derived
    const relHtml = renderRelated(derived, related, entry.compound_parts);
    if (relHtml) {
      sections.push(collapsible('Related Words', relHtml, 'rel'));
    }

    // Frequency & CEFR
    const freqHtml = renderFrequency(entry);
    if (freqHtml) {
      sections.push(collapsible('Frequency & Level', freqHtml, 'freq'));
    }

    // ── Assemble ─────────────────────────────────────────────────────────────

    container.innerHTML = `
      <div class="detail-header">
        <div class="detail-word-row">
          <h1 class="detail-word">${escapeHtml(entry.lemma)}</h1>
          <button class="bookmark-btn ${isBookmarked ? 'bookmarked' : ''}"
                  id="detail-bookmark-btn"
                  data-id="${escapeHtml(entry.id)}"
                  title="${isBookmarked ? 'Remove bookmark' : 'Bookmark'}">
            ${isBookmarked ? '🔖' : '🔖'}
          </button>
        </div>

        <div class="detail-phonetics">
          ${ipaHtml}${syllabHtml}${audioHtml}
        </div>

        <div class="detail-badges">
          ${genderBadge(entry.gender)}
          ${posBadge(entry.pos)}
          ${cefrBadge(entry.cefr_level)}
          ${verbMetaHtml}
        </div>

        ${labelsHtml}${domainsHtml}
      </div>

      <div class="detail-body">
        ${sections.join('\n')}
      </div>

      ${renderFooterLinks(entry)}
    `;

    // Wire audio buttons
    container.querySelectorAll('.detail-audio-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const url = btn.dataset.url;
        if (url) {
          const audio = new Audio(url);
          audio.play().catch(() => window.open(url, '_blank'));
        }
      });
    });

    // Wire collapsible toggles
    container.querySelectorAll('.collapsible-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = document.getElementById(btn.dataset.target);
        if (!target) return;
        const open = !target.hidden;
        target.hidden = open;
        btn.setAttribute('aria-expanded', String(!open));
        const icon = btn.querySelector('.collapsible-icon');
        if (icon) icon.textContent = open ? '▶' : '▼';
      });
    });

    // Wire synonym / related chips (click to search)
    container.querySelectorAll('.chip-clickable').forEach(chip => {
      chip.addEventListener('click', () => {
        const word = chip.dataset.word;
        if (!word) return;
        const input = document.getElementById('search-input');
        if (input) {
          input.value = word;
          input.dispatchEvent(new Event('input'));
          location.hash = 'search';
        }
      });
    });
  }

  // ── Senses / Definitions ───────────────────────────────────────────────────

  function senseExampleText(ex) {
    if (typeof ex === 'string') return ex;
    // Kaikki format: {de, en} or {text} or {sentence}
    return ex.de || ex.text || ex.sentence || '';
  }

  function renderSenses(senses, definitions) {
    const parts = [];

    // Structured senses (from Kaikki — have glosses + tags + examples)
    if (senses.length > 0) {
      const items = senses.slice(0, 12).map((s, i) => {
        if (typeof s === 'string') {
          return `<div class="sense-item"><span class="sense-num">${i + 1}</span><div class="sense-body"><div class="sense-gloss">${escapeHtml(s)}</div></div></div>`;
        }
        // glosses can be array or single string
        const glossArr = Array.isArray(s.glosses) ? s.glosses : (s.gloss ? [s.gloss] : []);
        const gloss    = glossArr.join('; ');
        const tags     = safeArr(s.tags).filter(t => !['neuter','masculine','feminine','strong','weak','mixed'].includes(t));
        const exArr    = safeArr(s.examples).slice(0, 2);
        const syns     = safeArr(s.synonyms).slice(0, 4);
        return `
          <div class="sense-item">
            <span class="sense-num">${i + 1}</span>
            <div class="sense-body">
              ${gloss ? `<div class="sense-gloss">${escapeHtml(gloss)}</div>` : ''}
              ${tags.length ? `<div class="sense-tags">${tags.map(t => `<span class="sense-tag">${escapeHtml(t)}</span>`).join('')}</div>` : ''}
              ${exArr.map(ex => {
                const t = senseExampleText(ex);
                return t ? `<div class="sense-example">"${escapeHtml(t)}"</div>` : '';
              }).join('')}
              ${syns.length ? `<div class="sense-synonyms">≈ ${syns.map(s => `<span class="chip chip-sm chip-clickable" data-word="${escapeHtml(s)}">${escapeHtml(s)}</span>`).join('')}</div>` : ''}
            </div>
          </div>`;
      }).join('');
      parts.push(`<div class="senses-list">${items}</div>`);
    }

    // Plain German definitions (from DWDS / other sources)
    if (definitions.length > 0 && senses.length === 0) {
      const items = definitions.slice(0, 8).map((d, i) => {
        const text = typeof d === 'string' ? d : (d.def || d.definition || '');
        return `<div class="sense-item"><span class="sense-num">${i + 1}</span><div class="sense-body"><div class="sense-gloss">${escapeHtml(text)}</div></div></div>`;
      }).join('');
      parts.push(`<div class="senses-list">${items}</div>`);
    }

    return parts.join('');
  }

  // ── Inflections ────────────────────────────────────────────────────────────

  function renderInflections(inflections, pos) {
    if (!inflections || inflections.length === 0) return '';

    // Separate out forms by their tags
    const byTag = {};
    for (const f of inflections) {
      const form = typeof f === 'string' ? f : f.form;
      const tags = safeArr(typeof f === 'string' ? [] : f.tags);
      const key  = tags.sort().join('|');
      byTag[key] = { form, tags };
    }

    // Route to specialised table renderer by POS
    if (pos === 'NOUN') return renderNounTable(byTag);
    if (pos === 'VERB') return renderVerbTable(byTag);
    if (pos === 'ADJ' || pos === 'ADV') return renderAdjTable(byTag);

    // Generic: chips with tag labels
    return renderGenericForms(inflections);
  }

  function findForm(byTag, ...tags) {
    const key = tags.slice().sort().join('|');
    return byTag[key]?.form || '—';
  }

  function renderNounTable(byTag) {
    const cases  = ['nominative', 'genitive', 'dative', 'accusative'];
    const caseDE = ['Nominativ', 'Genitiv', 'Dativ', 'Akkusativ'];

    // Try combined-tag lookup first (ideal Kaikki data)
    const fullRows = cases.map((c, ci) => {
      const sg = findForm(byTag, c, 'singular');
      const pl = findForm(byTag, c, 'plural');
      return { label: caseDE[ci], sg, pl };
    });
    const filledCells = fullRows.filter(r => r.sg !== '—' || r.pl !== '—').length;

    if (filledCells >= 2) {
      // Full table
      const rows = fullRows.map(r =>
        `<tr><th>${r.label}</th><td>${escapeHtml(r.sg)}</td><td>${escapeHtml(r.pl)}</td></tr>`
      ).join('');
      return `
        <div class="infl-table-wrap">
          <table class="infl-table">
            <thead><tr><th></th><th>Singular</th><th>Plural</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    // Sparse data — show available forms as labeled rows
    const known = Object.entries(byTag)
      .filter(([, v]) => v.form && v.form !== '—')
      .map(([, v]) => ({ form: v.form, label: v.tags.join(', ') }));

    if (known.length === 0) return '';

    return `
      <div class="infl-table-wrap">
        <table class="infl-table">
          <thead><tr><th>Form</th><th>Tags</th></tr></thead>
          <tbody>
            ${known.map(f =>
              `<tr><td>${escapeHtml(f.form)}</td><th>${escapeHtml(f.label)}</th></tr>`
            ).join('')}
          </tbody>
        </table>
      </div>`;
  }

  function renderVerbTable(byTag) {
    // Show infinitive / past-participle / auxiliary first
    const parts = [];

    const inf   = findForm(byTag, 'infinitive');
    const pp    = findForm(byTag, 'past', 'participle') || findForm(byTag, 'participle', 'past');
    const prp   = findForm(byTag, 'present', 'participle') || findForm(byTag, 'participle', 'present');

    if (inf !== '—' || pp !== '—') {
      parts.push(`
        <div class="verb-forms-row">
          ${inf !== '—' ? `<div class="verb-form-item"><span class="verb-form-label">Infinitiv</span><span class="verb-form-val">${escapeHtml(inf)}</span></div>` : ''}
          ${pp  !== '—' ? `<div class="verb-form-item"><span class="verb-form-label">Partizip II</span><span class="verb-form-val">${escapeHtml(pp)}</span></div>` : ''}
          ${prp !== '—' ? `<div class="verb-form-item"><span class="verb-form-label">Partizip I</span><span class="verb-form-val">${escapeHtml(prp)}</span></div>` : ''}
        </div>`);
    }

    // Present tense conjugation table
    const persons = [
      ['first-person',  'singular', 'ich'],
      ['second-person', 'singular', 'du'],
      ['third-person',  'singular', 'er/sie/es'],
      ['first-person',  'plural',   'wir'],
      ['second-person', 'plural',   'ihr'],
      ['third-person',  'plural',   'sie/Sie'],
    ];

    const presentRows = persons.map(([p, n, label]) => {
      const pres = findForm(byTag, p, n, 'present', 'indicative') ||
                   findForm(byTag, p, n, 'present');
      const past = findForm(byTag, p, n, 'preterite', 'indicative') ||
                   findForm(byTag, p, n, 'preterite') ||
                   findForm(byTag, p, n, 'past', 'indicative');
      if (pres === '—' && past === '—') return '';
      return `<tr><th>${label}</th><td>${escapeHtml(pres)}</td><td>${escapeHtml(past)}</td></tr>`;
    }).filter(Boolean).join('');

    if (presentRows) {
      parts.push(`
        <div class="infl-table-wrap">
          <table class="infl-table">
            <thead><tr><th></th><th>Präsens</th><th>Präteritum</th></tr></thead>
            <tbody>${presentRows}</tbody>
          </table>
        </div>`);
    }

    if (!parts.length) return renderGenericForms(Object.values(byTag));
    return parts.join('');
  }

  function renderAdjTable(byTag) {
    const pos  = findForm(byTag, 'positive');
    const comp = findForm(byTag, 'comparative');
    const sup  = findForm(byTag, 'superlative');
    if (pos === '—' && comp === '—' && sup === '—') return renderGenericForms(Object.values(byTag));
    return `
      <div class="verb-forms-row">
        ${pos  !== '—' ? `<div class="verb-form-item"><span class="verb-form-label">Positiv</span><span class="verb-form-val">${escapeHtml(pos)}</span></div>` : ''}
        ${comp !== '—' ? `<div class="verb-form-item"><span class="verb-form-label">Komparativ</span><span class="verb-form-val">${escapeHtml(comp)}</span></div>` : ''}
        ${sup  !== '—' ? `<div class="verb-form-item"><span class="verb-form-label">Superlativ</span><span class="verb-form-val">${escapeHtml(sup)}</span></div>` : ''}
      </div>`;
  }

  function renderGenericForms(items) {
    if (!items || items.length === 0) return '';
    const chips = items.slice(0, 20).map(f => {
      if (typeof f === 'string') return chip(f, 'chip-form');
      const form = f.form || '';
      const tags = safeArr(f.tags).join(', ');
      return `<span class="chip chip-form" title="${escapeHtml(tags)}">${escapeHtml(form)}</span>`;
    }).join('');
    return `<div class="chip-row chip-row-wrap">${chips}</div>`;
  }

  // ── Synonyms & Antonyms ────────────────────────────────────────────────────

  function renderSynonyms(synonyms, antonyms) {
    if (!synonyms.length && !antonyms.length) return '';
    let html = '';
    if (synonyms.length) {
      html += `
        <div class="syn-group">
          <span class="syn-label">Synonyme</span>
          <div class="chip-row chip-row-wrap">
            ${synonyms.map(s => `<span class="chip chip-syn chip-clickable" data-word="${escapeHtml(s)}">${escapeHtml(s)}</span>`).join('')}
          </div>
        </div>`;
    }
    if (antonyms.length) {
      html += `
        <div class="syn-group">
          <span class="syn-label">Antonyme</span>
          <div class="chip-row chip-row-wrap">
            ${antonyms.map(s => `<span class="chip chip-ant chip-clickable" data-word="${escapeHtml(s)}">${escapeHtml(s)}</span>`).join('')}
          </div>
        </div>`;
    }
    return html;
  }

  // ── Related / Derived ──────────────────────────────────────────────────────

  function renderRelated(derived, related, compound_parts) {
    const parts = [];
    if (compound_parts) {
      parts.push(`<p class="compound-parts"><span class="syn-label">Compound of:</span> ${escapeHtml(compound_parts)}</p>`);
    }
    if (derived.length) {
      parts.push(`
        <div class="syn-group">
          <span class="syn-label">Derived</span>
          <div class="chip-row chip-row-wrap">
            ${derived.map(s => `<span class="chip chip-sm chip-clickable" data-word="${escapeHtml(s)}">${escapeHtml(s)}</span>`).join('')}
          </div>
        </div>`);
    }
    if (related.length) {
      parts.push(`
        <div class="syn-group">
          <span class="syn-label">Related</span>
          <div class="chip-row chip-row-wrap">
            ${related.map(s => `<span class="chip chip-sm chip-clickable" data-word="${escapeHtml(s)}">${escapeHtml(s)}</span>`).join('')}
          </div>
        </div>`);
    }
    return parts.join('');
  }

  // ── Verb meta badges ───────────────────────────────────────────────────────

  function renderVerbMeta(entry) {
    if (entry.pos !== 'VERB') return '';
    const parts = [];
    if (entry.auxiliary)  parts.push(`<span class="badge badge-verb">${escapeHtml(entry.auxiliary)}</span>`);
    if (entry.verb_class) parts.push(`<span class="badge badge-verb">${escapeHtml(entry.verb_class)}</span>`);
    if (entry.case_government) parts.push(`<span class="badge badge-verb">+${escapeHtml(entry.case_government)}</span>`);
    return parts.join('');
  }

  // ── Frequency & CEFR ──────────────────────────────────────────────────────

  function renderFrequency(entry) {
    const parts = [];
    if (entry.cefr_level) {
      const desc = { A1: 'Beginner', A2: 'Elementary', B1: 'Intermediate',
                     B2: 'Upper-Intermediate', C1: 'Advanced', C2: 'Proficient' };
      parts.push(`<div class="freq-row"><span class="freq-label">CEFR Level</span>
        <span class="freq-val">${cefrBadge(entry.cefr_level)} ${desc[entry.cefr_level] || ''}</span></div>`);
    }
    if (entry.frequency_class) {
      parts.push(`<div class="freq-row"><span class="freq-label">Frequency class</span>
        <span class="freq-val">${renderFreqBar(entry.frequency_class)} class ${entry.frequency_class}</span></div>`);
    }
    if (entry.frequency_per_m) {
      parts.push(`<div class="freq-row"><span class="freq-label">Per million words</span>
        <span class="freq-val">${Number(entry.frequency_per_m).toFixed(2)}</span></div>`);
    }
    return parts.length ? `<div class="freq-info">${parts.join('')}</div>` : '';
  }

  function renderFreqBar(cls) {
    const pct = Math.round(((10 - (cls || 10)) / 9) * 100);
    return `<span class="freq-bar-wrap" title="Frequency class ${cls}">
      <span class="freq-bar" style="width:${pct}%"></span></span>`;
  }

  // ── Footer links ───────────────────────────────────────────────────────────

  function renderFooterLinks(entry) {
    const links = [];
    if (entry.wikidata_id) {
      links.push(`<a href="https://www.wikidata.org/wiki/${escapeHtml(entry.wikidata_id)}"
                     target="_blank" rel="noopener" class="footer-link">Wikidata</a>`);
    }
    if (entry.wikipedia) {
      links.push(`<a href="https://de.wikipedia.org/wiki/${encodeURIComponent(entry.wikipedia)}"
                     target="_blank" rel="noopener" class="footer-link">Wikipedia</a>`);
    }
    links.push(`<a href="https://www.dwds.de/wb/${encodeURIComponent(entry.lemma)}"
                   target="_blank" rel="noopener" class="footer-link">DWDS</a>`);
    links.push(`<a href="https://de.wiktionary.org/wiki/${encodeURIComponent(entry.lemma)}"
                   target="_blank" rel="noopener" class="footer-link">Wiktionary</a>`);
    return `<div class="detail-footer-links">${links.join('')}</div>`;
  }

  // ── Collapsible section builder ────────────────────────────────────────────

  let _sectionIdx = 0;

  function collapsible(title, content, slug, defaultOpen = false) {
    const id = `sec-${slug}-${++_sectionIdx}`;
    const open = defaultOpen;
    return `
      <div class="detail-section">
        <button class="collapsible-toggle" data-target="${id}" aria-expanded="${open}">
          <span class="collapsible-icon">${open ? '▼' : '▶'}</span>
          <span class="collapsible-title">${escapeHtml(title)}</span>
        </button>
        <div class="collapsible-body" id="${id}" ${open ? '' : 'hidden'}>
          ${content}
        </div>
      </div>`;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  return {
    toast,
    setSearchStatus,
    renderResults,
    renderDetail,
    renderHistory,
    renderBookmarks,
  };
})();

window.UI = UI;
