// Word slips, word cards, rune list, the original-text page, title cards and the end screen.
import { DATA, RUNE_INFO, madeFrom } from '../data';
import { state, save } from '../state';
import { el, modal, root, toast, wait } from './dom';

export function addSlip(lemma: string, quiet = false) {
  if (!DATA.words[lemma] || state.slips.includes(lemma)) return;
  state.slips.push(lemma);
  save();
  if (!quiet) toast('Neuer Zettel: ' + lemma);
  hudRefresh();
}

export function learnRune(rune: string) {
  if (state.runes.includes(rune)) return;
  state.runes.push(rune);
  save();
  toast('Neue Rune: ' + rune);
  hudRefresh();
}

function play(url: string) {
  new Audio(url).play().catch(() => toast('Kein Ton auf diesem Gerät'));
}

/** The full slip for one word. */
export function wordCard(lemma: string, parent: HTMLElement) {
  const w = DATA.words[lemma];
  const card = el('div', 'slip', '', parent);
  const head = el('div', 'slip-head', '', card);
  el('span', 'slip-word', lemma, head);
  if (w?.audio) { const b = el('button', 'icon', '▶', head); b.onclick = () => play(w.audio!); }
  if (w?.ipa) el('div', 'slip-ipa', w.ipa, card);
  if (!w) return card;
  const made = madeFrom(lemma);
  if (made && state.runes.includes(made.rune)) {
    el('div', 'slip-made', made.rune.startsWith('-') ? `${made.base} + ${made.rune}` : `${made.rune} + ${made.base}`, card);
  }
  if (w.gloss_de) el('div', 'slip-gloss', w.gloss_de, card);
  if (state.english && w.gloss_en) el('div', 'slip-en', w.gloss_en, card);
  if (w.history.length) {
    const h = el('div', 'slip-root', '', card);
    el('span', 'label', 'Wurzel: ', h);
    h.append(w.history.map((s) => `${s.stage} ${s.form}`).join(' ← '));
  }
  if (state.english && Object.keys(w.cognates).length) {
    el('div', 'slip-cog', 'verwandt: ' + Object.entries(w.cognates).map(([l, f]) => `${l === 'en' ? 'engl.' : 'ndl.'} ${f}`).join(', '), card);
  }
  if (w.quote) {
    const q = el('div', 'slip-quote', '', card);
    el('div', '', w.quote.text, q);
    el('div', 'slip-src', `${w.quote.tale}, KHM ${w.quote.number}, ${w.quote.edition}`, q);
  }
  return card;
}

/** Quick card when a word in dialogue is tapped; also files the slip. */
export function wordPopover(lemma: string) {
  addSlip(lemma);
  modal((body) => { wordCard(lemma, body); }, 'pop');
}

export function slipBox() {
  return modal((body) => {
    el('h2', '', `Zettelkasten (${state.slips.length})`, body);
    const toggle = el('label', 'toggle', '', body);
    const cb = el('input', '', '', toggle);
    cb.type = 'checkbox';
    cb.checked = state.english;
    toggle.append(' Englisch zeigen');
    const list = el('div', 'slip-list', '', body);
    const render = () => {
      list.innerHTML = '';
      // group by family; the header is the shortest word of the group the player has found
      const groups = new Map<string, string[]>();
      for (const s of state.slips) {
        const f = DATA.words[s]?.family ?? s;
        groups.set(f, [...(groups.get(f) ?? []), s]);
      }
      for (const words of groups.values()) {
        const g = el('div', 'family', '', list);
        el('div', 'family-head', [...words].sort((a, b) => a.length - b.length)[0], g);
        for (const w of words) {
          const chip = el('button', 'chip', w, g);
          chip.onclick = () => modal((b) => { wordCard(w, b); }, 'pop');
        }
      }
      if (!state.slips.length) el('p', 'muted', 'Noch leer. Tippe auf Wörter und Dinge.', list);
    };
    cb.onchange = () => { state.english = cb.checked; save(); render(); };
    render();
  });
}

export function runeList() {
  return modal((body) => {
    el('h2', '', 'Runen', body);
    if (!state.runes.length) el('p', 'muted', 'Du hast noch keine Rune gefunden.', body);
    for (const r of state.runes) {
      const row = el('div', 'rune-row', '', body);
      el('span', 'rune', r, row);
      el('span', '', RUNE_INFO[r] ?? '', row);
    }
  });
}

export function originalText() {
  return modal((body) => {
    el('h2', '', 'Rumpelstilzchen', body);
    el('p', 'muted', 'Kinder- und Haus-Märchen, Band 1, Berlin 1812, Nr. 55. So schrieben die Brüder Grimm es auf, in der Schreibung von damals.', body);
    const q = el('div', 'original', '', body);
    for (const para of DATA.tale.text.split(/\n+/)) if (para.trim()) el('p', '', para.trim(), q);
    el('p', 'slip-src', 'Text: ' + DATA.tale.source, body);
    el('p', 'muted', 'Fällt dir etwas auf? „giebst“, „Rath“, „thun“: Auch die Schreibung hat sich verwandelt.', body);
  });
}

export async function titleCard(title: string, sub: string) {
  const c = el('div', 'title-card', '', root());
  el('div', 'title', title, c);
  el('div', 'sub', sub, c);
  await wait(2600);
  c.classList.add('out');
  await wait(600);
  c.remove();
}

export function endScreen() {
  return modal((body) => {
    el('h2', '', 'Ende des Prototyps', body);
    el('p', '', `Du hast ein Märchen gesammelt: Rumpelstilzchen, erzählt von Dortchen Wild.`, body);
    el('p', '', `${state.slips.length} Zettel, ${state.runes.length} Runen: ${state.runes.join(', ')}`, body);
    el('p', 'muted', 'Du kannst weiter herumlaufen, oder neu beginnen (Menü ☰).', body);
  });
}

// ---------------------------------------------------------------- HUD

let hudEl: HTMLElement | null = null;
export function hud(onMenu: () => void) {
  hudEl = el('div', 'hud', '', root());
  hudRefresh(onMenu);
}

let menuCb: () => void = () => {};
export function hudRefresh(onMenu?: () => void) {
  if (onMenu) menuCb = onMenu;
  if (!hudEl) return;
  hudEl.innerHTML = '';
  const s = el('button', 'hud-btn', `Zettel ${state.slips.length}`, hudEl);
  s.onclick = () => slipBox();
  const r = el('button', 'hud-btn', `Runen ${state.runes.length}`, hudEl);
  r.onclick = () => runeList();
  if (state.items.length) el('span', 'hud-items', state.items.join(' · '), hudEl);
  const m = el('button', 'hud-btn menu', '☰', hudEl);
  m.onclick = () => menuCb();
}
