/**
 * Word info card — appears when tapping a word pillar or island.
 *
 * Pure DOM overlay (no framework). Positioned over the 3D canvas.
 *
 * showWord()   → lemma, POS, IPA, CEFR, definition, morphological segments,
 *                root info, source links
 * showIsland() → root overview, etymology chain timeline, word list,
 *                cognates, source links
 */
import type { Wort, Wurzel, CompoundLink, EtymologyStage, MorphSegment } from '@/types';

// ---------------------------------------------------------------------------
// Styles (injected once)
// ---------------------------------------------------------------------------

const STYLES = `
.urwort-card {
  position: absolute;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  max-width: 420px;
  width: calc(100% - 32px);
  max-height: 70vh;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px 24px 16px;
  z-index: 100;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1A1A2E;
  pointer-events: auto;
  animation: urwort-card-in 0.25s ease-out;
  transition: opacity 0.2s, transform 0.2s;
  scrollbar-width: thin;
  scrollbar-color: #ccc transparent;
}

.urwort-card.hiding {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}

@keyframes urwort-card-in {
  from { opacity: 0; transform: translateX(-50%) translateY(12px); }
  to   { opacity: 1; transform: translateX(-50%) translateY(0); }
}

/* ── Close button ────────────────────────────────────────────── */
.urwort-card-close {
  position: absolute;
  top: 12px; right: 16px;
  background: none; border: none;
  font-size: 1.4rem; color: #888;
  cursor: pointer; padding: 4px 8px;
  line-height: 1; border-radius: 8px;
}
.urwort-card-close:hover { background: rgba(0,0,0,0.06); color: #333; }

/* ── Word header ─────────────────────────────────────────────── */
.urwort-card-lemma {
  font-size: 1.6rem; font-weight: 600;
  margin: 0 0 2px; color: #1A1A2E;
}
.urwort-card-meta {
  display: flex; gap: 8px; align-items: center;
  flex-wrap: wrap; margin-bottom: 10px;
}
.urwort-card-tag {
  display: inline-block; padding: 2px 8px;
  border-radius: 6px; font-size: 0.75rem;
  font-weight: 600; letter-spacing: 0.03em;
}
.urwort-card-pos  { background: #E8E4D9; color: #5C4033; }
.urwort-card-cefr { color: white; }
.urwort-card-cefr-A1 { background: #2D6A4F; }
.urwort-card-cefr-A2 { background: #40916C; }
.urwort-card-cefr-B1 { background: #1B6B93; }
.urwort-card-cefr-B2 { background: #3A7CA5; }
.urwort-card-cefr-C1 { background: #7B4F8A; }
.urwort-card-cefr-C2 { background: #9B2335; }
.urwort-card-ipa { font-size: 0.85rem; color: #666; font-style: italic; }
.urwort-card-def {
  font-size: 0.95rem; line-height: 1.5;
  color: #333; margin: 8px 0;
}

/* ── Morphological segments ──────────────────────────────────── */
.urwort-segments {
  display: flex; gap: 0px; flex-wrap: wrap;
  margin: 10px 0;
  animation: urwort-seg-split 0.4s ease-out 0.1s forwards;
}
@keyframes urwort-seg-split {
  from { gap: 0px; }
  to   { gap: 6px; }
}
.urwort-seg {
  display: flex; flex-direction: column; align-items: center;
  border-radius: 6px; padding: 4px 10px 5px;
  font-size: 0.9rem; font-weight: 600; color: white;
  cursor: default;
  opacity: 0; transform: translateY(4px);
  animation: urwort-seg-appear 0.3s ease-out forwards;
}
.urwort-seg:nth-child(1) { animation-delay: 0.05s; }
.urwort-seg:nth-child(2) { animation-delay: 0.1s; }
.urwort-seg:nth-child(3) { animation-delay: 0.15s; }
.urwort-seg:nth-child(4) { animation-delay: 0.2s; }
.urwort-seg:nth-child(5) { animation-delay: 0.25s; }
.urwort-seg:nth-child(6) { animation-delay: 0.3s; }
@keyframes urwort-seg-appear {
  to { opacity: 1; transform: translateY(0); }
}
.urwort-seg-label {
  font-size: 0.6rem; font-weight: 500; opacity: 0.85;
  text-transform: uppercase; letter-spacing: 0.05em;
  margin-top: 2px;
}
.urwort-seg-prefix  { background: #577590; }
.urwort-seg-root    { background: #2D6A4F; }
.urwort-seg-suffix  { background: #CA8A04; }
.urwort-seg-divider {
  align-self: center; color: #bbb;
  font-size: 0.8rem; padding: 0 1px;
}

/* ── Root info (on word card) ────────────────────────────────── */
.urwort-card-root {
  margin-top: 12px; padding-top: 10px;
  border-top: 1px solid rgba(0,0,0,0.08);
}
.urwort-card-root-label {
  font-size: 0.75rem; color: #888;
  text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px;
}
.urwort-card-root-form { font-size: 1.1rem; font-weight: 600; color: #2D6A4F; }
.urwort-card-root-origin { font-size: 0.8rem; color: #666; margin-left: 6px; }

/* ── Compound info ───────────────────────────────────────────── */
.urwort-card-compound {
  margin-top: 8px; font-size: 0.9rem; color: #5C4033;
}
.urwort-card-compound span {
  background: #F0EDE5; padding: 2px 6px;
  border-radius: 4px; font-weight: 500;
}

/* ── Source links ────────────────────────────────────────────── */
.urwort-sources {
  margin-top: 12px; padding-top: 10px;
  border-top: 1px solid rgba(0,0,0,0.06);
  display: flex; gap: 12px; flex-wrap: wrap;
  align-items: center;
}
.urwort-sources-label {
  font-size: 0.7rem; color: #aaa;
  text-transform: uppercase; letter-spacing: 0.08em;
}
.urwort-sources a {
  font-size: 0.78rem; color: #577590;
  text-decoration: none; border-bottom: 1px solid rgba(87,117,144,0.3);
}
.urwort-sources a:hover { color: #2D6A4F; border-bottom-color: #2D6A4F; }

/* ── Island header ───────────────────────────────────────────── */
.urwort-card-island-header {
  margin-bottom: 12px; padding-bottom: 10px;
  border-bottom: 2px solid #2D6A4F;
}
.urwort-card-island-title {
  font-size: 1.3rem; font-weight: 600; color: #2D6A4F;
}
.urwort-card-island-meaning {
  font-size: 0.85rem; color: #666; margin-top: 2px;
}

/* ── Etymology chain timeline ────────────────────────────────── */
.urwort-etym-chain {
  margin: 12px 0;
  padding: 10px 12px;
  background: rgba(45,106,79,0.05);
  border-radius: 10px;
  border-left: 3px solid #2D6A4F;
}
.urwort-etym-title {
  font-size: 0.7rem; color: #888;
  text-transform: uppercase; letter-spacing: 0.08em;
  margin-bottom: 8px;
}
.urwort-etym-stage {
  display: flex; align-items: baseline;
  gap: 8px; padding: 3px 0;
}
.urwort-etym-stage + .urwort-etym-stage {
  border-top: 1px solid rgba(0,0,0,0.05);
}
.urwort-etym-form {
  font-size: 1rem; font-weight: 600; color: #1A1A2E;
  min-width: 90px;
}
.urwort-etym-form.reconstructed { font-style: italic; color: #577590; }
.urwort-etym-form.nhg { color: #2D6A4F; }
.urwort-etym-lang {
  font-size: 0.75rem; color: #888;
}
.urwort-etym-arrow {
  text-align: center; color: #bbb; font-size: 0.7rem;
  padding: 0 0 0 4px;
}
.urwort-cognates {
  margin-top: 8px; padding-top: 8px;
  border-top: 1px dashed rgba(0,0,0,0.1);
  font-size: 0.78rem; color: #666;
  display: flex; flex-wrap: wrap; gap: 6px; align-items: center;
}
.urwort-cognates-label {
  font-size: 0.68rem; text-transform: uppercase;
  letter-spacing: 0.06em; color: #aaa;
}
.urwort-cognate-pill {
  background: #f0ede5; border-radius: 4px;
  padding: 1px 7px; font-size: 0.78rem; color: #5C4033;
}

/* ── Word list (island view) ─────────────────────────────────── */
.urwort-card-word-list { list-style: none; padding: 0; margin: 0; }
.urwort-card-word-list li {
  padding: 6px 0; border-bottom: 1px solid rgba(0,0,0,0.04);
  display: flex; justify-content: space-between; align-items: baseline;
  cursor: pointer;
}
.urwort-card-word-list li:hover {
  background: rgba(45,106,79,0.06);
  margin: 0 -8px; padding-left: 8px; padding-right: 8px;
  border-radius: 6px;
}
.urwort-card-word-list li:last-child { border-bottom: none; }
.urwort-card-word-lemma { font-weight: 500; font-size: 0.95rem; }
.urwort-card-word-def {
  font-size: 0.8rem; color: #888; text-align: right;
  max-width: 55%; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
`;

// ---------------------------------------------------------------------------
// Card manager
// ---------------------------------------------------------------------------

export class WordCard {
  private container: HTMLElement;
  private cardEl: HTMLElement | null = null;
  private styleInjected = false;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  // ── Show info for a single word ──────────────────────────────────────────

  showWord(wort: Wort, wurzel?: Wurzel, compound?: CompoundLink): void {
    this.injectStyles();
    this.hide(false);

    const card = document.createElement('div');
    card.className = 'urwort-card';

    let html = `
      <button class="urwort-card-close" aria-label="Close">&times;</button>
      <h2 class="urwort-card-lemma">${esc(wort.lemma)}</h2>
      <div class="urwort-card-meta">
    `;

    if (wort.pos)        html += tagHtml('pos',  formatPOS(wort.pos));
    if (wort.cefr_level) html += tagHtml('cefr', wort.cefr_level);
    if (wort.ipa)        html += `<span class="urwort-card-ipa">/${esc(wort.ipa)}/</span>`;

    html += `</div>`;

    if (wort.definition_en) {
      html += `<div class="urwort-card-def">${esc(wort.definition_en)}</div>`;
    }

    // Morphological segment display
    if (wort.segments && wort.segments.length > 1) {
      html += renderSegments(wort.segments);
    }

    // Compound decomposition
    if (compound?.split_display) {
      html += `
        <div class="urwort-card-compound">
          Compound: <span>${esc(compound.split_display)}</span>
        </div>
      `;
    }

    // Root info (brief — full etymology is on island card)
    if (wurzel) {
      html += `
        <div class="urwort-card-root">
          <div class="urwort-card-root-label">Root</div>
          <span class="urwort-card-root-form">${esc(wurzel.form)}</span>
          <span class="urwort-card-root-origin">${esc(wurzel.origin_lang)}</span>
          ${wurzel.proto_form ? `<span class="urwort-card-root-origin">(${esc(wurzel.proto_form)})</span>` : ''}
        </div>
      `;
    }

    // Source links
    if (wort.source_urls && Object.keys(wort.source_urls).length > 0) {
      html += renderSourceLinks(wort.source_urls);
    }

    card.innerHTML = html;
    this.attachClose(card);
    this.cardEl = card;
    this.container.appendChild(card);
  }

  // ── Show island overview (root cluster) ─────────────────────────────────

  showIsland(
    wurzel: Wurzel,
    words: Wort[],
    compounds: CompoundLink[],
    onWordClick?: (wort: Wort) => void,
  ): void {
    this.injectStyles();
    this.hide(false);

    const card = document.createElement('div');
    card.className = 'urwort-card';

    let html = `
      <button class="urwort-card-close" aria-label="Close">&times;</button>
      <div class="urwort-card-island-header">
        <div class="urwort-card-island-title">${esc(wurzel.form)}</div>
        <div class="urwort-card-island-meaning">
          ${esc(wurzel.origin_lang)}
          ${wurzel.proto_form ? ` · ${esc(wurzel.proto_form)}` : ''}
          ${wurzel.meaning_en ? ` — "${esc(wurzel.meaning_en)}"` : ''}
        </div>
      </div>
    `;

    // Etymology chain timeline (show when chain has ≥2 meaningful stages)
    const chain = wurzel.etymology_chain ?? [];
    const meaningfulChain = chain.filter(s => s.stage !== 'nhg');
    if (meaningfulChain.length >= 1) {
      html += renderEtymologyChain(chain, wurzel.cognates ?? []);
    }

    // Word list
    html += `<ul class="urwort-card-word-list">`;
    for (const w of words) {
      const compound = compounds.find(c => c.compound_wort_id === w.id);
      html += `
        <li data-wort-id="${esc(w.id)}">
          <span class="urwort-card-word-lemma">
            ${esc(w.lemma)}
            ${w.cefr_level ? `<span class="urwort-card-tag urwort-card-cefr urwort-card-cefr-${esc(w.cefr_level)}" style="font-size:0.65rem;margin-left:4px">${esc(w.cefr_level)}</span>` : ''}
          </span>
          <span class="urwort-card-word-def">
            ${compound ? `<span style="color:#5C4033;margin-right:4px">${esc(compound.split_display)}</span>` : ''}
            ${esc(w.definition_en || '')}
          </span>
        </li>
      `;
    }
    html += `</ul>`;

    // Island source links
    if (wurzel.source_urls && Object.keys(wurzel.source_urls).length > 0) {
      html += renderSourceLinks(wurzel.source_urls);
    }

    card.innerHTML = html;
    this.attachClose(card);

    if (onWordClick) {
      card.querySelectorAll('li[data-wort-id]').forEach(li => {
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          const id   = (li as HTMLElement).dataset.wortId;
          const wort = words.find(w => w.id === id);
          if (wort) onWordClick(wort);
        });
      });
    }

    this.cardEl = card;
    this.container.appendChild(card);
  }

  // ── Hide ─────────────────────────────────────────────────────────────────

  hide(animate = true): void {
    if (!this.cardEl) return;
    if (animate) {
      const el = this.cardEl;
      el.classList.add('hiding');
      setTimeout(() => el.remove(), 200);
    } else {
      this.cardEl.remove();
    }
    this.cardEl = null;
  }

  get isVisible(): boolean { return this.cardEl !== null; }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private attachClose(card: HTMLElement): void {
    card.querySelector('.urwort-card-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });
  }

  private injectStyles(): void {
    if (this.styleInjected) return;
    const style = document.createElement('style');
    style.textContent = STYLES;
    document.head.appendChild(style);
    this.styleInjected = true;
  }
}

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

function renderSegments(segments: MorphSegment[]): string {
  const parts = segments.map((seg, i) => {
    const cls = `urwort-seg urwort-seg-${seg.type}`;
    const label = seg.type === 'prefix' ? seg.function
                : seg.type === 'suffix' ? (seg.function || seg.type)
                : 'root';
    const divider = (i < segments.length - 1)
      ? `<span class="urwort-seg-divider">+</span>` : '';
    return `
      <span class="${cls}">
        ${esc(seg.form)}
        <span class="urwort-seg-label">${esc(label)}</span>
      </span>
      ${divider}
    `;
  });

  return `<div class="urwort-segments">${parts.join('')}</div>`;
}

function renderEtymologyChain(chain: EtymologyStage[], cognates: { language: string; form: string }[]): string {
  // chain is stored oldest-first; display oldest first (deepest ancestor at top)
  let html = `<div class="urwort-etym-chain"><div class="urwort-etym-title">Etymology</div>`;

  chain.forEach((stage, i) => {
    const isNhg = stage.stage === 'nhg';
    const formCls = isNhg ? 'urwort-etym-form nhg'
                  : stage.is_reconstructed ? 'urwort-etym-form reconstructed'
                  : 'urwort-etym-form';
    const arrow = (i < chain.length - 1)
      ? `<div class="urwort-etym-arrow">↓</div>` : '';

    html += `
      <div class="urwort-etym-stage">
        <span class="${formCls}">${esc(stage.form)}</span>
        <span class="urwort-etym-lang">${esc(stage.lang_name)}</span>
      </div>
      ${arrow}
    `;
  });

  if (cognates.length > 0) {
    const pills = cognates
      .map(c => `<span class="urwort-cognate-pill">${esc(c.language)}: ${esc(c.form)}</span>`)
      .join('');
    html += `
      <div class="urwort-cognates">
        <span class="urwort-cognates-label">Cognates</span>
        ${pills}
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

function renderSourceLinks(urls: Record<string, string>): string {
  const LABELS: Record<string, string> = {
    wiktionary:      'Wiktionary',
    dwds:            'DWDS',
    dwds_etymology:  'DWDS Etymology',
  };

  const links = Object.entries(urls)
    .filter(([, url]) => url)
    .map(([key, url]) => {
      const label = LABELS[key] ?? key;
      return `<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(label)}</a>`;
    });

  if (links.length === 0) return '';

  return `
    <div class="urwort-sources">
      <span class="urwort-sources-label">Sources</span>
      ${links.join(' · ')}
    </div>
  `;
}

function tagHtml(type: 'pos' | 'cefr', text: string): string {
  if (type === 'cefr') {
    return `<span class="urwort-card-tag urwort-card-cefr urwort-card-cefr-${esc(text)}">${esc(text)}</span>`;
  }
  return `<span class="urwort-card-tag urwort-card-pos">${esc(formatPOS(text))}</span>`;
}

function esc(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatPOS(pos: string): string {
  const map: Record<string, string> = {
    NOUN: 'Noun', VERB: 'Verb', ADJ: 'Adjective', ADV: 'Adverb',
    noun: 'Noun', verb: 'Verb', adj: 'Adjective', adv: 'Adverb',
  };
  return map[pos] || pos;
}
