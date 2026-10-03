# Open resources for urwort: catalogue (researched 2026-10-03)

**Use** says how a resource may be used under the project's rule (monetisable game: shipped data must be commercial-safe):

- **ship**: commercial-safe (CC0, CC BY, CC BY-SA, Apache/MIT data). May end up in game data, with attribution.
- **check**: non-commercial or unclear. Use only to evaluate our own data; never shipped.
- **link**: no bulk or automated use allowed; link out only.

★ = recommended next. "In use" = already in pipeline-v2.

## 1. Levels (CEFR) and frequency

| Resource | What | License | Use |
|---|---|---|---|
| ★ [Deutsch im Blick](https://coerll.utexas.edu/dib/) vocab via [ghrgriner/deutsch-im-blick](https://github.com/ghrgriner/deutsch-im-blick) | First-year university course (≈A1–A2): end-of-chapter vocabulary in chapter order, audio, Wiktionary sense links | textbook CC BY 4.0, repo CC BY-SA 4.0 | ship |
| ★ [MERLIN](https://www.merlin-platform.eu/) ([CLARIN](https://clarin.eurac.edu/repository/xmlui/handle/20.500.12124/59)) | ~1,000 German learner texts rated A1–C1 (2,286 texts across Czech, German, Italian): the words learners actually produce per level | CC BY-SA 4.0 | ship |
| ★ [Klexikon](https://huggingface.co/datasets/dennlinger/klexikon) | ~2,900 children's-encyclopedia articles in simple German, aligned with Wikipedia | CC BY-SA | ship |
| ★ [The German Commons](https://huggingface.co/datasets/coral-nlp/german-commons) | 154 B tokens, every document openly licensed (≥ CC BY-SA): frequency, example sentences | per doc, ≥ CC BY-SA 4.0 | ship |
| [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (OpenSubtitles 2018) | Spoken-style frequency, like SUBTLEX | CC BY-SA 4.0 | ship |
| [Google Books Ngram](https://storage.googleapis.com/books/ngrams/books/datasetsv3.html) | German frequency per year: how a word's use rose and fell | CC BY 3.0 | ship |
| wordfreq | Blended frequency (in use) | CC BY-SA 4.0 | ship |
| Goethe-Institut [A1](https://www.goethe.de/pro/relaunch/prf/de/A1_SD1_Wortliste_02.pdf)/A2/B1 Wortlisten | Official exam word lists. **The old game's CEFR came from a community copy of these** ("goethe_a1a2_community"); the `lschmelzeisen/cefr-word-lists` URL in the old manifest never existed | © Goethe-Institut | check |
| [DAFlex](https://cental.uclouvain.be/cefrlex/daflex/) | CEFR frequencies from textbooks; no bulk download offered | CC BY-NC-SA 4.0 | check |
| [SUBTLEX-DE](https://econtent.hogrefe.com/doi/10.1027/1618-3169/a000123) | Subtitle frequency, the psycholinguistic standard | free for education | check |
| [DeReWo](https://corpora.ids-mannheim.de/libac/hk.html) (IDS) | Frequency classes from 3 B words | CC BY-NC | check |
| [Leipzig Corpora](https://wortschatz.uni-leipzig.de/en/download) | Sentences and frequencies; the site gives both "CC BY" and "non-commercial" statements, and blocks automated checks | unclear | check until verified by hand |

**Proposed level model (commercial-safe):** estimate each word's level from the Deutsch im Blick chapter
(A1–A2 anchor), first use in MERLIN learner texts by rated level, presence in Klexikon, frequency (wordfreq,
FrequencyWords, German Commons), and family/affix difficulty (Bauer & Nation 1993 criteria). Evaluate the
estimates against the Goethe lists and DAFlex as check-only references.

## 2. Word structure and transparency

| Resource | What | License | Use |
|---|---|---|---|
| DErivBase 2.0, MorphyNet, Wiktionary en+de | derivation families (in use) | CC BY-SA | ship |
| ★ [UniMorph deu](https://github.com/unimorph/deu) | 520k inflected forms (29k nouns, 7k verbs, 5k adjectives): plurals, strong-verb forms (fuhr/gefahren) | CC BY-SA 3.0 | ship |
| [Zmorge](https://pub.cl.uzh.ch/users/sennrich/zmorge/) / [DWDSmor open](https://huggingface.co/zentrum-lexikographie/dwdsmor-open) | Analysers that split words into parts; run at build time | lexicon CC BY-SA / GPL tool | ship (output) |
| [GLeMM](https://arxiv.org/abs/2604.12442) (2026) | New Wiktionary-derived derivation resource with semantic descriptions | check release | check → ship? |
| [GhoSt-PV](https://aclanthology.org/W16-5318/) | Human ratings of 400 particle verbs: how literal/transparent (*anfangen* vs *aufhören*) | "Creative Commons" (version to confirm) | check → ship? |
| [GhoSt-NN](https://www.ims.uni-stuttgart.de/forschung/ressourcen/lexika/ghost-nn/) | 868 noun compounds with transparency ratings | non-commercial | check |
| [Günther et al. 2020](https://www.researchgate.net/publication/339220644_Semantic_transparency_effects_in_German_compounds_A_large_dataset_and_multiple-task_investigation) | Transparency for 1,810 rated + 40k modelled compounds (OSF) | license to confirm | check |
| [GermaNet](https://en.wikipedia.org/wiki/GermaNet) | 82k hand-checked compound splits, wordnet | signed license (commercial for a fee) | check |

## 3. History, etymology, cognates

| Resource | What | License | Use |
|---|---|---|---|
| ★ [IE-CoR](https://iecor.clld.org/) ([GitHub](https://github.com/lexibank/iecor)) | Expert cognate sets for 160 IE languages, 170 core meanings; 342 German words with PIE/PGmc root, doubt marks, citations (Kroonen 2013, Kluge, LIV) | CC BY 4.0 | ship |
| ★ [Wortgeschichte digital](https://www.zdl.org/wb/wgd/api) (ZDL) | 778 scholarly word histories 1600–today (modern social and political vocabulary), TEI download plus JSON API | CC BY-SA 4.0 | ship |
| [Lehnwortportal Deutsch](https://euralex.org/publications/lehnwortportal-deutsch-a-new-architecture-for-resources-on-lexical-borrowings/) (IDS) | German words borrowed into ~15 other languages (Kindergarten, Angst…) | CC BY-SA 4.0 | ship |
| Wiktionary reconstruction pages (Proto-Germanic, Proto-West-Germanic, Proto-Indo-European) | Chains and descendants (in use) | CC BY-SA | ship |
| [EtymDB 2.0](https://almanach.inria.fr/software_and_resources/EtymDB-en.html) / [Etymological Wordnet](https://www1.icsi.berkeley.edu/~demelo/etymwn/) | Wiktionary-derived etymology graphs (older snapshots; same source as ours) | CC BY-SA | ship (low added value) |
| [Wörterbuchnetz](https://woerterbuchnetz.de/) (Grimm DWB, Lexer, BMZ) | Historical dictionaries with free API; data license not stated | unclear | link (ask Trier for terms) |
| [ReM](https://linguistics.rub.de/rem//access/index.en.html) | Annotated Middle High German texts 1050–1350 | CC BY-SA 4.0 | ship |
| [ReA](https://www.deutschdiachrondigital.de/) | Old High German texts 750–1050 | CC BY-NC-SA | check |
| [CogNet](https://github.com/kbatsuren/CogNet) | 8M cognate pairs | CC BY-NC-SA 4.0 | check |
| DWDS incl. Pfeifer's etymological dictionary | Best modern etymologies, but **the terms of use forbid automated access/text mining without BBAW permission** | © BBAW | link |

## 4. Meaning, examples, pronunciation, media

| Resource | What | License | Use |
|---|---|---|---|
| [OdeNet](https://github.com/hdaSprachtechnologie/odenet) | Open German wordnet: senses, hypernyms → semantic fields for map regions | CC BY-SA 4.0 | ship |
| [OpenThesaurus](https://www.openthesaurus.de/about/download) | 280k synonyms | CC BY-SA 4.0 or LGPL | ship |
| ★ [Tatoeba](https://tatoeba.org/en/downloads) | German–English sentence pairs; audio per sentence (license per recording) | CC BY 2.0 FR (text) | ship |
| [Common Voice](https://commonvoice.mozilla.org/) | 1,000+ h of German read speech with sentences | CC0 | ship |
| ★ [Lingua Libre](https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation-deu) | 25,500 single-word German recordings | CC BY-SA 4.0 | ship |
| [WikiPron](https://github.com/CUNY-CL/wikipron) | IPA dictionary mined from Wiktionary | CC BY-SA 3.0 (data) | ship |
| Wikidata lexemes | 242k German lexemes, CC0; senses link to items with images (P18) → illustrations | CC0 (images: per file) | ship |
| [DTA](https://www.deutschestextarchiv.de/download) | 1600–1900 texts, 155M tokens: historical attestations | CC BY-SA 4.0 | ship |
| [de-Corp](https://openhumanitiesdata.metajnl.com/articles/10.5334/johd.350) | ~5,000 public-domain fiction and non-fiction texts 1780–1930 (Gutenberg) | public domain texts | ship (check per text) |
