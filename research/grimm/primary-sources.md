# Brothers Grimm: primary sources catalogue

Research for urwort (Grimm frame: assistant to the Grimms, Hesse c. 1807–1815). Compiled 2026-10-31.

**How to read this**
- **Ship** means public domain, CC0, CC BY or CC BY-SA, so it is safe to ship in a commercial game.
- **Check** means NC, ND, "private use only", or no confirmed licence. Use it to verify things, not to ship.
- **Licence** is the licence of the *digital transcription or scan*. Every work listed here is public domain as a work: Jacob died in 1863 and Wilhelm in 1859.
- **Unverified** means I could not find the licence text on the provider's site.
- Local copies are in `raw-data/grimm/` (gitignored). `raw-data/grimm/MANIFEST.tsv` lists one row per file.

## 0. Summary of the best machine-readable sources

| Need | Best source | Format | Per tale? | Licence | Use |
|---|---|---|---|---|---|
| KHM, every Große Ausgabe 1812–1857, plus the 1856 notes volume | de.wikisource (proofread "fertig" from scans) | wiki HTML → plain text (downloaded) | **yes**, one page per tale per edition | Text is PD (de.wikisource FAQ, verified); editorial additions are CC BY-SA 4.0 | **ship** |
| KHM 1812/1815 Grimm notes ("Anhang") | de.wikisource, embedded in each 1812/1815 tale page | text (downloaded as `*.notes.txt`) | yes | PD | **ship** |
| KHM all editions in TEI with linguistic annotation | Deutsches Textarchiv (DTA) | TEI-P5 XML, TCF, plain text | no, one volume per file (tale divisions are in the TEI) | CC BY-SA 4.0 stated, but the terms page also has non-commercial wording (see Licence notes) | **manual download**, check |
| Deutsche Sagen 1816/1818 (585 Sagen) | de.wikisource | text (downloaded) | **yes**, one page per Sage | PD | **ship** |
| Deutsche Sagen vol. 1 (1816) | Project Gutenberg #76558 (PGDP-proofread) | plain text (downloaded) | no, one file (numbered) | PD | ship (strip the PG boilerplate) |
| Deutsche Grammatik, Mythologie, Geschichte d. dt. Sprache, Irische Elfenmärchen, Altdeutsche Wälder, speeches, letters | Internet Archive (Google/BSB scans) | raw OCR `_djvu.txt` (downloaded); Fraktur OCR is noisy | no | Text PD; IA marks most items PDM / NOT_IN_COPYRIGHT | ship text after correction; scans are fine to view |
| Deutsches Wörterbuch | woerterbuchnetz.de (Trier) | web plus JSON API | per lemma | **unverified**: no licence statement found | check / link |

---

## 1. Kinder- und Hausmärchen (KHM)

### 1.1 Große Ausgabe, by edition

The de.wikisource overview page [Kinder- und Hausmärchen](https://de.wikisource.org/wiki/Kinder-_und_Hausm%C3%A4rchen) has a sortable table that links every tale in every edition. All 1,341 per-tale pages exist (checked through the API). The DTA identifiers were resolved through the CLARIN-BBAW repository handles (clarin.bbaw.de `dta:*`), which redirect to `deutschestextarchiv.de/book/download_xml/<id>`.

| Edition | Publisher | de.wikisource (per tale) | DTA (TEI, manual) | Scans (IA / Google / MDZ / Commons / other) | Other text |
|---|---|---|---|---|---|
| 1st ed. vol. 1, 1812 (86 nos., with notes "Anhang" at the end of the volume) | Berlin: Realschulbuchhandlung (Reimer) | [Band 1 (1812)](https://de.wikisource.org/wiki/Kinder-_und_Haus-M%C3%A4rchen_Band_1_(1812)): Vorrede plus 86 tales plus fragments (85a–d); each page also carries the matching Anhang notes. Status fertig. | `grimm_maerchen01_1812` (dta:382; copy SBB-PK Yt 1067-1/2 R) | IA [GrimmKinderUndHausmaerchen1-1812](https://archive.org/details/GrimmKinderUndHausmaerchen1-1812) (PDF 87 MB, OCR); Commons cat. "Kinder und Hausmärchen (Grimm) 1812 I" | Zeno.org "KHM (1812-15)" (licence unverified); old.grimms.de (source of the WS transcription; site defunct) |
| 1st ed. vol. 2, "1815" (printed 1814; 70 nos., with Anhang) | Berlin: Realschulbuchhandlung | [Band 2 (1815)](https://de.wikisource.org/wiki/Kinder-_und_Haus-M%C3%A4rchen_Band_2_(1815)): Vorrede plus 70 tales, notes embedded | `grimm_maerchen02_1815` (dta:383) | Commons cat. "Kinder und Hausmärchen (Grimm) 1812 II" | Zeno (as above) |
| 2nd ed. 1819, vols. 1–2 (161 tales plus 9 Kinderlegenden; notes separated) | Berlin: G. Reimer | [Band 1 (1819)](https://de.wikisource.org/wiki/Kinder-_und_Haus-M%C3%A4rchen_Band_1_(1819)), [Band 2 (1819)](https://de.wikisource.org/wiki/Kinder-_und_Haus-M%C3%A4rchen_Band_2_(1819)) | `grimm_maerchen01_1819` (dta:3730), `grimm_maerchen02_1819` (dta:3736) | IA uploads "die-marchen-der-gebruder-grimm-kinder-und-hausmarchen-…-20200716" (private uploads, provenance unclear) | n/a |
| 2nd ed. vol. 3, 1822 (Anmerkungen) | Berlin: G. Reimer | **not transcribed**; scans only at Commons ["De Märchen Grimm Band 3 (1822)"](https://commons.wikimedia.org/wiki/Category:De_M%C3%A4rchen_Grimm_Band_3_(1822)) | not in DTA (checked CLARIN Grimm objects dta:380–384, 3730–3741) | Commons scans (PD) | none found; the 1856 revision (below) supersedes it |
| 3rd ed. 1837, vols. 1–2 | Göttingen: Dieterich | Band 1/2 (1837), per tale | `grimm_maerchen01_1837` (dta:3731), `…02_1837` (dta:3737) | Google Books (various) | n/a |
| 4th ed. 1840 | Göttingen: Dieterich | Band 1/2 (1840), per tale | `grimm_maerchen01_1840` (dta:3732), `…02_1840` (dta:3738) | n/a | n/a |
| 5th ed. 1843 | Göttingen: Dieterich | Band 1/2 (1843), per tale | `grimm_maerchen01_1843` (dta:3733), `…02_1843` (dta:3739) | IA bub_gb_QNkDAAAAQAAJ | n/a |
| 6th ed. 1850 | Göttingen: Dieterich | Band 1/2 (1850), per tale | `grimm_maerchen01_1850` (dta:3734), `…02_1850` (dta:3740) | IA 10109709bsb (BSB) | n/a |
| 3rd ed. vol. 3, 1856 (Anmerkungen, Bruchstücke, Literatur, Zeugnisse, Register) | Göttingen: Dieterich | [Band 3 (1856)](https://de.wikisource.org/wiki/Kinder-_und_Haus-M%C3%A4rchen_Band_3_(1856)) plus subpages /Anmerkungen, /Bruchstücke, /Literatur, /Zeugnisse, /Register | not in DTA | IA [kinderundhausmr15grimgoog](https://archive.org/details/kinderundhausmr15grimgoog), bub_gb_vUQWAAAAYAAJ, bub_gb_fo06AAAAcAAJ; ULB Düsseldorf 1-4053 | n/a |
| 7th ed. 1857, "Ausgabe letzter Hand" (200 tales plus 10 Kinderlegenden) | Göttingen: Dieterich | [Band 1 (1857)](https://de.wikisource.org/wiki/Kinder-_und_Haus-M%C3%A4rchen_Band_1_(1857)), [Band 2 (1857)](https://de.wikisource.org/wiki/Kinder-_und_Haus-M%C3%A4rchen_Band_2_(1857)) | `grimm_maerchen01_1857` (dta:3735), `…02_1857` (dta:3741) | IA kinderundhausmr19grimgoog, kinderundhausmr09grimgoog (Oxford), kinderundhausmr04grimgoog (NYPL) | Zeno.org "Kinder- und Hausmärchen" (letzter Hand; licence unverified); projekt-gutenberg.org (private use only, so **check only**); gutenberg.org has **no** German KHM text (only audio #20050/#20051 and a 1921 selection #77905) |

Wikisource also holds Grimm-related standalone pieces: *Das Märchen vom Schneider der in den Himmel kam* and *Märchen von einem, der auszog…* (both from *Wünschelruthe* 1818), *Zwei Thiermärchen*, *Albanesische Märchen*, *Der Swinegel* (all from Zs. f. dt. Mythologie 1853), and Steig, *Zur Entstehungsgeschichte der Märchen und Sagen der Brüder Grimm* (1907). All of these are downloaded to `wikisource/other/`.

### 1.2 Kleine Ausgabe (50 tales, for children)

| Editions | Content | Digital copies |
|---|---|---|
| 1825 (Berlin: Reimer, 7 engravings by Ludwig Emil Grimm), then 1833, 1836, 1839, 1841, 1844, 1847, 1850, 1853, 1858 | 50 titles taken from the Große Ausgabe. The de.wikipedia article "Grimms Märchen" § *Die kleine Ausgabe* gives the KHM numbers. | **No free transcription found** (not on Wikisource, DTA, Gutenberg or IA under that title). Scans may exist in Google Books or library portals such as the DDB, but none were verified. The text equals the Große Ausgabe text of the time, so the tale texts can be taken from the matching WS edition; only the selection and illustrations are specific to it. |

### 1.3 Ölenberg manuscript (Urfassung), 1810

| Item | Where | Format | Licence |
|---|---|---|---|
| Autograph collection of 46 texts (45 Märchen + 1 Sage) sent by Jacob to Clemens Brentano in Oct./Dec. 1810, found at Ölenberg Abbey (Alsace) in 1920s; Fondation Martin Bodmer, Cologny, Cod. Bodmer **G-72.1** | [e-codices fmb/ms-Grimm-G-072-001](https://e-codices.unifr.ch/en/list/one/fmb/ms-Grimm-G-072-001) | manuscript image scans only (IIIF) | Images **CC BY-NC** (verified on e-codices) – check only |
| Transcriptions: Joseph Lefftz (1927, *Märchen der Brüder Grimm. Urfassung nach der Originalhandschrift der Abtei Ölenberg*); Heinz Rölleke (1975, *Die älteste Märchensammlung der Brüder Grimm. Synopse…*, Cologny) | print only (DNB 760515212 for Rölleke); not online | – | Rölleke's commentary is in copyright. The bare Grimm text is PD. Under German §70 UrhG a scholarly edition of a PD text is protected for only **25 years** after publication, so the edited texts of 1927 and 1975 are probably free in DE now. **Get legal confirmation before you ship.** Other countries differ. |

Who wrote what (de.wikipedia, after Rölleke): Jacob wrote out 25 texts, Wilhelm 14, and other hands 7. By source: 16 from the Hassenpflug sisters, 14 from the Wild family, 6 from Friederike Mannel, 2 from the wife of the Marburg hospital warden, 1 from the Ramus sisters, and ~18 from literary sources (including Runge's two texts).

### 1.4 Tales dropped between editions (per the Wikisource version table)

All of these exist on Wikisource in their 1812/1815 text (downloaded). Numbers are 1812/15 numbers. The "last" column is the last edition that contains the tale.

| No. | Tale (1812/15 title) | Last ed. | Why it was dropped (per de.wikipedia/Rölleke, secondary) |
|---|---|---|---|
| 6 | Von der Nachtigall und der Blindschleiche | 1812 | translated by Jacob from French, not German tradition |
| 8 | Die Hand mit dem Messer | 1812 | from a Scottish source (transl. Jacob) |
| 16 | Herr Fix und Fertig | 1812 | from Krause; replaced |
| 22 | **Wie Kinder Schlachtens mit einander gespielt haben** | 1812 | violence; came from Kleist's *Berliner Abendblätter*/Arnim |
| 27 | Der Tod und der Gänshirt | 1812 | literary source |
| 33 | **Der gestiefelte Kater** | 1812 | Perrault parallel (Jeanette Hassenpflug) → later only in 1822/1856 notes as "Bruchstück" |
| 34 | Hansens Trine | 1812 | |
| 37 | Von der Serviette, dem Tornister, dem Kanonenhütlein und dem Horn | 1812 | replaced by KHM 54 |
| 43 | Die wunderliche Gasterei | 1819 | |
| 54 | Hans Dumm | 1812 | |
| 59 | Prinz Schwan | 1812 | |
| 60 | Das Goldei | 1812 | |
| 61 | Von dem Schneider, der bald reich wurde | 1812 | |
| 62 | **Blaubart** | 1812 | Perrault parallel (Hassenpflug) |
| 64 | Von dem Dummling | 1812 | |
| 66 | Hurleburlebutz | 1812 | |
| 68 | Von dem Sommer- und Wintergarten | 1812 | Beauty-and-the-Beast type |
| 70 | Der Okerlo | 1812 | French (d'Aulnoy) parallel |
| 71 | Prinzessin Mäusehaut | 1812 | |
| 72 | Das Birnli will nit fallen | 1812 | |
| 73 | Das Mordschloß | 1812 | translated from Dutch |
| 74 | Von Johannes-Wassersprung und Caspar-Wassersprung | 1812 | |
| 75 | Vogel Phönix | 1812 | |
| 77 | Vom Schreiner und Drechsler | 1812 | |
| 81 | Der Schmidt und der Teufel | 1812 | |
| 82 | Die drei Schwestern | 1812 | dropped on Jacob's advice (too fragmentary) |
| 84 | Die Schwiegermutter | 1812 (then as BS 5 in the notes vols) | Sleeping Beauty sequel fragment |
| 85a–d | Fragmente: Schneeblume, Prinzessin mit der Laus, Vom Prinz Johannes, Das gute Pflaster / Der gute Lappen | 1812 | |
| 99 (1815) | Der Froschprinz | 1815 | |
| 104 | Die treuen Thiere | 1850 | |
| 107 | Die Krähen | 1840 | |
| 119 | Der Faule und der Fleißige | 1815 | |
| 122 | Die lange Nase | 1815 | |
| 129 | Der Löwe und der Frosch | 1815 | on Jacob's advice |
| 130 | Der Soldat und der Schreiner | 1815 | on Jacob's advice |
| 136 | De wilde Mann | 1843 | replaced by *Der Eisenhans* (1850) |
| 143 | Die Kinder in Hungersnoth | 1815 | |
| 152 | Die heilige Frau Kummerniß | 1815 | moved to *Deutsche Sagen* |

The 1856 notes volume keeps the "Bruchstücke" (BS 1–6). This includes *Der gestiefelte Kater* (BS 4) and *Die böse Schwiegermutter* (BS 5). Downloaded under `khm/1856/`.

### 1.5 The Grimms' own notes (Anmerkungen)

| Version | Where | Status |
|---|---|---|
| 1812 vol. 1 "Anhang" (notes at the end of the volume) and 1815 vol. 2 "Anhang" | de.wikisource, embedded per tale ("Anhang Band 1/2" sections) | **downloaded** as `khm/1812/*.notes.txt`, `khm/1815/*.notes.txt` |
| 1822 vol. 3 (2nd ed. notes) | Commons scans only | **not transcribed**; would need OCR (Fraktur) |
| 1856 vol. 3 (3rd ed. notes, revised) | de.wikisource (5 subpages) | **downloaded** `khm/1856/` |
| Bolte/Polívka, *Anmerkungen zu den KHM*, 5 vols., 1913–32 (secondary but foundational; it names informants) | de.wikisource transcribes **vol. 1, partly** (67 pages); Commons scans of all volumes | vol. 1 pages downloaded to `wikisource/bolte-polivka/`. Bolte died 1937 and Polívka 1933, so the work is PD in the EU |

### 1.6 Grimms' annotated personal copies (Handexemplare)

| Item | Where | Licence |
|---|---|---|
| Kasseler Handexemplare of KHM 1812/15 and 1819, with the Grimms' handwritten notes on informants and dates. UNESCO Memory of the World 2005. Held by UB Kassel. | [ORKA viewer](https://orka.bibliothek.uni-kassel.de/viewer/toc/1433243313511/0/) (returns 403 to scripted fetch); Grimm-Portal at uni-kassel.de | Images only. The licence varies by item: UB Kassel uses Public Domain Mark 1.0 or CC BY-SA 4.0 (from search results; **unverified** for these volumes). These are the **primary evidence for informant attributions**. |

---

## 2. Contributors (Beiträger) and where attributions are documented

The Grimms did not name most informants in print. The notes give regions: "aus Zwehrn" means Viehmann; "aus Hessen", "aus den Maingegenden" or "aus Hanau" mean the Hassenpflugs; "aus dem Paderbörnischen" or "Münsterland" mean Haxthausen or Droste-Hülshoff. Attributions come from the Handexemplare notes (Kassel), the Ölenberg MS, letters, and Herman Grimm, as worked out by Rölleke (1975, 1980 Reclam KHM vol. 3 "Verzeichnis der Beiträger") and Uther (1996, *Handbuch* 2008). Those modern works are in copyright, so treat their attribution facts as **facts** (not copyrightable) and cite them. The summaries below come from de.wikipedia (CC BY-SA), which follows Rölleke and Uther. KHM numbers are 1857 numbers; "a" means a tale from the 1st edition only.

| Contributor | Who | Tales (KHM) | Primary documentation |
|---|---|---|---|
| **Dorothea Viehmann** (1755–1815), Niederzwehren near Kassel; tailor's wife of Huguenot descent (née Pierson) | met in 1813; told 40+ tales and variants for ≥36 KHM, mostly in vol. 2 (1815) | 6, 9, 29 (1819 version), 34, 61, 63, 71, 76, 89, 94, 98, 100, 102, 106, 108, 111, 115, 118, 125, 127, 128, possibly 176; variants in many notes | Vorrede vol. 2 (1815) and 1819 (description of "die Viehmännin"); 1856 notes: "aus Zwehrn"; Ludwig Emil Grimm's portrait etching (1819 frontispiece) |
| **Hassenpflug family**, Kassel, Huguenot, originally from Hanau. Marie (1788–1856), Jeanette (1791–1860), Amalie (1800–71) | early and most productive source, 1808–1812 | Marie: 11, 26, 31, 40, 45, 50, 79, 200, 75a, 81a, 99a, fragment *Prinzessin mit der Laus*, perhaps 53. Jeanette: 14, 26, 36, 41, 67, 33a (*Gestiefelter Kater*), 66a, 70a (*Okerlo*), 71a. Amalie: 13, 42, perhaps 43a. Family: 5, 17, 20, 25, 32, 52, 55, 64, 54a, 62a (*Blaubart*), 76a, 84a | Ölenberg MS (16 texts); Handexemplare notes ("Marie" was long misread by Herman Grimm as an old nurse, "die alte Marie") |
| **Wild family**, Kassel, Sonnenapotheke (Marktgasse 21). Dortchen (Henriette Dorothea, 1793–1867; married Wilhelm in 1825), Gretchen, Lisette, Mie; mother Dorothea Wild | 1810–1814 | Mother: 18, 30. Daughters: 1, 2, 3, 13, 24, 28, 36, 39, 44, 46, 49, 52, 55, 56, 58, 65, 88, 103, 104, 105, 154, 64a, possibly 59a, 60a | Ölenberg MS (14 texts); Handexemplare |
| **von Haxthausen** (Westphalia, Bökendorf circle): Ludowine, August, Werner and sisters; with **Jenny & Annette von Droste-Hülshoff** | from 1811/1813, Low German (Westphalian) tales mainly in 1815 and 1819 | Ludowine: 52 (additions 1819), 91 *Dat Erdmänneken*, 96 *De drei Vügelkens*, 113 *De beiden Künigeskinner*, 142 *Simeliberg*, 209 (variant). Jenny v. Droste: *De Gaudeif un sien Meester* (68), *Der Fuchs und das Pferd* (132) among others | Letters (Grimm–Haxthausen, Grimm–Droste), Handexemplare; Low German texts printed in dialect |
| **Philipp Otto Runge** (1777–1810), painter, Wolgast/Hamburg | two Pomeranian Low German tales written down in 1806, passed on through Brentano/Arnim (1st printed 1808 in Arnim's *Zeitung für Einsiedler*) | 19 *Von dem Fischer un syner Fru*, 47 *Van den Machandelboom* | Ölenberg MS (Runge's texts were already with Brentano); 1812 notes; Rölleke 2008 critical ed. |
| **Friederike Mannel** (1783–1833), pastor's daughter, Allendorf | 1808–1810 | 46 (variant), 51 *Fundevogel*, 85 (*Die Goldkinder*), 74a, 77a | Ölenberg MS (6 texts) |
| **Johann Friedrich Krause** (1747–1828), retired dragoon sergeant, Hoof near Kassel | 1811; exchanged tales for old trousers | 16, 48, 54 (at least in part), 92, 16a, 111 (variant) | Handexemplare notes; 1856 notes |
| Ramus sisters (Julia & Charlotte), Kassel | 1810 | 1 text in Ölenberg MS | Ölenberg MS |
| Ferdinand Siebert (teacher, Treysa); Ludwig Emil Grimm; Achim von Arnim (e.g. *Die Sterntaler* note); Clemens Brentano | various | various | Handexemplare, letters |
| Literary sources (Jung-Stilling *Jorinde und Joringel* KHM 69; Perrault; Basile; Kleist/Arnim KHM 22a…) | – | – | Grimm notes 1812/1822/1856 |

Machine-readable attribution data: none of it is freely licensed in structured form. Options:
- the de.wikipedia per-tale articles (CC BY-SA 4.0), each with a "Herkunft" section;
- the en.wikipedia "List of Grimms' Fairy Tales";
- build our own table from the 1856 notes (downloaded; region formulas) cross-checked against the above.

---

## 3. Deutsche Sagen

| Edition | de.wikisource | Gutenberg | IA / Google / other scans | DTA | Zeno |
|---|---|---|---|---|---|
| 1st ed. vol. 1, 1816 (Berlin: Nicolai; Sagen 1–362, local legends) | [Deutsche Sagen (Brüder Grimm, Band 1)](https://de.wikisource.org/wiki/Deutsche_Sagen_(Br%C3%BCder_Grimm,_Band_1)): Vorrede plus one page per Sage, "fertig" | [PG #76558](https://www.gutenberg.org/ebooks/76558) vol. 1 only (362 Sagen; transcribed from Austrian Literature Online scans; PG's "1916" is a typo for 1816) | IA bub_gb_SRcFAAAAQAAJ (PDM, Oxford), deutschesagen01grimgoog; GBS 3DoAAAAAcAAJ; Commons cat. "Deutsche Sagen (Grimm) Band 1" | not found | yes, licence unverified |
| 1st ed. vol. 2, 1818 (Sagen 363–585, historical legends) | [Band 2](https://de.wikisource.org/wiki/Deutsche_Sagen_(Br%C3%BCder_Grimm,_Band_2)) per Sage | – | IA bub_gb_XBcFAAAAQAAJ (PDM), GBS P3gAAAAAMAAJ; Commons | – | yes |
| 2nd ed. 1865 (ed. Herman Grimm) | – | – | IA deutschesagengrimm2edv1; HathiTrust mdp.39015009035877 | – | – |
| 3rd ed. 1891; 4th ed. 1905 (ed. R. Steig) | – | – | IA deutschesagengrimm3edv1/v2, deutschesagengrimm4ed | – | – |

Wikisource category [Brüder Grimm Sagen](https://de.wikisource.org/wiki/Kategorie:Br%C3%BCder_Grimm_Sagen) has 585 Sagen plus the 2 volume pages, so the collection is **complete**.

## 4. Linguistic and scholarly works

| Work | Edition(s) | Digital sources | Format | Licence | Downloaded |
|---|---|---|---|---|---|
| **Deutsche Grammatik** | 1. Theil 1819; **1. Theil 2nd ed. 1822** (rewritten phonology: the Germanic consonant shift, "Grimm's law", in the section on consonants); 2. Theil 1826; 3. Theil 1831; 4. Theil 1837; 3rd ed. of vol. 1, 1840; Register 1865 | **DTA** `grimm_grammatik01_1822` (dta:380), `grimm_grammatik02_1826` (dta:381), both manual. IA 10583675bsb = MDZ 10583675 (1822), 11762901bsb (1826), bub_gb_fu0IAAAAQAAJ (1819, IA-dated 1890), deutschegrammati01grim… (1819/1822 reprints); GBS ids on the WS Jacob Grimm page; HathiTrust uc1.b4082282 (1826) | DTA TEI; IA OCR | DTA: see notes; IA text PD | `internet-archive/10583675bsb_djvu.txt` (1822), `11762901bsb_djvu.txt` (1826): raw OCR, Fraktur, **noisy** (ſ→f etc.). Use DTA TEI for real work. |
| **Deutsche Mythologie** | 1835 (1 vol.); 2nd 1844 (2 vols.); 3rd 1854; 4th 1875–78 (ed. E. H. Meyer, 3 vols.) | IA deutschemytholo03grimgoog (1835, Oxford), deutschemytholo08grimgoog (1835, UC), 11419287bsb / 10446517bsb (1835, BSB), bub_gb_PxIVAAAAYAAJ (1844); Commons (4th ed.); not in DTA | OCR, scans | text PD; IA NOT_IN_COPYRIGHT | two OCRs of 1835 (for cross-checking), noisy |
| **Geschichte der deutschen Sprache** | 1848 (2 vols., Leipzig: Weidmann); 2nd 1853; 3rd 1868; 4th 1880 | IA bub_gb_gnIVAAAAYAAJ and bub_gb_tXIVAAAAYAAJ (1848, Harvard; PDM); 10703843bsb, 10583683bsb (1853); geschichtederdeu01/02grimuoft (1880) | OCR | PD | 1848 vols. 1 and 2 OCR |
| **Deutsches Wörterbuch (DWB)** | Prospectus/agreement 1838; vol. 1 (A–Biermolke) 1854; vol. 2 1860; vol. 3 1862; Jacob's last entry was *Frucht* (1863); completed 1961 (32 vols.); 2nd ed. ²DWB (A–F) 1965–2018 | [woerterbuchnetz.de/DWB](https://woerterbuchnetz.de/DWB) (Trier Center for Digital Humanities; "Der Digitale Grimm", online since 2002, CD-ROM 2004); JSON API `api.woerterbuchnetz.de/open-api/dictionaries/DWB/{lemmata,fulltext}/…`; DWDS also shows 1DWB (DWDS forbids automated access); IA scans deutscheswrter00grimuoft (vol. 1), 10798016bsb, etc. | web/API (per lemma); scans | **Unverified.** woerterbuchnetz.de shows no licence statement (JS site, API root has no metadata). ELEXIS/LINDAT records exist (hdl 11372/LRT-1011, CLARIN.SI 11356/1638) but they list no licence. Grimm-authored text (A–F) is PD; later volumes were written by 20th-c. lexicographers, some still in copyright. | not downloaded (check/link only) |
| Über den altdeutschen Meistergesang (J.) | 1811 | DTA `grimm_meistergesang_1811` (dta:384); GBS CrtAAAAAYAAJ | TEI | DTA | – |
| Deutsche Rechtsalterthümer (J.) | 1828, 1854, 1881, 1899 | IA deutscherechtsa05grimgoog etc. (see WS Jacob page) | scans/OCR | PD | – |
| Weisthümer (J.) | 1840–78, 7 vols. | GBS/HathiTrust/IA (WS Jacob page) | scans | PD | – |
| Reinhart Fuchs (J.) | 1834; Sendschreiben 1840 | GBS, HathiTrust | scans | PD | – |
| Über deutsche Runen (W.) | 1821 | IA ueberdeutscheru00grimgoog; HT mdp.39015028719923 | scans/OCR | PD | – |
| Die deutsche Heldensage (W.) | 1829; 1867; 1889 | IA 11419288bsb, diedeutscheheld03grimgoog | scans/OCR | PD | – |
| Über den Ursprung der Sprache (J.) | 1851 (separate printing 1858) | IA berdenursprungd00grimgoog | scans/OCR | PD | – |
| Kleinere Schriften (J. 8 vols. 1864–90; W. 4 vols. 1881–87) | – | HathiTrust; IA kleinereschrifte02/05/06/07grimuoft; Commons (W.) | scans | PD | – |

## 5. Editions, translations, journals

| Work | Year | Digital sources | Downloaded |
|---|---|---|---|
| **Altdeutsche Wälder** (Brüder Grimm) | vol. 1 1813 Kassel; vol. 2 1815 & vol. 3 1816 Frankfurt | IA bub_gb_DzYUAAAAQAAJ (vol. 1), bub_gb_yronAAAAMAAJ (vol. 2), bub_gb_M7snAAAAMAAJ (vol. 3), all PDM; GBS 8D4aAAAAYAAJ, 0mENAAAAQAAJ, M7snAAAAMAAJ | OCR of all 3 volumes |
| **Irische Elfenmärchen** (transl. of T. Crofton Croker, *Fairy Legends*; Grimms' intro essay "Über die Elfen") | 1826 Leipzig: Fleischer | IA bub_gb_1EwAAAAAcAAJ (PDM), 11257161bsb = MDZ 10035497 / 11257161; GBS 1EwAAAAAcAAJ | OCR |
| Die beiden ältesten deutschen Gedichte (Hildebrandslied, Wessobrunner Gebet) | 1812 Kassel | IA diebeidenlteste00grimgoog; GBS YQkGAAAAQAAJ; HT mdp.39015013760734 | – |
| Lieder der alten Edda | 1815 | GBS 1R1bAAAAQAAJ | – |
| Der arme Heinrich (Hartmann v. Aue) | 1815 | GBS TUAJAAAAQAAJ; UB Paderborn | – |
| Altdänische Heldenlieder (W.) | 1811 | GBS NhyU0K-DKS0C; HT mdp.39015014834090 | – |
| Zeitung für Einsiedler contributions (1808), Wünschelruthe (1818) | – | de.wikisource (per piece) | Wünschelruthe tales and "Gedanken: wie sich die Sagen zur Poesie und Geschichte verhalten" + "Sagen von Glocken" (J., 1808) |

## 6. Speeches, autobiography, Göttingen Seven

| Text | Year | Digital sources | Downloaded |
|---|---|---|---|
| **Jacob Grimm über seine Entlassung** (defence of the Göttingen Seven protest of 18 Nov 1837) | 1838 Basel: Schweighauser | IA [bub_gb_mXNBAAAAYAAJ](https://archive.org/details/bub_gb_mXNBAAAAYAAJ); GBS mXNBAAAAYAAJ; MDZ 10731876 | OCR |
| Göttinger Sieben, protest letter ("Protestation") of 18 Nov 1837 | 1837 | de.wikisource topic page [Göttinger Sieben](https://de.wikisource.org/wiki/G%C3%B6ttinger_Sieben) (links documents) | page downloaded to `other/` |
| **Rede auf Wilhelm Grimm** and **Rede über das Alter** (Berlin Academy, 1860) | printed 1863 Berlin: Dümmler | IA redeaufwilhelmg00grimgoog, bub_gb_3o06AAAAcAAJ; MDZ 10109719 | OCR |
| Rede auf Schiller | 1859 | IA redeaufschiller00grimgoog; GBS a5UMAQAAIAAJ | – |
| Selbstbiographie (Jacob; Wilhelm) | 1831 (Strieder/Justi, *Hessische Gelehrtengeschichte*) | de.wikisource [Selbstbiographie (Jacob Grimm)](https://de.wikisource.org/wiki/Selbstbiographie_(Jacob_Grimm)), [(Wilhelm Grimm)](https://de.wikisource.org/wiki/Selbstbiographie_(Wilhelm_Grimm)) | yes (`other/`) |
| ADB biographies (W. Scherer on Jacob; on Wilhelm) | 1879/80 | de.wikisource ADB:Grimm, Jakob / ADB:Grimm, Wilhelm | yes (`other/`) |

## 7. Letters (Briefwechsel)

| Item | Year | Digital sources | Licence |
|---|---|---|---|
| Briefwechsel zwischen Jacob und Wilhelm Grimm aus der Jugendzeit (ed. Herman Grimm & G. Hinrichs) | 1881 | IA bub_gb_5zoWAAAAYAAJ (PDM), briefwechselzwi00hinrgoog | PD; **OCR downloaded** (covers the Kassel years 1805–1830, closest to the game period) |
| Freundesbriefe von W. und J. Grimm | 1878 | IA bub_gb_BGEGAQAAIAAJ | PD |
| Briefwechsel des Frhrn. v. Meusebach mit J. u. W. Grimm | 1880 | IA bub_gb_UPc_AAAAIAAJ | PD |
| Briefwechsel J. Grimm – F. D. Graeter 1810–1813 | 1877 | IA bub_gb_vscFAAAAQAAJ | PD |
| Briefwechsel mit nordischen Gelehrten | 1885 | IA bub_gb_4YANAAAAQAAJ | PD |
| Briefwechsel J. u. W. Grimm, Dahlmann und Gervinus (2 vols.) | 1885–86 | IA bub_gb_TmfPAAAAMAAJ, briefwechselzwis01grimuoft | PD (Göttingen Seven context) |
| Briefe an G. F. Benecke 1808–1829 | 1889 | IA bub_gb_OTOmwAys3O0C | PD |
| Stengel, *Private und amtliche Beziehungen der Brüder Grimm zu Hessen* (letters to Hessian friends; official files from their Kassel service) | 1886/1895 | IA bub_gb_Mp45AAAAMAAJ, bub_gb_qXo5AAAAMAAJ | PD. Very useful for the Kassel library and court setting. |
| **Digitales Grimmarchiv** (HU Berlin Arbeitsstelle Grimm-Briefwechsel + SBB + Grimm-Sozietät): *Verzeichnis von J. u. W. Grimms Briefwechsel* v5.0, letters, diaries | 2022– | [grimmarchiv.de](https://grimmarchiv.de/) (JS app; robots: no content); SBB Digitized Collections (scans) | **unverified**: no licence found. Check only. |
| Kassel Grimm-Portal / ORKA (letters, Handexemplare, drawings) | – | uni-kassel.de Grimm-Portal | per item PDM or CC BY-SA (unverified per item) |
| *Briefwechsel der Brüder Grimm. Kritische Ausgabe in Einzelbänden* (Kasseler Ausgabe, Hirzel/S. Hirzel 2001–) | modern | print; some volumes on biblioscout (open access PDF for Kraut 2023 *Arbeitsweise*) | © (commentary); letter texts PD, but the §70 25-year rule applies, so check only |

## 8. Institutions

| Institution | What it offers | Licence |
|---|---|---|
| Brüder Grimm-Gesellschaft Kassel (grimms.de) | old.grimms.de had 1812 texts (the Wikisource source); society publishes *Brüder Grimm Gedenken* | unverified |
| GRIMMWELT Kassel (museum) | exhibition and education; no open text database found | – |
| Brüder Grimm-Museum / Haus Steinau, Hanau sites | museums | – |
| UB Kassel (LMB) | Handexemplare, Grimm library, letters (ORKA) | PDM / CC BY-SA per item (unverified) |
| Fondation Martin Bodmer | Ölenberg MS (e-codices) | images CC BY-NC |

---

## Downloaded

All files are under `raw-data/grimm/` (55 MB total). `MANIFEST.tsv` has 2,185 rows: one per file, with columns work, edition, source URL (Wikisource URLs pin `oldid=<revid>`), licence and retrieval date (2026-10-31).

### de.wikisource (MediaWiki API `action=parse`, 1 request per ~1.1 s, descriptive User-Agent, 2,016 pages, 0 failures)

`wikisource/_api/*.json.gz` holds the raw API responses (HTML + wikitext + revid), so the text can be re-derived without re-fetching. The derived plain text is in one folder per work/edition. Each folder has an `index.tsv` with these columns: file, number, WS title, Textdaten title, source page range (HERKUNFT), SONSTIGES (e.g. "seit 1812: KHM 12"), proofreading status, revid, length.

| Folder | Content | Files | Completeness |
|---|---|---|---|
| `khm/1812/` | KHM 1st ed. vol. 1: Vorrede (`000_Vorrede_Band1`, includes the Grimms' preface) + nos. 1–86, the fragments 85a–d, and the `Fragmente` page | 92 txt + 80 `*.notes.txt` (the Grimms' 1812/1815 Anhang notes for that tale) | complete; all "fertig" (proofread against scans) |
| `khm/1815/` | KHM 1st ed. vol. 2: Vorrede + nos. 87–156 (WS numbers them continuously after vol. 1) | 71 + 70 notes | complete, fertig |
| `khm/1819/` | 2nd ed. (2 vol. prefaces + 161 tales + Kinderlegenden) | 172 | complete, fertig |
| `khm/1837/`, `1840/`, `1843/`, `1850/` | 3rd–6th eds. | 179 / 189 / 205 / 212 | complete, fertig |
| `khm/1857/` | 7th ed., Ausgabe letzter Hand (2 prefaces + 200 tales + 10 KL + variant entries) | 213 | complete, fertig |
| `khm/1856/` | vol. 3 (notes): Anmerkungen (549 KB, all tales), Bruchstücke (BS 1–6 incl. *Der gestiefelte Kater*), Literatur, Zeugnisse, Register | 12 | complete |
| `deutsche-sagen/` | DS 1816 (vol. 1, 362 Sagen) + 1818 (vol. 2, 223 Sagen) + 2 prefaces; named `Bd<vol>_S<startpage>_<title>`, so sorting by name gives book order. The Sagen numbers are not in the WS metadata, but the page order matches them. | 587 | complete (585/585) |
| `bolte-polivka/` | Bolte/Polívka *Anmerkungen* vol. 1 (1913), the pages WS has transcribed | 67 | partial: WS covers only part of vol. 1 |
| `other/` | Selbstbiographien (J., W.); Jacob 1808 essays (*Gedanken: wie sich die Sagen…*, *Sagen von Glocken*); *Wünschelruthe* tales; *Zwei Thiermärchen*, *Albanesische Märchen*, *Der Swinegel*; *Eine dänische Sammlung von Volkssagen*; Steig 1907 and 1916 (on the KHM/DS genesis); ADB biographies; Göttinger Sieben topic page; Croker author page; Gartenlaube 1892 *Die Brüder Grimm bei der Märchenerzählerin* | 17 | n/a |

Text-cleaning notes:
- Page numbers are removed and lines are re-joined across page breaks.
- Headings are kept as `== … ==`.
- The original spelling is kept (*seyn*, *Thurm*, *ward*); there is no normalisation.
- Verse lines in the tales stay as separate paragraphs.
- Wikisource footnotes, where present, are kept at the end of the text.
- Gesperrt (letter-spaced) emphasis is lost in plain text. It is still in the `_api` HTML.

### Project Gutenberg (`gutenberg/`)

| File | Content | Note |
|---|---|---|
| `pg76558.txt` | Deutsche Sagen **vol. 1 (1816)**, 362 Sagen, PGDP-proofread | an independent second transcription of DS vol. 1; useful for cross-checking WS |
| `pg77905.txt` | *Deutsche Märchen gesammelt durch die Brüder Grimm* (1921 selection, ed. Thilo-Luyken) | later text (1857-based); low priority |
| `pg5314.txt` | Margaret Hunt's English translation *Household Tales* (1884) | English reference / parallel text, PD |

### Internet Archive OCR (`internet-archive/*_djvu.txt`: raw, uncorrected OCR, Fraktur errors such as ſ→f and broken umlauts)

| File | Work |
|---|---|
| `10583675bsb_djvu.txt` | Deutsche Grammatik 1. Theil, 2nd ed. **1822** (Lautverschiebung) |
| `11762901bsb_djvu.txt` | Deutsche Grammatik 2. Theil 1826 |
| `deutschemytholo03grimgoog_djvu.txt`, `deutschemytholo08grimgoog_djvu.txt` | Deutsche Mythologie 1835 (two copies, two OCRs) |
| `bub_gb_gnIVAAAAYAAJ_djvu.txt`, `bub_gb_tXIVAAAAYAAJ_djvu.txt` | Geschichte der deutschen Sprache 1848, vols. 1–2 |
| `bub_gb_1EwAAAAAcAAJ_djvu.txt` | Irische Elfenmärchen 1826 |
| `bub_gb_mXNBAAAAYAAJ_djvu.txt` | Jacob Grimm über seine Entlassung 1838 |
| `redeaufwilhelmg00grimgoog_djvu.txt` | Rede auf Wilhelm Grimm / Rede über das Alter 1863 |
| `bub_gb_DzYUAAAAQAAJ…`, `bub_gb_yronAAAAMAAJ…`, `bub_gb_M7snAAAAMAAJ_djvu.txt` | Altdeutsche Wälder vols. 1–3 (1813/15/16) |
| `bub_gb_5zoWAAAAYAAJ_djvu.txt` | Briefwechsel J. u. W. Grimm aus der Jugendzeit (1881) |
| `bub_gb_SRcFAAAAQAAJ…`, `bub_gb_XBcFAAAAQAAJ_djvu.txt` | Deutsche Sagen 1816/1818 raw OCR (superseded by WS) |

### Not downloaded / gaps
- **DTA TEI**: needs a manual download (next section).
- **KHM 1822 notes volume**: scans only, no transcription anywhere.
- **Kleine Ausgabe**: no free digital copy located.
- **Ölenberg MS**: NC images only; no free transcription online.
- **DWB**: licence unverified.
- **Scans and PDFs**: none downloaded (all relevant PDFs exceed 50 MB or are not needed).
- **Bolte/Polívka vols. 2–5**: Commons scans only.
- **Deutsche Mythologie 2nd–4th eds., Grammatik 1819 and vols. 3–4, GdS later eds.**: not downloaded (catalogued only).


## Manual downloads needed

The DTA uses a JavaScript bot check on downloads. I did not script around it, and the stub HTML file left by an earlier attempt was deleted. Open these URLs in a browser and save them into `raw-data/grimm/dta/`. Use the `download_xml` link for TEI; plain text is `https://www.deutschestextarchiv.de/book/download_txt/<id>`.

| DTA id | Work | CLARIN handle (metadata) |
|---|---|---|
| grimm_maerchen01_1812 | KHM 1st ed. vol. 1 | dta:382 hdl 21.11120/0000-000C-52B6-A |
| grimm_maerchen02_1815 | KHM 1st ed. vol. 2 | dta:383 hdl 21.11120/0000-000C-52C4-A |
| grimm_maerchen01_1819 / grimm_maerchen02_1819 | KHM 2nd ed. | dta:3730 / 3736 |
| grimm_maerchen01_1837 / …02_1837 | KHM 3rd ed. | dta:3731 / 3737 |
| grimm_maerchen01_1840 / …02_1840 | KHM 4th ed. | dta:3732 / 3738 |
| grimm_maerchen01_1843 / …02_1843 | KHM 5th ed. | dta:3733 / 3739 |
| grimm_maerchen01_1850 / …02_1850 | KHM 6th ed. | dta:3734 / 3740 |
| grimm_maerchen01_1857 / …02_1857 | KHM 7th ed. | dta:3735 / 3741 |
| grimm_grammatik01_1822 | Deutsche Grammatik 1. Theil, 2nd ed. (Grimm's law) | dta:380 |
| grimm_grammatik02_1826 | Deutsche Grammatik 2. Theil | dta:381 |
| grimm_meistergesang_1811 | Über den altdeutschen Meistergesang | dta:384 |

Example: `https://www.deutschestextarchiv.de/book/download_xml/grimm_maerchen01_1812`. The DTA texts are useful for **lemmatised and normalised** TEI (DTA's CAB normalisation gives a modern spelling layer). That is the main thing they add over Wikisource.

Other items that need a person or are not worth scripting:
- **e-codices Ölenberg MS** images (CC BY-NC; for reference only).
- **UB Kassel ORKA Handexemplare** (returns 403 to scripts; open in a browser).
- **Commons scans of KHM 1822 vol. 3** (if the 1822 notes are wanted; needs OCR).
- **Kleine Ausgabe 1825**: find a digitised copy (DDB, Google Books, BSB) by hand.
- Scans of any IA item over 50 MB (most PDFs are 40–480 MB) were deliberately not downloaded.

## Licence notes

1. **de.wikisource: ship.** I checked the site licence through the API (`rightsinfo`): CC BY-SA 4.0. The project FAQ ([Wikisource:FAQ](https://de.wikisource.org/wiki/Wikisource:FAQ), "Was muss ich beachten, wenn ich Texte aus Wikisource nutzen will?") says: *"Üblicherweise sind die hier präsentierten Texte gemeinfrei, sie dürfen ohne weitere Beschränkungen nachgenutzt werden. … besteht dazu [Quellenangabe] keine rechtliche Verpflichtung. Falls Inhalte nicht gemeinfrei sind (z.B. redaktionelle Beiträge der Mitarbeiter …), sind die Wikisource:Lizenzbestimmungen verbindlich."* So the tale texts are PD. The Textdaten box, WS footnotes ("Anmerkungen (Wikisource)") and navigation are CC BY-SA 4.0. The `.txt` files drop the Textdaten box. If we ship WS footnotes, attribute them as CC BY-SA. Courtesy credit to Wikisource is recommended.
2. **DTA: check, or ask.** The terms page ([/doku/nutzungsbedingungen](https://www.deutschestextarchiv.de/doku/nutzungsbedingungen)) states that all full texts are under **CC BY-SA 4.0** unless marked otherwise. The same page also says the texts may be used "uneingeschränkt für nichtkommerzielle Zwecke", which is ambiguous for commercial use. A web summary of CLARIN-BBAW metadata also mentioned CC BY-NC 3.0 for some DTA objects. The CLARIN record for dta:3731 says "Dieses Werk ist gemeinfrei". DTA **images** are explicitly non-commercial (owned by the holding libraries). Recommendation: treat DTA as **check-only** until DTA confirms CC BY-SA 4.0 for commercial use (email to dta@bbaw.de). Wikisource already gives us the same texts as PD.
3. **Project Gutenberg (gutenberg.org): ship** after stripping the header and footer. PG says "Public domain in the USA". The underlying texts are PD everywhere. The PG licence only restricts use of the PG *trademark*. #77905 (1921 selection): the text is PD, but the illustrator Dora Brandenburg-Polster (d. 1958) is still in copyright in the EU, so do not use the images.
4. **projekt-gutenberg.org (Spiegel/Hille & Partner): check only.** Its Nutzungsbedingungen restrict use to private use. Not downloaded.
5. **Zeno.org: unverified.** The terms page could not be retrieved (404/ECONNREFUSED). Texts come from Directmedia's *Digitale Bibliothek*. Treat as check-only. Not downloaded.
6. **Internet Archive OCR:** the underlying works are PD. Most items are marked `Public Domain Mark 1.0` or `NOT_IN_COPYRIGHT`. Google-digitised items (`bub_gb_*`, `*goog`) carry Google's usage guidelines, which *ask* for non-commercial use of the files. That is a request, not a copyright licence, and raw OCR of PD text has no copyright. Shipping our own corrected text derived from it is low risk. BSB/MDZ items (`*bsb`): the MDZ marks PD works as free to use (not checked per item).
7. **Wörterbuchnetz DWB: unverified.** Use for lookup and linking; do not bulk-harvest. The 20th-century volumes (after Grimm) may still be in copyright.
8. **e-codices (Ölenberg MS): CC BY-NC**, verified. The images cannot ship. The 1810 text itself is PD.
9. **Modern editions** (Rölleke, Uther, Kasseler Briefwechsel-Ausgabe, Lefftz): commentary © (check only). German §70 UrhG protects scholarly editions of PD texts for only 25 years after publication, so the bare edited texts from before ~2000 may now be free in Germany. **Not confirmed. Ask a lawyer** before relying on this, and note other jurisdictions.
10. **Sensitive content:** KHM 110 *Der Jude im Dorn*, and in *Deutsche Sagen* *Das von den Juden getödtete Mägdlein* / *Der Judenstein*, carry antisemitic content. Some 1812 tales are violent (KHM 22a). This is a curation issue rather than a licence issue, but it matters for a game that teaches history.
