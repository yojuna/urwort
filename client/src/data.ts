// Word data for the slice (public/data/slice.json, made by pipeline-v2/proto_export.py).

export interface Word {
  pos: string | null;
  ipa: string | null;
  audio: string | null;
  gloss_de: string | null;
  gloss_en: string | null;
  level: string | null;
  rank?: number | null;
  family: string | null;
  history: { stage: string; form: string }[];
  cognates: Record<string, string>;
  quote: { text: string; tale: string; number: number; edition: string } | null;
}

export interface RuneEdge { base: string; rune: string; derived: string; sources: number }

export const DATA = {
  words: {} as Record<string, Word>,
  forms: {} as Record<string, string>,
  runes: [] as RuneEdge[],
  tale: { title: '', number: 0, edition: '', source: '', text: '' },
};

export async function loadData() {
  const res = await fetch('./data/slice.json');
  Object.assign(DATA, await res.json());
}

/** Lemma for a token; at the start of a sentence a common lowercase reading wins ("Hier" -> hier). */
export function lemmaOf(token: string, sentenceStart: boolean): string | null {
  const exact = DATA.forms[token];
  const lower = DATA.forms[token.toLowerCase()];
  if (sentenceStart && lower && DATA.words[lower]?.rank != null) return lower;
  return exact ?? lower ?? null;
}

export function applyRune(base: string, rune: string): RuneEdge | undefined {
  return DATA.runes.find((e) => e.base === base && e.rune === rune);
}

/** How a word was made from a learned rune, if the data knows ("Mann + -lein"). */
export function madeFrom(word: string): RuneEdge | undefined {
  return DATA.runes.find((e) => e.derived === word);
}

// What the player learns a rune does. Shown only after the rune is found.
export const RUNE_INFO: Record<string, string> = {
  'ver-': 'verändert ein Wort ganz: wandeln → verwandeln, sprechen → versprechen',
  'er-': 'bis zum Ziel, mit Erfolg: raten → erraten',
  '-lein': 'macht etwas klein: Mann → Männlein',
  '-chen': 'macht etwas klein: Mann → Männchen',
  '-in': 'macht eine Frau daraus: König → Königin',
  'be-': 'richtet ein Tun auf etwas',
  'ent-': 'weg, los, heraus',
  'auf-': 'nach oben, offen',
  '-ung': 'macht aus einem Tun ein Ding',
  '-en': 'aus einem Stoff: Gold → golden',
};
