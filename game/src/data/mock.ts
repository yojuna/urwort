/**
 * Mock data for Phase 0 scaffold testing.
 * This will be replaced with real data from the ontology API.
 */
import type { RootCluster } from '@/types';

export const MOCK_CLUSTERS: RootCluster[] = [
  {
    wurzel: {
      id: 'w-fahr',
      form: 'fahr',
      meaning_de: 'sich bewegen, reisen',
      meaning_en: 'to travel, move',
      origin_lang: 'OHG',
      proto_form: '*per-',
    },
    words: [
      { id: 'wt-fahren', lemma: 'fahren', pos: 'verb', cefr_level: 'A1', definition_en: 'to drive/travel' },
      { id: 'wt-erfahrung', lemma: 'Erfahrung', pos: 'noun', cefr_level: 'B1', definition_en: 'experience' },
      { id: 'wt-gefahr', lemma: 'Gefahr', pos: 'noun', cefr_level: 'B1', definition_en: 'danger' },
      { id: 'wt-fahrrad', lemma: 'Fahrrad', pos: 'noun', cefr_level: 'A1', definition_en: 'bicycle' },
      { id: 'wt-abfahrt', lemma: 'Abfahrt', pos: 'noun', cefr_level: 'A2', definition_en: 'departure' },
    ],
    links: [
      { wurzel_id: 'w-fahr', wort_id: 'wt-fahren', derivation_path: 'fahr·en' },
      { wurzel_id: 'w-fahr', wort_id: 'wt-erfahrung', derivation_path: 'er·fahr·ung' },
      { wurzel_id: 'w-fahr', wort_id: 'wt-gefahr', derivation_path: 'ge·fahr' },
      { wurzel_id: 'w-fahr', wort_id: 'wt-fahrrad', derivation_path: 'fahr·rad' },
      { wurzel_id: 'w-fahr', wort_id: 'wt-abfahrt', derivation_path: 'ab·fahrt' },
    ],
    compounds: [
      {
        compound_wort_id: 'wt-fahrrad',
        component_wort_ids: ['wt-fahrrad', 'wt-rad'],
        split_display: 'Fahr·rad',
      },
    ],
  },
  {
    wurzel: {
      id: 'w-sprech',
      form: 'sprech',
      meaning_de: 'reden, sprechen',
      meaning_en: 'to speak',
      origin_lang: 'OHG',
    },
    words: [
      { id: 'wt-sprechen', lemma: 'sprechen', pos: 'verb', cefr_level: 'A1', definition_en: 'to speak' },
      { id: 'wt-sprache', lemma: 'Sprache', pos: 'noun', cefr_level: 'A2', definition_en: 'language' },
      { id: 'wt-versprechen', lemma: 'versprechen', pos: 'verb', cefr_level: 'B1', definition_en: 'to promise' },
      { id: 'wt-widerspruch', lemma: 'Widerspruch', pos: 'noun', cefr_level: 'B2', definition_en: 'contradiction' },
    ],
    links: [
      { wurzel_id: 'w-sprech', wort_id: 'wt-sprechen', derivation_path: 'sprech·en' },
      { wurzel_id: 'w-sprech', wort_id: 'wt-sprache', derivation_path: 'sprach·e' },
      { wurzel_id: 'w-sprech', wort_id: 'wt-versprechen', derivation_path: 'ver·sprech·en' },
      { wurzel_id: 'w-sprech', wort_id: 'wt-widerspruch', derivation_path: 'wider·spruch' },
    ],
    compounds: [],
  },
  {
    wurzel: {
      id: 'w-steh',
      form: 'steh',
      meaning_de: 'stehen, aufrecht sein',
      meaning_en: 'to stand',
      origin_lang: 'PIE',
      proto_form: '*steh₂-',
    },
    words: [
      { id: 'wt-stehen', lemma: 'stehen', pos: 'verb', cefr_level: 'A1', definition_en: 'to stand' },
      { id: 'wt-verstehen', lemma: 'verstehen', pos: 'verb', cefr_level: 'A1', definition_en: 'to understand' },
      { id: 'wt-bestehen', lemma: 'bestehen', pos: 'verb', cefr_level: 'B1', definition_en: 'to exist/pass' },
      { id: 'wt-entstehen', lemma: 'entstehen', pos: 'verb', cefr_level: 'B1', definition_en: 'to arise' },
      { id: 'wt-gegenstand', lemma: 'Gegenstand', pos: 'noun', cefr_level: 'B1', definition_en: 'object/subject' },
      { id: 'wt-zustand', lemma: 'Zustand', pos: 'noun', cefr_level: 'B1', definition_en: 'condition/state' },
    ],
    links: [
      { wurzel_id: 'w-steh', wort_id: 'wt-stehen', derivation_path: 'steh·en' },
      { wurzel_id: 'w-steh', wort_id: 'wt-verstehen', derivation_path: 'ver·steh·en' },
      { wurzel_id: 'w-steh', wort_id: 'wt-bestehen', derivation_path: 'be·steh·en' },
      { wurzel_id: 'w-steh', wort_id: 'wt-entstehen', derivation_path: 'ent·steh·en' },
      { wurzel_id: 'w-steh', wort_id: 'wt-gegenstand', derivation_path: 'gegen·stand' },
      { wurzel_id: 'w-steh', wort_id: 'wt-zustand', derivation_path: 'zu·stand' },
    ],
    compounds: [],
  },
  {
    wurzel: {
      id: 'w-schreib',
      form: 'schreib',
      meaning_de: 'schreiben, aufzeichnen',
      meaning_en: 'to write',
      origin_lang: 'Latin',
    },
    words: [
      { id: 'wt-schreiben', lemma: 'schreiben', pos: 'verb', cefr_level: 'A1', definition_en: 'to write' },
      { id: 'wt-beschreiben', lemma: 'beschreiben', pos: 'verb', cefr_level: 'B1', definition_en: 'to describe' },
      { id: 'wt-schrift', lemma: 'Schrift', pos: 'noun', cefr_level: 'B1', definition_en: 'script/writing' },
      { id: 'wt-vorschrift', lemma: 'Vorschrift', pos: 'noun', cefr_level: 'B2', definition_en: 'regulation' },
    ],
    links: [
      { wurzel_id: 'w-schreib', wort_id: 'wt-schreiben', derivation_path: 'schreib·en' },
      { wurzel_id: 'w-schreib', wort_id: 'wt-beschreiben', derivation_path: 'be·schreib·en' },
      { wurzel_id: 'w-schreib', wort_id: 'wt-schrift', derivation_path: 'schrift' },
      { wurzel_id: 'w-schreib', wort_id: 'wt-vorschrift', derivation_path: 'vor·schrift' },
    ],
    compounds: [],
  },
  {
    wurzel: {
      id: 'w-rad',
      form: 'rad',
      meaning_de: 'Rad, drehen',
      meaning_en: 'wheel, to turn',
      origin_lang: 'PIE',
      proto_form: '*rot-',
    },
    words: [
      { id: 'wt-rad', lemma: 'Rad', pos: 'noun', cefr_level: 'A2', definition_en: 'wheel' },
    ],
    links: [
      { wurzel_id: 'w-rad', wort_id: 'wt-rad', derivation_path: 'rad' },
    ],
    compounds: [],
  },
];
