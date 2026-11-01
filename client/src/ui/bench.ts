// The rune bench: put a rune on a word. Real words come from the data (2+ sources);
// the puzzle is solved when the target word appears.
import { DATA, RUNE_INFO, applyRune } from '../data';
import { state } from '../state';
import { el, modal, wait } from './dom';
import { addSlip } from './cards';

export function bench(base: string, rune: string, target: string): Promise<void> {
  return new Promise((resolve) => {
    let solved = false;
    let fails = 0;
    void modal((body, close) => {
      const x = body.parentElement!.querySelector('.modal-close') as HTMLElement;
      x.style.display = 'none';           // the story waits for the answer
      el('h2', '', 'Runen-Werkbank', body);
      const row = el('div', 'bench-row', '', body);
      const slot = el('div', 'bench-slot', '?', row);
      const word = el('div', 'bench-word', base, row);
      el('div', 'bench-gloss', DATA.words[base]?.gloss_de ?? '', body);
      const result = el('div', 'bench-result', '', body);
      const stones = el('div', 'stones', '', body);
      const runes = state.runes.length ? state.runes : [rune];
      for (const r of runes) {
        const s = el('button', 'stone' + (rune !== '?' && r === rune ? ' hint' : ''), r, stones);
        s.title = RUNE_INFO[r] ?? '';
        s.onclick = async () => {
          if (solved) return;
          const prefix = r.endsWith('-');
          slot.textContent = r;
          row.classList.toggle('suffix', !prefix);
          const edge = applyRune(base, r);
          result.innerHTML = '';
          if (edge?.derived === target) {
            solved = true;
            word.textContent = target;
            slot.textContent = '';
            row.classList.add('done');
            el('div', 'ok', `${target}: ${DATA.words[target]?.gloss_de ?? ''}`, result);
            addSlip(target);
            await wait(1400);
            close();
            resolve();
          } else if (edge) {
            el('div', 'near', `„${edge.derived}“ gibt es wirklich: ${DATA.words[edge.derived]?.gloss_de ?? ''}. Aber das wird hier nicht gebraucht.`, result);
            addSlip(edge.derived);
          } else {
            fails++;
            el('div', 'fizzle', `${prefix ? r.slice(0, -1) + base : base + r.slice(1)}? Das gibt es nicht.`, result);
          }
          if (!solved && fails >= 2) {
            const want = DATA.runes.find((e) => e.base === base && e.derived === target)?.rune;
            stones.querySelectorAll('.stone').forEach((b) => b.classList.toggle('hint', b.textContent === want));
          }
        };
      }
    }, 'bench');
  });
}
