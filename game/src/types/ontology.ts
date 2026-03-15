/**
 * Ontology types for Phase 0 (v2).
 * Matches the JSON schema produced by tools/export-ontology.py.
 */

// ---------------------------------------------------------------------------
// Etymology
// ---------------------------------------------------------------------------

/** One stage in a word's historical lineage (e.g. PIE → PGmc → OHG → MHG → NHG) */
export interface EtymologyStage {
  /** Language code: "ine-pro" | "gem-pro" | "goh" | "gmh" | "nhg" | "la" | … */
  stage: string;
  /** The word form at this stage, e.g. "*hūsą" or "hūs" */
  form: string;
  /** Human-readable language name, e.g. "Proto-Germanic" */
  lang_name: string;
  /** True for reconstructed forms (prefixed with *) */
  is_reconstructed: boolean;
}

/** A cognate in another modern language */
export interface Cognate {
  language: string;   // e.g. "English"
  form: string;       // e.g. "house"
}

/** Info about a borrowing (loanword) origin */
export interface BorrowingInfo {
  from_lang: string;  // e.g. "Latin"
  form: string;       // e.g. "fenestra"
  lang_code: string;  // e.g. "la"
}

// ---------------------------------------------------------------------------
// Morphology
// ---------------------------------------------------------------------------

/** One morphological segment of a word */
export interface MorphSegment {
  form: string;
  type: 'prefix' | 'root' | 'suffix';
  /** Human-readable description, e.g. "inseparable", "→ NOUN (f)", "infinitive" */
  function: string;
}

// ---------------------------------------------------------------------------
// Core ontology types
// ---------------------------------------------------------------------------

/** A root morpheme — the etymological anchor of a cluster */
export interface Wurzel {
  id: string;
  form: string;             // e.g. "fahr"
  meaning_de: string;
  meaning_en: string;
  origin_lang: string;      // e.g. "PIE" | "OHG" | "Latin"
  proto_form?: string;      // e.g. "*faraną"

  // v2 enrichments
  etymology_chain: EtymologyStage[];    // oldest first, ends with nhg
  cognates: Cognate[];
  borrowing_info?: BorrowingInfo | null;
  source_urls: Record<string, string>;  // { dwds_etymology: "…" }
}

/** A surface-level German word */
export interface Wort {
  id: string;
  lemma: string;
  pos: string;              // "NOUN" | "VERB" | "ADJ" | "ADV"
  ipa?: string;
  cefr_level?: string;      // "A1" | "A2"
  definition_en?: string;
  definition_de?: string;

  // v2 enrichments
  segments?: MorphSegment[] | null;     // null if no meaningful decomposition
  source_urls: Record<string, string>;  // { wiktionary: "…", dwds: "…" }
}

/** Root-to-word derivation link */
export interface WurzelWortLink {
  wurzel_id: string;
  wort_id: string;
  derivation_path?: string;
}

/** Compound relationship between words */
export interface CompoundLink {
  compound_wort_id: string;
  component_wort_ids: string[];
  split_display: string;    // e.g. "Fahr·rad"
}

/** A cluster of words sharing a root — used for island generation */
export interface RootCluster {
  wurzel: Wurzel;
  words: Wort[];
  links: WurzelWortLink[];
  compounds: CompoundLink[];
}
