**URWORT**

Root-Word Ontology Specification

Data Model, Entity Schema & Design Principles

Version 1.0 - March 2026

# 1\. Foundational Design Principles

## 1.1 The root is the atom, not the word

The central entity in the Urwort ontology is the Wurzel (root morpheme), not the Wort (surface word). A root like steh- (to stand) is the generative core from which stehen, verstehen, Verständnis, Gegenstand, Zustand, Aufstand, Bestand, Widerstand, and dozens more derive. The learner who internalises steh- gains leverage over an entire word family. The learner who memorises Verständnis gains one word.

This mirrors how native speakers process language. Psycholinguistic research (Marslen-Wilson et al., 1994; Clahsen et al., 2003) demonstrates that morphological decomposition is a core mechanism in German word recognition. The Urwort ontology makes this mechanism explicit and learnable.

## 1.2 Three pillars, woven together

Every root carries three interdependent layers of information:

- **Etymology:** Where does this root come from? What is its deepest recoverable ancestor? What sound changes connect the ancestral form to the modern one?
- **Morphology:** What does this root do in modern German? What prefixes, suffixes, and other roots combine with it? What allomorphs does it have?
- **Usage:** How frequent is this root? In what registers? With what collocations? This gives the learner prioritisation.

## 1.3 Grounded CEFR mapping

CEFR levels (A1-C2) are derived from the data, never manually imposed. The CEFR tag lives on the Wort (surface word) entity, not the Wurzel, because a single root spans multiple difficulty levels. The root steh- yields stehen (A1), Verstand (B1), Gegenständlichkeit (C2). However, each Wurzel aggregates the CEFR distribution of its word family, producing a "root value score" - high-value roots have many low-CEFR descendants.

The CEFR mapping is computed from: (a) frequency rank in balanced corpora (DWDS, DeReWo); (b) morphological transparency (how decomposable is the word?); (c) register breadth (words used across many registers are more useful); (d) phonological regularity. This is a computable function, not a lookup table, and it updates as corpus data updates.

## 1.4 Provenance over gatekeeping

Every datum in the ontology carries its source. The ontology is not a replacement for DWDS, Grimm's Wörterbuch, or Grammis - it is an index that points the user to these resources. Every etymological claim links to the specific entry in Pfeifer, Kluge, or Köbler. Every frequency figure links to the specific corpus query. The user is always one click away from the primary source.

## 1.5 Honest treatment of loanwords

Not all German words decompose into Germanic roots. The ontology handles this honestly through a Borrowing Pathway entity. A word like Fenster (window, from Latin fenestra) has a dual trace: its pathway into German (when, through what contact situation, with what phonological adaptation) and the etymology of the source word itself (Latin fenestra, possibly from Etruscan). The deepest recoverable root is always pursued, regardless of language family.

This means the ontology contains not just Proto-Germanic and Proto-Indo-European roots, but also Latin, Greek, French, Arabic, and other etyma where they are the actual source. Marking a word as "loanword" is itself informative - it teaches the learner about the cultural history embedded in the vocabulary.

# 2\. Entity Definitions

The ontology consists of seven primary entity types and their relationships. The schema is designed for implementation as a graph database (Neo4j recommended) or an RDF triplestore (using OntoLex-Lemon as the base vocabulary).

## 2.1 Wurzel (Root Morpheme) - Core Entity

The central node. Every other entity connects through it.

| **Field**          | **Type**    | **Description**                                                                        |
| ------------------ | ----------- | -------------------------------------------------------------------------------------- |
| wurzel_id          | UUID        | Unique identifier                                                                      |
| form               | String      | Canonical modern form (e.g. steh-, sprech-, Haus-)                                     |
| allomorphs         | \[String\]  | All surface variants (e.g. \[steh-, stand-, stünd-, stund-, gest-\])                   |
| root_type          | Enum        | VERBAL \| NOMINAL \| ADJECTIVAL \| FUNCTIONAL                                          |
| origin_type        | Enum        | GERMANIC \| LATIN \| GREEK \| FRENCH \| SLAVIC \| ARABIC \| CELTIC \| UNKNOWN \| OTHER |
| deepest_etymon_id  | FK → Etymon | Link to deepest recoverable ancestor form                                              |
| productivity_score | Float 0-1   | How actively this root generates new words. Computed from recent corpus data.          |
| family_size        | Integer     | Count of distinct attested Wort entities derived from this root                        |
| family_cefr_dist   | Object      | {A1: n, A2: n, B1: n, B2: n, C1: n, C2: n}                                             |
| root_value_score   | Float       | Composite: weighted sum of family_size, frequency, CEFR breadth. Higher = learn first. |
| semantic_field     | \[String\]  | Broad semantic categories from GermaNet or manual curation                             |
| provenance         | \[Source\]  | Array of Source entities for each data point                                           |

## 2.2 Etymon (Historical Ancestor Form)

Represents a single stage in a root's historical chain. Etymon entities form a linked list from the modern root back to the deepest recoverable ancestor.

| **Field**                 | **Type**        | **Description**                                                                                                                         |
| ------------------------- | --------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| etymon_id                 | UUID            | Unique identifier                                                                                                                       |
| form                      | String          | Reconstructed or attested form (e.g. \*steh₂- for PIE, \*standaną for PGmc)                                                             |
| language_stage            | Enum            | PIE \| PROTO_GERMANIC \| GOTHIC \| OLD_HIGH_GERMAN \| MIDDLE_HIGH_GERMAN \| EARLY_NHG \| LATIN \| GREEK \| OLD_FRENCH \| ARABIC \| etc. |
| date_range                | String          | Approximate period (e.g. "c. 4500-2500 BCE" for PIE)                                                                                    |
| meaning                   | String          | Reconstructed or attested meaning at this stage                                                                                         |
| is_reconstructed          | Boolean         | True if form is reconstructed (marked with \*), false if attested                                                                       |
| sound_changes_from_parent | \[SoundChange\] | Phonological changes connecting this form to its parent Etymon                                                                          |
| parent_etymon_id          | FK → Etymon     | Next older form in the chain. Null for deepest ancestor.                                                                                |
| cognates                  | \[CognateLink\] | Same ancestral form in sister languages (Eng stand, Du staan, Sw stå)                                                                   |
| first_attestation         | String          | Earliest known written occurrence with text reference                                                                                   |
| provenance                | \[Source\]      | Source citations (Kluge p.XXX, Pfeifer via DWDS, Köbler URL)                                                                            |

## 2.3 Wort (Surface Word)

The word as the learner encounters it. Every Wort links back to one or more Wurzel entities through its morphological decomposition.

| **Field**             | **Type**        | **Description**                                                                                     |
| --------------------- | --------------- | --------------------------------------------------------------------------------------------------- |
| wort_id               | UUID            | Unique identifier                                                                                   |
| lemma                 | String          | Citation form (infinitive for verbs, nom. sg. for nouns)                                            |
| pos                   | Enum            | NOUN \| VERB \| ADJECTIVE \| ADVERB \| PREPOSITION \| CONJUNCTION \| PARTICLE \| ARTICLE \| PRONOUN |
| gender                | Enum\|null      | MASCULINE \| FEMININE \| NEUTER (nouns only)                                                        |
| decomposition         | \[MorphUnit\]   | Ordered morphological units: \[{type: ROOT, wurzel_id: ...}, {type: PREFIX, affix_id: ...}, ...\]   |
| ipa                   | String          | IPA transcription (standard pronunciation)                                                          |
| audio_url             | String\|null    | Link to pronunciation audio (Forvo, Wiktionary)                                                     |
| frequency_rank        | Integer         | Rank in DWDS/DeReWo frequency list                                                                  |
| frequency_per_million | Float           | Occurrences per million tokens from balanced corpus                                                 |
| register_dist         | Object          | {literary: x, colloquial: x, scientific: x, legal: x, journalistic: x, spoken: x}                   |
| cefr_level            | Enum            | A1 \| A2 \| B1 \| B2 \| C1 \| C2 - derived from frequency + complexity                              |
| cefr_confidence       | Float 0-1       | Confidence of CEFR derivation (0.95 for clear cases, 0.6 for ambiguous)                             |
| definitions           | \[Definition\]  | Array of sense definitions, each with source citation                                               |
| collocations          | \[Collocation\] | High-frequency word combinations from DWDS word profiles                                            |
| example_sentences     | \[Example\]     | Graded examples from A1 to C2, with source citations                                                |
| inflection_table      | Object          | Complete inflection paradigm from Wiktionary/DWDS                                                   |
| provenance            | \[Source\]      | Sources for each data point                                                                         |

## 2.4 Affix (Prefix, Suffix, Circumfix)

Affixes are first-class entities with their own etymology and semantics.

| **Field**          | **Type**      | **Description**                                                                   |
| ------------------ | ------------- | --------------------------------------------------------------------------------- |
| affix_id           | UUID          | Unique identifier                                                                 |
| form               | String        | The affix (e.g. ver-, ent-, -ung, -heit, -lich, ge-...-t)                         |
| affix_type         | Enum          | PREFIX \| SUFFIX \| CIRCUMFIX \| INFIX                                            |
| separable          | Boolean\|null | For verbal prefixes: true if separable, false if inseparable, null if n/a         |
| semantic_functions | \[String\]    | Meanings this affix adds (e.g. ver-: \["completion", "transformation", "error"\]) |
| grammatical_effect | Object        | Output POS/gender (e.g. -ung: {output_pos: NOUN, output_gender: FEMININE})        |
| etymology_chain    | \[Etymon\]    | The affix's own etymological history (e.g. ver- from PGmc \*fra-/for-)            |
| productivity       | Float 0-1     | How freely this affix combines with new roots in modern German                    |
| combines_with      | \[RootType\]  | Which root types it attaches to                                                   |
| provenance         | \[Source\]    | Source citations (Fleischer & Barz, Grammis)                                      |

## 2.5 Kompositum (Compound Word Analysis)

Stores the decomposition structure and semantic relationship between parts of German compounds.

| **Field**         | **Type**     | **Description**                                            |
| ----------------- | ------------ | ---------------------------------------------------------- |
| kompositum_id     | UUID         | Unique identifier (also a Wort entity)                     |
| wort_id           | FK → Wort    | Link to the surface word entry                             |
| head              | FK → Wort    | Grundwort (rightmost element, determines gender/POS)       |
| modifier          | FK → Wort    | Bestimmungswort (leftmost element)                         |
| fugenelement      | String\|null | Linking element (-s-, -en-, -n-, etc.)                     |
| compound_type     | Enum         | DETERMINATIVE \| COPULATIVE \| POSSESSIVE \| VERBAL        |
| semantic_relation | String       | Human-readable (e.g. "house for the sick" for Krankenhaus) |
| transparency      | Float 0-1    | How predictable the compound's meaning is from its parts   |
| nesting_depth     | Integer      | Levels of compounding                                      |
| provenance        | \[Source\]   | Sources                                                    |

## 2.6 Source (Provenance Record)

Every datum links to Source entities. This makes Urwort a gateway to primary sources.

| **Field**      | **Type**     | **Description**                                                                                        |
| -------------- | ------------ | ------------------------------------------------------------------------------------------------------ |
| source_id      | UUID         | Unique identifier                                                                                      |
| source_type    | Enum         | DICTIONARY \| CORPUS \| GRAMMAR \| ACADEMIC_PAPER \| DIGITAL_ARCHIVE \| WIKTIONARY \| USER_CONTRIBUTED |
| name           | String       | Human-readable name (e.g. "Pfeifer, Etymologisches Wörterbuch")                                        |
| url            | String\|null | Direct URL to the specific entry. The link the user follows.                                           |
| citation       | String       | Full academic citation                                                                                 |
| licence        | String       | CC-BY, CC0, public domain, fair use, etc.                                                              |
| retrieval_date | Date         | When the data was accessed                                                                             |
| confidence     | Float 0-1    | How reliable this source is for this claim                                                             |
| is_open_access | Boolean      | Can the user access this source freely?                                                                |

## 2.7 SoundChange (Phonological Transformation Record)

Records specific phonological changes connecting one Etymon stage to the next.

| **Field**        | **Type**     | **Description**                                             |
| ---------------- | ------------ | ----------------------------------------------------------- |
| change_id        | UUID         | Unique identifier                                           |
| name             | String       | Named sound law if applicable (Grimm's Law, HGCS, i-Umlaut) |
| from_phoneme     | String       | Input sound (IPA)                                           |
| to_phoneme       | String       | Output sound (IPA)                                          |
| environment      | String\|null | Phonological environment (word-initial, after vowel, etc.)  |
| approximate_date | String       | When this change occurred                                   |
| provenance       | \[Source\]   | Academic sources documenting this change                    |

# 3\. Relationships Between Entities

The power of the ontology lies in its relationships. In a graph database, these are edges; in RDF, they are predicates.

| **Relationship** | **From**      | **To**      | **Description**                            |
| ---------------- | ------------- | ----------- | ------------------------------------------ |
| DERIVED_FROM     | Wort          | Wurzel      | This word is built from this root          |
| HAS_ETYMON_CHAIN | Wurzel        | Etymon      | This root traces back through these stages |
| PARENT_ETYMON    | Etymon        | Etymon      | This form evolved from this older form     |
| COGNATE_OF       | Etymon        | Etymon      | Same ancestor, different language branch   |
| MODIFIED_BY      | Wort          | Affix       | This word carries this affix               |
| COMPOUNDS_WITH   | Wurzel        | Wurzel      | These roots appear together in compounds   |
| SAME_FAMILY      | Wort          | Wort        | These words share a root (bidirectional)   |
| BORROWED_FROM    | Wurzel        | Etymon      | Root entered German via borrowing          |
| SOURCED_FROM     | \* (any)      | Source      | This datum was obtained from this source   |
| UNDERWENT        | Etymon→Etymon | SoundChange | This transition involved this sound change |

# 4\. Worked Example: The Root steh-

A complete trace of the root steh- (to stand) through all three pillars.

## 4.1 Wurzel Record

form: steh-

allomorphs: \[steh-, stand-, stünd-, stund-, gest-, -ständ-\]

root_type: VERBAL

origin_type: GERMANIC

family_size: ~87 (including compounds)

productivity_score: 0.72

family_cefr_dist: {A1: 3, A2: 5, B1: 12, B2: 18, C1: 28, C2: 21}

root_value_score: 0.94 (top 2% of all roots)

semantic_field: \["position", "stability", "comprehension", "resistance"\]

## 4.2 Etymon Chain

**Stage 5 (deepest):** PIE \*steh₂- - "to stand, to place" - reconstructed - c. 4500-2500 BCE

_Cognates: Latin stāre, Greek histānai, Sanskrit tiṣṭhati, Lithuanian stóti_

**Stage 4:** Proto-Germanic \*standaną - "to stand" - reconstructed - c. 500 BCE-200 CE

**Stage 3:** Old High German stān / stantan - attested - c. 750-1050 CE

_First attestation: Tatian translation (c. 830 CE)_

**Stage 2:** Middle High German stān / standen - attested - c. 1050-1350 CE

**Stage 1:** Early NHG stehen - c. 1350-1650 CE - vowel lengthening in open syllable

**Modern:** stehen / steh- with allomorphs stand-, stünd-, etc.

## 4.3 Selected Word Family Members

**stehen** (A1) - to stand - \[steh- (ROOT)\]

**verstehen** (A2) - to understand - \[ver- (PREFIX:completion), steh- (ROOT)\]

**Verstand** (B1) - reason - \[ver- (PREFIX), stand- (ROOT allomorph)\]

**Verständnis** (B1) - understanding - \[ver-, ständ- (ROOT), -nis (SUFFIX:abstract)\]

**Gegenstand** (B1) - object - \[gegen- (PREFIX:opposition), stand-\]

**Zustand** (B1) - condition - \[zu- (PREFIX:towards), stand-\]

**Aufstand** (B2) - uprising - \[auf- (PREFIX:upward), stand-\]

**Widerstand** (B2) - resistance - \[wider- (PREFIX:against), stand-\]

**beständig** (B2) - constant - \[be-, ständ-, -ig (SUFFIX:adj)\]

**selbstverständlich** (B2) - self-evident - \[selbst-, ver-, ständ-, -lich\]

**Gegenständlichkeit** (C2) - objectivity - \[gegen-, ständ-, -lich, -keit\]

## 4.4 Provenance

- **Etymon chain:** Kluge 25th ed. p.879; Pfeifer via DWDS; Köbler OHG "stān"
- **PIE reconstruction:** Pokorny IEW \*st(h)e-; Kroonen EDPG \*stand-a-
- **Frequency:** DWDS Kernkorpus 21; DeReWo 2020 (IDS)
- **Morphology:** Fleischer & Barz 5th ed.; Grammis Wortbildung
- **CEFR:** Goethe-Institut Wortliste (A1-B1); Profile Deutsch (B2-C2); DWDS frequency cross-check

# 5\. Technical Implementation Notes

## 5.1 Recommended Technology Stack

- **Graph Database:** Neo4j community edition (open source). Cypher queries for traversals.
- **Ontology Standard:** OntoLex-Lemon (W3C) for RDF export and interoperability.
- **NLP Pipeline:** spaCy (de_core_news_lg) + DEMorphy for automated morphological decomposition.
- **Data Ingestion:** Python scripts parsing DWDS API, Wiktionary dumps (XML), Köbler HTML, DTA TEI-XML.
- **API:** GraphQL over Neo4j backend for flexible game frontend queries.
- **Frontend:** React + Three.js for the 2.5D/3D spatial interface.

## 5.2 Data Seeding Strategy

- **Phase 1 - Core 200 roots:** The 200 most productive Germanic roots, covering ~60-70% of everyday vocabulary.
- **Phase 2 - Affix inventory:** Complete inventory (~40 prefixes, ~50 suffixes) from Grammis.
- **Phase 3 - A1-B1 word families:** Full word families for core 200 roots at beginner-intermediate levels.
- **Phase 4 - Loanword roots:** 100 most frequent non-Germanic roots with source-language etymologies.
- **Phase 5 - Expansion:** B2-C2 vocabulary, rare roots, dialectal forms, historical vocabulary.

## 5.3 CEFR Derivation Algorithm

cefr_score = w1\*frequency_percentile + w2\*morphological_complexity + w3\*register_breadth + w4\*phonological_regularity

Weights w1-w4 calibrated against Goethe-Institut word lists (A1-B1) and Profile Deutsch (B2-C2). Published as open-source code for audit.

# 6\. Open Questions & Design Decisions

- **Root granularity:** Is Licht (light) the same root as leicht (easy)? Historically yes (PIE \*legʷh-), synchronically no. Need a "synchronic transparency" score alongside the etymological link.
- **Ablaut handling:** sprech-/sprach-/sproch- treated as allomorphs of a single Wurzel, but needs clear documentation.
- **Compound recursion:** Full recursive decomposition stored as a tree structure (recommended).
- **User contributions:** Need review/validation workflow. Source type: USER_CONTRIBUTED with lower confidence scores.
- **Dialectal variation:** Plattdeutsch, Bavarian, Swiss, Austrian forms as optional layers linked to standard form.
- **Multiword expressions:** Idioms (auf dem Schlauch stehen) as separate entity type linking to Wurzel entries.
- **Diachronic frequency:** Historical frequency from DWDS for potential "time travel" game feature.
- **Semantic drift:** Some roots have shifted meaning dramatically (e.g. schlecht originally meant "plain/simple"). Track meaning evolution per Etymon stage.
- **Homophonous roots:** Bank (bench) vs. Bank (financial institution) have different etymologies. Need disambiguation mechanism.