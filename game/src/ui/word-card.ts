/**
 * Word info card — appears when tapping a word pillar or island.
 *
 * Pure DOM overlay (no framework). Positioned over the 3D canvas.
 * Shows: lemma, POS, IPA, CEFR level, English definition,
 * root info, and compound decomposition.
 */
import type { Wort, Wurzel, CompoundLink } from '@/types';

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
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15), 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 20px 24px;
  z-index: 100;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #1A1A2E;
  pointer-events: auto;
  animation: urwort-card-in 0.25s ease-out;
  transition: opacity 0.2s, transform 0.2s;
}

.urwort-card.hiding {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}

@keyframes urwort-card-in {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0);
  }
}

.urwort-card-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  font-size: 1.4rem;
  color: #888;
  cursor: pointer;
  padding: 4px 8px;
  line-height: 1;
  border-radius: 8px;
}

.urwort-card-close:hover {
  background: rgba(0,0,0,0.06);
  color: #333;
}

.urwort-card-lemma {
  font-size: 1.6rem;
  font-weight: 600;
  margin: 0 0 2px;
  color: #1A1A2E;
}

.urwort-card-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.urwort-card-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.urwort-card-pos {
  background: #E8E4D9;
  color: #5C4033;
}

.urwort-card-cefr {
  color: white;
}

.urwort-card-cefr-A1 { background: #2D6A4F; }
.urwort-card-cefr-A2 { background: #40916C; }
.urwort-card-cefr-B1 { background: #1B6B93; }
.urwort-card-cefr-B2 { background: #3A7CA5; }
.urwort-card-cefr-C1 { background: #7B4F8A; }
.urwort-card-cefr-C2 { background: #9B2335; }

.urwort-card-ipa {
  font-size: 0.85rem;
  color: #666;
  font-style: italic;
}

.urwort-card-def {
  font-size: 0.95rem;
  line-height: 1.5;
  color: #333;
  margin: 8px 0;
}

.urwort-card-root {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid rgba(0,0,0,0.08);
}

.urwort-card-root-label {
  font-size: 0.75rem;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 4px;
}

.urwort-card-root-form {
  font-size: 1.1rem;
  font-weight: 600;
  color: #2D6A4F;
}

.urwort-card-root-origin {
  font-size: 0.8rem;
  color: #666;
  margin-left: 6px;
}

.urwort-card-compound {
  margin-top: 8px;
  font-size: 0.9rem;
  color: #5C4033;
}

.urwort-card-compound span {
  background: #F0EDE5;
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: 500;
}

/* Island info header (when showing root cluster) */
.urwort-card-island-header {
  margin-bottom: 12px;
  padding-bottom: 10px;
  border-bottom: 2px solid #2D6A4F;
}

.urwort-card-island-title {
  font-size: 1.3rem;
  font-weight: 600;
  color: #2D6A4F;
}

.urwort-card-island-meaning {
  font-size: 0.85rem;
  color: #666;
  margin-top: 2px;
}

.urwort-card-word-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.urwort-card-word-list li {
  padding: 6px 0;
  border-bottom: 1px solid rgba(0,0,0,0.04);
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  cursor: pointer;
}

.urwort-card-word-list li:hover {
  background: rgba(45, 106, 79, 0.06);
  margin: 0 -8px;
  padding-left: 8px;
  padding-right: 8px;
  border-radius: 6px;
}

.urwort-card-word-list li:last-child {
  border-bottom: none;
}

.urwort-card-word-lemma {
  font-weight: 500;
  font-size: 0.95rem;
}

.urwort-card-word-def {
  font-size: 0.8rem;
  color: #888;
  text-align: right;
  max-width: 55%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
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

  /** Show info for a single word */
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

    if (wort.pos) {
      html += `<span class="urwort-card-tag urwort-card-pos">${esc(formatPOS(wort.pos))}</span>`;
    }
    if (wort.cefr_level) {
      html += `<span class="urwort-card-tag urwort-card-cefr urwort-card-cefr-${esc(wort.cefr_level)}">${esc(wort.cefr_level)}</span>`;
    }
    if (wort.ipa) {
      html += `<span class="urwort-card-ipa">/${esc(wort.ipa)}/</span>`;
    }

    html += `</div>`;

    if (wort.definition_en) {
      html += `<div class="urwort-card-def">${esc(wort.definition_en)}</div>`;
    }

    // Compound decomposition
    if (compound?.split_display) {
      html += `
        <div class="urwort-card-compound">
          Compound: <span>${esc(compound.split_display)}</span>
        </div>
      `;
    }

    // Root info
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

    card.innerHTML = html;

    // Close button
    card.querySelector('.urwort-card-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });

    this.cardEl = card;
    this.container.appendChild(card);
  }

  /** Show island overview (root cluster) */
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
      <ul class="urwort-card-word-list">
    `;

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
    card.innerHTML = html;

    // Close button
    card.querySelector('.urwort-card-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hide();
    });

    // Word click handlers
    if (onWordClick) {
      card.querySelectorAll('li[data-wort-id]').forEach(li => {
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          const id = (li as HTMLElement).dataset.wortId;
          const wort = words.find(w => w.id === id);
          if (wort) onWordClick(wort);
        });
      });
    }

    this.cardEl = card;
    this.container.appendChild(card);
  }

  /** Hide the current card */
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

  /** Check if a card is currently shown */
  get isVisible(): boolean {
    return this.cardEl !== null;
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
// Helpers
// ---------------------------------------------------------------------------

function esc(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatPOS(pos: string): string {
  const map: Record<string, string> = {
    NOUN: 'Noun',
    VERB: 'Verb',
    ADJ: 'Adjective',
    ADV: 'Adverb',
    noun: 'Noun',
    verb: 'Verb',
    adj: 'Adjective',
    adv: 'Adverb',
  };
  return map[pos] || pos;
}
