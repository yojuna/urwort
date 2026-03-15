/**
 * Mock data for Phase 0 scaffold testing.
 * This will be replaced with real data from the ontology API.
 */
import type { RootCluster, Wurzel, Wort } from '@/types';

/** Helper: bare-minimum source_urls and etymology_chain for mock objects */
const mockWurzel = (w: Omit<Wurzel, 'etymology_chain' | 'cognates' | 'source_urls'>): Wurzel => ({
  ...w,
  etymology_chain: [],
  cognates: [],
  source_urls: {},
});

const mockWort = (w: Omit<Wort, 'source_urls'>): Wort => ({
  ...w,
  source_urls: {},
});

export const MOCK_CLUSTERS: RootCluster[] = [
  {
    wurzel: mockWurzel({
      id: 'w-fahr',
      form: 'fahr',
      meaning_de: 'sich bewegen, reisen',
      meaning_en: 'to travel, move',
      origin_lang: 'OHG',
      proto_form: '*per-',
    }),
    words: [
      mockWort({ id: 'wt-fahren',   lemma: 'fahren',   pos: 'VERB', cefr_level: 'A1', definition_en: 'to drive/travel' }),
      mockWort({ id: 'wt-erfahrung',lemma: 'Erfahrung',pos: 'NOUN', cefr_level: 'B1', definition_en: 'experience' }),
      mockWort({ id: 'wt-gefahr',   lemma: 'Gefahr',   pos: 'NOUN', cefr_level: 'B1', definition_en: 'danger' }),
      mockWort({ id: 'wt-fahrrad',  lemma: 'Fahrrad',  pos: 'NOUN', cefr_level: 'A1', definition_en: 'bicycle' }),
      mockWort({ id: 'wt-abfahrt',  lemma: 'Abfahrt',  pos: 'NOUN', cefr_level: 'A2', definition_en: 'departure' }),
    ],
    links: [
      { wurzel_id: 'w-fahr', wort_id: 'wt-fahren',    derivation_path: 'fahr·en' },
      { wurzel_id: 'w-fahr', wort_id: 'wt-erfahrung', derivation_path: 'er·fahr·ung' },
      { wurzel_id: 'w-fahr', wort_id: 'wt-gefahr',    derivation_path: 'ge·fahr' },
      { wurzel_id: 'w-fahr', wort_id: 'wt-fahrrad',   derivation_path: 'fahr·rad' },
      { wurzel_id: 'w-fahr', wort_id: 'wt-abfahrt',   derivation_path: 'ab·fahrt' },
    ],
    compounds: [
      {
        compound_wort_id:    'wt-fahrrad',
        component_wort_ids:  ['wt-fahrrad', 'wt-rad'],
        split_display:       'Fahr·rad',
      },
    ],
  },
  {
    wurzel: mockWurzel({
      id: 'w-sprech',
      form: 'sprech',
      meaning_de: 'reden, sprechen',
      meaning_en: 'to speak',
      origin_lang: 'OHG',
    }),
    words: [
      mockWort({ id: 'wt-sprechen',    lemma: 'sprechen',    pos: 'VERB', cefr_level: 'A1', definition_en: 'to speak' }),
      mockWort({ id: 'wt-sprache',     lemma: 'Sprache',     pos: 'NOUN', cefr_level: 'A2', definition_en: 'language' }),
      mockWort({ id: 'wt-versprechen', lemma: 'versprechen', pos: 'VERB', cefr_level: 'B1', definition_en: 'to promise' }),
      mockWort({ id: 'wt-widerspruch', lemma: 'Widerspruch', pos: 'NOUN', cefr_level: 'B2', definition_en: 'contradiction' }),
    ],
    links: [
      { wurzel_id: 'w-sprech', wort_id: 'wt-sprechen',    derivation_path: 'sprech·en' },
      { wurzel_id: 'w-sprech', wort_id: 'wt-sprache',     derivation_path: 'sprach·e' },
      { wurzel_id: 'w-sprech', wort_id: 'wt-versprechen', derivation_path: 'ver·sprech·en' },
      { wurzel_id: 'w-sprech', wort_id: 'wt-widerspruch', derivation_path: 'wider·spruch' },
    ],
    compounds: [],
  },
  {
    wurzel: mockWurzel({
      id: 'w-steh',
      form: 'steh',
      meaning_de: 'stehen, aufrecht sein',
      meaning_en: 'to stand',
      origin_lang: 'PIE',
      proto_form: '*steh₂-',
    }),
    words: [
      mockWort({ id: 'wt-stehen',     lemma: 'stehen',     pos: 'VERB', cefr_level: 'A1', definition_en: 'to stand' }),
      mockWort({ id: 'wt-verstehen',  lemma: 'verstehen',  pos: 'VERB', cefr_level: 'A1', definition_en: 'to understand' }),
      mockWort({ id: 'wt-bestehen',   lemma: 'bestehen',   pos: 'VERB', cefr_level: 'B1', definition_en: 'to exist/pass' }),
      mockWort({ id: 'wt-entstehen',  lemma: 'entstehen',  pos: 'VERB', cefr_level: 'B1', definition_en: 'to arise' }),
      mockWort({ id: 'wt-gegenstand', lemma: 'Gegenstand', pos: 'NOUN', cefr_level: 'B1', definition_en: 'object/subject' }),
      mockWort({ id: 'wt-zustand',    lemma: 'Zustand',    pos: 'NOUN', cefr_level: 'B1', definition_en: 'condition/state' }),
    ],
    links: [
      { wurzel_id: 'w-steh', wort_id: 'wt-stehen',     derivation_path: 'steh·en' },
      { wurzel_id: 'w-steh', wort_id: 'wt-verstehen',  derivation_path: 'ver·steh·en' },
      { wurzel_id: 'w-steh', wort_id: 'wt-bestehen',   derivation_path: 'be·steh·en' },
      { wurzel_id: 'w-steh', wort_id: 'wt-entstehen',  derivation_path: 'ent·steh·en' },
      { wurzel_id: 'w-steh', wort_id: 'wt-gegenstand', derivation_path: 'gegen·stand' },
      { wurzel_id: 'w-steh', wort_id: 'wt-zustand',    derivation_path: 'zu·stand' },
    ],
    compounds: [],
  },
  {
    wurzel: mockWurzel({
      id: 'w-schreib',
      form: 'schreib',
      meaning_de: 'schreiben, aufzeichnen',
      meaning_en: 'to write',
      origin_lang: 'Latin',
    }),
    words: [
      mockWort({ id: 'wt-schreiben',  lemma: 'schreiben',  pos: 'VERB', cefr_level: 'A1', definition_en: 'to write' }),
      mockWort({ id: 'wt-beschreiben',lemma: 'beschreiben',pos: 'VERB', cefr_level: 'B1', definition_en: 'to describe' }),
      mockWort({ id: 'wt-schrift',    lemma: 'Schrift',    pos: 'NOUN', cefr_level: 'B1', definition_en: 'script/writing' }),
      mockWort({ id: 'wt-vorschrift', lemma: 'Vorschrift', pos: 'NOUN', cefr_level: 'B2', definition_en: 'regulation' }),
    ],
    links: [
      { wurzel_id: 'w-schreib', wort_id: 'wt-schreiben',   derivation_path: 'schreib·en' },
      { wurzel_id: 'w-schreib', wort_id: 'wt-beschreiben', derivation_path: 'be·schreib·en' },
      { wurzel_id: 'w-schreib', wort_id: 'wt-schrift',     derivation_path: 'schrift' },
      { wurzel_id: 'w-schreib', wort_id: 'wt-vorschrift',  derivation_path: 'vor·schrift' },
    ],
    compounds: [],
  },
  {
    wurzel: mockWurzel({
      id: 'w-rad',
      form: 'rad',
      meaning_de: 'Rad, drehen',
      meaning_en: 'wheel, to turn',
      origin_lang: 'PIE',
      proto_form: '*rot-',
    }),
    words: [
      mockWort({ id: 'wt-rad', lemma: 'Rad', pos: 'NOUN', cefr_level: 'A2', definition_en: 'wheel' }),
    ],
    links: [
      { wurzel_id: 'w-rad', wort_id: 'wt-rad', derivation_path: 'rad' },
    ],
    compounds: [],
  },
];
