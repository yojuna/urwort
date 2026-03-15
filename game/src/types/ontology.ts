/**
 * Minimal ontology types for Phase 0.
 * Maps to the SQLite schema defined in tools/schema.sql (to be extended).
 */

/** A root morpheme — the atomic unit of the ontology */
export interface Wurzel {
  id: string;
  form: string;            // e.g. "fahr"
  meaning_de: string;
  meaning_en: string;
  origin_lang: string;     // "PIE" | "OHG" | "MHG" | "Latin" | "Greek" etc.
  proto_form?: string;     // e.g. "*per-" for PIE ancestor
}

/** A surface-level German word */
export interface Wort {
  id: string;
  lemma: string;           // e.g. "Erfahrung"
  pos: string;             // part of speech
  ipa?: string;
  frequency?: number;      // 0-1 normalised
  cefr_level?: string;     // A1-C2
  definition_de?: string;
  definition_en?: string;
}

/** Root-to-word derivation link */
export interface WurzelWortLink {
  wurzel_id: string;
  wort_id: string;
  derivation_path?: string; // e.g. "fahr → er·fahr·ung"
}

/** Compound relationship between words */
export interface CompoundLink {
  compound_wort_id: string;
  component_wort_ids: string[];
  split_display: string;   // e.g. "Fahr·rad"
}

/** A cluster of words sharing a root — used for island generation */
export interface RootCluster {
  wurzel: Wurzel;
  words: Wort[];
  links: WurzelWortLink[];
  compounds: CompoundLink[];
}
