// Dialogue box: speaker, text with tappable words, continue on tap, choices.
import { DATA, lemmaOf } from '../data';
import { state } from '../state';
import { el, root } from './dom';
import { wordPopover } from './cards';

let box: HTMLElement | null = null;

function ensure() {
  if (!box) box = el('div', 'dialogue hidden', '', root());
  return box;
}

export function hide() {
  ensure().classList.add('hidden');
}

/** Render German text with each known word as a tappable span. */
function richText(text: string, parent: HTMLElement) {
  let sentenceStart = true;
  for (const part of text.split(/([A-Za-zÄÖÜäöüß]+)/)) {
    if (!part) continue;
    const lemma = /^[A-Za-zÄÖÜäöüß]+$/.test(part) ? lemmaOf(part, sentenceStart) : null;
    if (lemma && DATA.words[lemma]) {
      const w = el('span', 'word' + (state.slips.includes(lemma) ? ' known' : ''), part, parent);
      w.onclick = (e) => { e.stopPropagation(); wordPopover(lemma); w.classList.add('known'); };
    } else {
      parent.append(part);
    }
    if (/[A-Za-zÄÖÜäöüß]/.test(part)) sentenceStart = false;
    if (/[.!?:„]/.test(part)) sentenceStart = true;
  }
}

export function say(speaker: string, text: string): Promise<void> {
  const b = ensure();
  b.classList.remove('hidden');
  b.innerHTML = '';
  if (speaker) el('div', 'speaker', speaker, b);
  richText(text, el('div', 'text', '', b));
  el('div', 'more', '▼', b);
  return new Promise((resolve) => {
    // the first tap only counts after a short delay, so a fast double tap does not skip lines
    setTimeout(() => { b.onclick = () => { b.onclick = null; resolve(); }; }, 180);
  });
}

export function choose(options: string[]): Promise<number> {
  const b = ensure();
  b.classList.remove('hidden');
  const list = el('div', 'choices', '', b);
  b.querySelector('.more')?.remove();
  b.onclick = null;
  return new Promise((resolve) => {
    options.forEach((o, i) => {
      const btn = el('button', 'choice', o, list);
      btn.onclick = (e) => { e.stopPropagation(); resolve(i); };
    });
  });
}
