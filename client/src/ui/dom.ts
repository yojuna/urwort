// Small DOM helpers for the HTML overlay (dialogue, slips, bench). The world is drawn by Phaser underneath.

export const root = () => document.getElementById('ui')!;

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, cls = '', text = '', parent?: HTMLElement,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  parent?.appendChild(e);
  return e;
}

export function toast(text: string) {
  const t = el('div', 'toast', text, root());
  setTimeout(() => t.classList.add('out'), 1800);
  setTimeout(() => t.remove(), 2300);
}

/** A full-screen sheet; resolves when closed. */
export function modal(build: (body: HTMLElement, close: () => void) => void, cls = ''): Promise<void> {
  return new Promise((resolve) => {
    const back = el('div', 'modal-back ' + cls, '', root());
    const sheet = el('div', 'modal', '', back);
    const close = () => { back.remove(); resolve(); };
    const x = el('button', 'modal-close', '×', sheet);
    x.onclick = close;
    build(el('div', 'modal-body', '', sheet), close);
  });
}

export function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
