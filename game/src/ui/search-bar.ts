/**
 * SearchBar — floating input in the top-right corner.
 *
 * Features:
 *  - Real-time fuzzy matching on lemma, definition_en, morphological root
 *  - Umlaut transliteration: ae→ä, oe→ö, ue→ü, ss→ß (and their inverses)
 *  - Keyboard: Enter selects first result, Escape closes
 *  - Emits a "select" callback with the matched { wort, cluster }
 */
import type { Wort, RootCluster } from '@/types';

export interface SearchResult {
  wort: Wort;
  cluster: RootCluster;
  score: number;
}

type SelectCallback = (result: SearchResult) => void;

// ---------------------------------------------------------------------------
// Umlaut normalisation
// ---------------------------------------------------------------------------

/** Transliterate ASCII digraph approximations to their canonical German chars */
function normaliseQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/ue/g, 'ü')
    .replace(/ss/g, 'ß');
}

/** Also strip umlauts for ASCII-only comparison */
function stripped(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

// ---------------------------------------------------------------------------
// Search logic
// ---------------------------------------------------------------------------

function scoreMatch(query: string, wort: Wort): number {
  const q   = normaliseQuery(query);
  const qs  = stripped(query);
  const lq  = q.toLowerCase();
  const lqs = qs.toLowerCase();

  let score = 0;
  const lemma   = wort.lemma.toLowerCase();
  const lemmaSt = stripped(wort.lemma);

  // Exact match
  if (lemma === lq || lemmaSt === lqs)           return 1000;
  // Starts with
  if (lemma.startsWith(lq) || lemmaSt.startsWith(lqs)) score += 200;
  // Contains
  if (lemma.includes(lq) || lemmaSt.includes(lqs)) score += 100;
  // Fuzzy: each query char present in order
  if (score === 0) {
    let j = 0;
    for (const ch of lq) {
      const idx = lemma.indexOf(ch, j);
      if (idx !== -1) { score += 1; j = idx + 1; }
    }
  }

  // Bonus for definition match
  const def = (wort.definition_en || '').toLowerCase();
  if (def.includes(lq) || def.includes(lqs)) score += 20;

  return score;
}

export function searchClusters(
  query: string,
  clusters: RootCluster[],
  maxResults = 8,
): SearchResult[] {
  if (!query.trim()) return [];

  const results: SearchResult[] = [];

  for (const cluster of clusters) {
    for (const wort of cluster.words) {
      const score = scoreMatch(query, wort);
      if (score > 0) {
        results.push({ wort, cluster, score });
      }
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, maxResults);
}

// ---------------------------------------------------------------------------
// DOM component
// ---------------------------------------------------------------------------

const SEARCH_STYLES = `
.urwort-search {
  position: absolute;
  top: 16px; right: 16px;
  z-index: 200;
  display: flex; flex-direction: column;
  width: 240px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.urwort-search-input {
  width: 100%; box-sizing: border-box;
  padding: 8px 36px 8px 14px;
  border: none; border-radius: 10px;
  background: rgba(255,255,255,0.92);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 2px 12px rgba(0,0,0,0.12);
  font-size: 0.9rem; color: #1A1A2E;
  outline: none;
  transition: box-shadow 0.15s;
}
.urwort-search-input:focus {
  box-shadow: 0 2px 12px rgba(0,0,0,0.12), 0 0 0 2px rgba(45,106,79,0.4);
}
.urwort-search-input::placeholder { color: #aaa; }

.urwort-search-icon {
  position: absolute; right: 10px; top: 9px;
  font-size: 1rem; color: #aaa; pointer-events: none;
}

.urwort-search-results {
  margin-top: 4px;
  background: rgba(255,255,255,0.97);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 10px;
  box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  overflow: hidden;
  max-height: 300px;
  overflow-y: auto;
}

.urwort-search-item {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 9px 14px; cursor: pointer;
  border-bottom: 1px solid rgba(0,0,0,0.05);
  transition: background 0.1s;
}
.urwort-search-item:last-child { border-bottom: none; }
.urwort-search-item:hover, .urwort-search-item.selected {
  background: rgba(45,106,79,0.08);
}
.urwort-search-item-lemma {
  font-weight: 600; font-size: 0.9rem; color: #1A1A2E;
}
.urwort-search-item-def {
  font-size: 0.75rem; color: #888;
  max-width: 55%; overflow: hidden;
  text-overflow: ellipsis; white-space: nowrap;
}
.urwort-search-item-pos {
  display: inline-block; font-size: 0.65rem; font-weight: 600;
  padding: 1px 5px; border-radius: 4px;
  background: #E8E4D9; color: #5C4033; margin-left: 5px;
}
.urwort-search-empty {
  padding: 12px 14px; font-size: 0.85rem; color: #aaa;
  font-style: italic;
}
`;

export class SearchBar {
  private wrapper: HTMLElement;
  private input: HTMLInputElement;
  private resultsList: HTMLElement | null = null;
  private clusters: RootCluster[] = [];
  private onSelect: SelectCallback;
  private selectedIdx = 0;
  private currentResults: SearchResult[] = [];

  constructor(container: HTMLElement, onSelect: SelectCallback) {
    this.onSelect = onSelect;

    // Inject styles once
    if (!document.getElementById('urwort-search-styles')) {
      const style = document.createElement('style');
      style.id    = 'urwort-search-styles';
      style.textContent = SEARCH_STYLES;
      document.head.appendChild(style);
    }

    // Build wrapper
    this.wrapper = document.createElement('div');
    this.wrapper.className = 'urwort-search';

    this.input = document.createElement('input');
    this.input.type        = 'text';
    this.input.placeholder = 'Search words… (e.g. haus, ae→ä)';
    this.input.className   = 'urwort-search-input';
    this.input.setAttribute('aria-label', 'Search German words');

    const icon = document.createElement('span');
    icon.className = 'urwort-search-icon';
    icon.textContent = '⌕';

    this.wrapper.appendChild(this.input);
    this.wrapper.appendChild(icon);
    container.appendChild(this.wrapper);

    this.bindEvents();
  }

  setClusters(clusters: RootCluster[]): void {
    this.clusters = clusters;
  }

  private bindEvents(): void {
    this.input.addEventListener('input', () => this.onInput());
    this.input.addEventListener('keydown', (e) => this.onKey(e));
    // Prevent input key events reaching the game (WASD, etc.)
    this.input.addEventListener('keydown', (e) => e.stopPropagation());
    this.input.addEventListener('keyup',   (e) => e.stopPropagation());
    // Close results when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.wrapper.contains(e.target as Node)) {
        this.clearResults();
      }
    });
  }

  private onInput(): void {
    const q = this.input.value.trim();
    if (!q) { this.clearResults(); return; }
    this.currentResults = searchClusters(q, this.clusters);
    this.selectedIdx = 0;
    this.renderResults();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      this.input.value = '';
      this.clearResults();
      return;
    }
    if (!this.currentResults.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.selectedIdx = Math.min(this.selectedIdx + 1, this.currentResults.length - 1);
      this.highlightSelected();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.selectedIdx = Math.max(this.selectedIdx - 1, 0);
      this.highlightSelected();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      this.selectResult(this.currentResults[this.selectedIdx]);
    }
  }

  private renderResults(): void {
    // Remove old results DOM (but keep currentResults — they were just set by onInput)
    if (this.resultsList) {
      this.resultsList.remove();
      this.resultsList = null;
    }

    const list = document.createElement('div');
    list.className = 'urwort-search-results';

    if (this.currentResults.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'urwort-search-empty';
      empty.textContent = 'No results';
      list.appendChild(empty);
    } else {
      this.currentResults.forEach((r, i) => {
        const item = document.createElement('div');
        item.className = 'urwort-search-item' + (i === this.selectedIdx ? ' selected' : '');
        item.dataset.idx = String(i);
        item.innerHTML = `
          <span class="urwort-search-item-lemma">
            ${escHtml(r.wort.lemma)}
            <span class="urwort-search-item-pos">${escHtml(r.wort.pos)}</span>
          </span>
          <span class="urwort-search-item-def">${escHtml(r.wort.definition_en || '')}</span>
        `;
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          this.selectResult(r);
        });
        list.appendChild(item);
      });
    }

    this.resultsList = list;
    this.wrapper.appendChild(list);
  }

  private highlightSelected(): void {
    this.resultsList?.querySelectorAll('.urwort-search-item').forEach((el, i) => {
      el.classList.toggle('selected', i === this.selectedIdx);
    });
  }

  private selectResult(result: SearchResult): void {
    this.onSelect(result);
    this.input.value = result.wort.lemma;
    this.clearResults();
  }

  private clearResults(): void {
    if (this.resultsList) {
      this.resultsList.remove();
      this.resultsList = null;
    }
    this.currentResults = [];
    this.selectedIdx    = 0;
  }
}

function escHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
