**URWORT**

Game Mechanics & UX Design

Specification v1.0

Procedural World · Root-Word Discovery · Neuroscience-Grounded Learning

March 2026

_The world is the ontology. The map is the language._

_Learning by wandering. Memory through place._

_Five minutes of stillness, not five minutes of dopamine._

# Part I: Design Philosophy - Anti-Patterns & Principles

## 1.1 What Urwort Refuses to Be

Before defining what Urwort is, we must clearly state what it rejects. These are not preferences - they are structural commitments embedded in every design decision.

- **No streak mechanics.** No "Day 47!" counters. No guilt for missing a day. Streaks exploit loss aversion (Kahneman & Tversky 1979) and shift motivation from intrinsic curiosity to anxiety about breaking a chain. Urwort tracks your history but never weaponises it.
- **No hearts / lives / energy systems.** No artificial scarcity of attempts. No "wait 4 hours or pay." Mistakes are how you learn (Metcalfe 2017, the hypercorrection effect - confident errors produce stronger learning when corrected). The game should make you want to make mistakes.
- **No leaderboards or competitive ranking.** No comparing learners against each other. Language learning is not a race. Social comparison undermines intrinsic motivation (Deci & Ryan 1985). Community contribution (auditing the ontology, submitting attestations) is collaborative, not competitive.
- **No notifications or push alerts.** The app never interrupts your life. It waits quietly until you choose to open it. This is the "peaceful respite" principle. You come to Urwort the way you come to a garden.
- **No attention-maximising loops.** No infinite scroll. No "one more round" dark patterns. Sessions have natural endpoints. The app may even gently suggest you stop after a productive session - the neuroscience is clear that spacing is more effective than massing (Cepeda et al. 2006).
- **No artificial topic gates.** The learner can wander freely. There is no locked "Level 3" that requires completing "Level 2." The ontology is a graph, not a ladder. You can start anywhere. CEFR levels inform but never restrict.

## 1.2 What Urwort Is

Urwort is a contemplative exploration game where the German language's root-word structure manifests as a navigable 3D world. The core loop is:

- **Wander** - Move through a procedurally generated landscape. Each region corresponds to a root-word family. The terrain, architecture, and objects encode linguistic relationships spatially.
- **Discover** - Find words embedded in the environment. Touch an object to reveal its morphological structure. See how it connects to the root at the heart of this region. Follow links to related regions.
- **Practice** - Optional exercises emerge naturally from context. Fill in the missing affix. Hear a word and find the object. Read a passage from Grimm and identify the root words. Exercises are always tied to what you've just discovered.
- **Collect** - Add words, roots, passages, and etymological chains to your personal library. Your library is your own curated museum of the language. It also drives your spaced repetition review.
- **Return** - Revisit regions. They're subtly different each time (procedural variation). Words you've mastered glow differently from those still fresh. The landscape reflects your growing knowledge.

## 1.3 Time Budget: The 5-Minute Session

The fundamental design constraint: every session must be satisfying in 5 minutes but rewarding for up to 20. This means:

- **Instant engagement:** From app open to meaningful interaction in under 3 seconds. No loading screens with tips. No daily reward popups. You open the app and you're in the world, exactly where you left off.
- **Micro-discoveries:** A single root-word exploration (root + 3-5 derived words + one attestation) takes 2-3 minutes. One exercise takes 30-60 seconds. A 5-minute session can contain 1 discovery + 2-3 review exercises.
- **Natural pause points:** After each discovery or exercise set, the game reaches a quiet state. No cliffhangers. No "just one more." The world is peaceful and you feel complete.
- **Session summary:** When you choose to leave (not when the app tells you to), a gentle summary shows what you explored and what was added to your library. No scores. No grades. Just a record of your journey.

# Part II: The Procedural World - Space as Language

## 2.1 Core Spatial Metaphor

The world is a direct spatial manifestation of the ontology graph. This is not decorative - every spatial relationship encodes a linguistic relationship:

| **Spatial Element**    | **Ontology Element**   | **Metaphor**                                                                                                                                                         |
| ---------------------- | ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Island / Region        | Root Family            | Each root generates a distinct land mass. Related roots are nearby islands.                                                                                          |
| Terrain Type           | Historical Stratum     | Native Germanic roots → forests/mountains. Latin loans → stone architecture. Greek loans → classical ruins. French → gardens. English modern → geometric structures. |
| Buildings / Structures | Stems (Derived Words)  | Each derived word is a building. Complex derivations = taller buildings. Compounds = buildings that bridge two structures.                                           |
| Objects / Artefacts    | Lexemes / Word Forms   | Interactable objects inside or near structures. Touch to examine, revealing definition, pronunciation, and attestation.                                              |
| Paths / Roads          | Derivation Chains      | Walking a path from the root monument to a building traces the derivation. steh- → Verstand → verständig → Verständigung.                                            |
| Bridges                | Compound Relationships | Bridges connect two root-islands when they combine in a compound. Handschuh bridges Hand-island and Schuh-island.                                                    |
| Root Monument          | Root Entity            | Central landmark of each island. Shows the root in its oldest recoverable form, with etymological depth visible as archaeological layers beneath it.                 |
| Underground / Caves    | Etymology Depth        | Descending beneath a root monument reveals older historical stages. NHG surface → MHG layer → OHG layer → PGmc → PIE deepest cavern.                                 |
| Sky / Atmosphere       | Frequency / Usage      | High-frequency roots have brighter, warmer light. Rare/archaic roots have twilight or mist. Immediate visual signal of how "alive" a root is.                        |
| Water / Sea            | Semantic Distance      | Unrelated root-islands are separated by sea. The wider the water, the more semantically distant. Close semantic fields = narrow channels.                            |

This mapping is not arbitrary. It leverages the method of loci (Yates 1966), the oldest known mnemonic technique, which exploits spatial memory to anchor abstract information. Neuroscience confirms that spatial encoding activates hippocampal place cells and significantly enhances long-term retention (O'Keefe & Nadel 1978, Reggente et al. 2018).

## 2.2 Procedural Generation Architecture

The world is generated, not hand-crafted. This is essential for scale (thousands of root families) and for variation (revisits feel fresh). The generation pipeline has three layers:

### 2.2.1 Layer 1: Macro Layout (Wave Function Collapse)

The overall world map - where root-islands sit relative to each other - is generated using a constrained Wave Function Collapse (WFC) algorithm. WFC is ideal here because:

- **It respects adjacency constraints:** We define which tile types can neighbour which. Root families in the same semantic field generate neighbouring islands. Etymologically related roots (cognates, shared PIE ancestor) generate nearby clusters.
- **It is deterministic given a seed:** The same ontology state always generates the same world. If you share your world seed, someone else sees the same layout. This enables collaborative discovery.
- **It is computationally cheap:** WFC for tile-based 2D maps (which we then extrude into 2.5D) runs in milliseconds on mobile hardware.

Implementation approach:

- **Convert ontology graph to adjacency matrix:** Semantic field proximity, shared roots, compound connections, etymological kinship → numeric affinity scores between root families.
- **Define tile types:** Germanic-forest, Latin-stone, Greek-ruin, French-garden, Water-sea, Bridge-tile, Path-tile, Mountain-tile. Each tile type has adjacency rules (forest can neighbour mountain, stone can neighbour garden, water separates distant clusters).
- **Run WFC on a 2D grid:** Seed from ontology hash. Collapse tiles respecting both adjacency rules and affinity scores. Higher-frequency roots get larger islands (more tiles).
- **Extrude to 2.5D:** Height maps from tile types. Forests get rolling hills. Stone regions get flat plateaus. Mountains for archaic or deeply etymological roots. This is a simple per-tile height lookup, not expensive terrain generation.

### 2.2.2 Layer 2: Island Detail (Template + Parameterisation)

Within each root-island, the internal layout (where buildings sit, where paths run) is generated from the ontology's morphological structure:

- **Root monument at centre.** Always the focal point. Its visual style reflects the root's historical stage (runic for PGmc roots, Latin script for Latinate, etc.).
- **Buildings placed along derivation paths.** The derivation chain steh- → Verstand → verständig → Verständigung becomes a literal path with buildings at each step. Longer chains → longer paths.
- **Building size scales with frequency:** High-frequency lexemes generate larger structures. Verstehen (A1, very common) is a large prominent building. Verständigung (C1, less common) is a smaller structure further along the path.
- **Compound bridges:** If a compound word connects this root to another, a bridge structure generates at the island edge, pointing toward the other root-island.
- **Parameterised templates:** A small library of low-poly building templates (tower, house, cottage, hall, pillar), each taking parameters from the ontology (height = syllable count, colour = semantic field, roof style = POS). Not random - deterministic from the data.

### 2.2.3 Layer 3: Object Placement & Detail (Noise + Rules)

The finest detail layer places individual interactable objects (lexemes) and environmental dressing:

- **Interactable word-objects:** Inside/around each building, objects represent specific word forms. A noun might be a carved stone tablet. A verb might be an animated mechanism. An adjective might be a coloured crystal. Interaction reveals the full lexeme entry.
- **Attestation scrolls:** Scattered through the environment are physical scrolls/books that, when opened, show a real passage from the knowledge base (a Grimm fairy tale sentence, a Goethe stanza, a Kafka paragraph) with the root word highlighted. Tapping the source citation opens the external URL.
- **Environmental dressing:** Procedural placement of trees, rocks, grass, water features using Perlin noise, constrained by tile type. Low-poly. No collision complexity. Just ambient presence.
- **Audio layer:** Ambient soundscape per tile type. Native Germanic roots → wind, birdsong. Latin roots → stone echoes, fountain water. Pronunciation audio plays when interacting with word-objects.

# Part III: Game Mechanics - Learning Through Play

## 3.1 Discovery Mechanics (Reading & Comprehension)

The primary game loop. No instruction required - you learn by exploring.

**Mechanic: Root Excavation**

At each root monument, you can "excavate" downward through historical layers. Each layer reveals an older form of the root with its historical context. Digging from NHG Haus → MHG hūs → OHG hūs → PGmc \*hūsą → PIE \*ḱews-. At each layer, the environment subtly changes (architecture becomes more ancient, script changes). The excavation is optional - you can stay on the surface and just explore modern German.

Neuroscience grounding: Depth of processing (Craik & Lockhart 1972). Tracing a word's history engages elaborative encoding, creating multiple memory traces. The spatial descent through layers creates a vivid episodic memory of the etymological journey.

**Mechanic: Word-Object Inspection**

Touching any word-object reveals an expanding information card (not a popup - the card unfolds in 3D space near the object). First: the word with pronunciation audio. Then: morphological decomposition shown as coloured segments snapping apart and reassembling. Then: definition. Then: an attestation passage. Then: links to related objects. Each layer of information requires a deliberate tap to expand - you control the depth.

Neuroscience grounding: Elaborative interrogation (Pressley et al. 1987). Actively asking "why does this word have this structure?" produces stronger encoding than passive exposure. The layered reveal structure encourages this questioning.

**Mechanic: Compound Bridge Walking**

When you cross a bridge to another root-island, the bridge itself displays the compound word that connects the two roots. Walking across it, the compound slowly decomposes: Handschuh splits into Hand and Schuh as you walk. You arrive at the other island understanding the connection. Compound bridges are the primary navigation mechanic between root families.

**Mechanic: Passage Encounter**

Attestation scrolls are placed throughout the world. Opening one reveals a passage from the knowledge base (a fairy tale, a poem, a philosophical text, a news article). Root words in the passage glow, linking to their nearby objects. You can tap any word to see its decomposition. The passage comes with a source citation and a "Read full text" link. This is how the game directs you to the original source.

Neuroscience grounding: Context-dependent memory (Godden & Baddeley 1975). Encountering words in rich, varied contexts produces more robust and flexible word knowledge than isolated study.

## 3.2 Practice Mechanics (Active Recall & Production)

Practice is always optional and always contextual. Exercises emerge from what you've recently discovered, not from a pre-set curriculum.

**Mechanic: Morpheme Assembly**

A building in the world shows its completed word. You're presented with the scattered morpheme pieces (root + affixes) floating in 3D space. Drag and snap them together in the correct order. Getting it right makes the building solidify. Getting it wrong shows what the incorrect assembly would mean (if anything) or why it doesn't work.

Neuroscience grounding: Retrieval practice / testing effect (Karpicke & Roediger 2008). Active reconstruction is more effective than passive recognition. The spatial manipulation adds motor encoding.

**Mechanic: Sound Garden**

A special area on each island where you hear words spoken and must identify/locate the corresponding object. Words play as audio; you walk toward the object you think matches. Variants: hear the root, find all derived words. Hear a sentence, identify which words belong to this root family. This is the primary listening practice mechanic.

Neuroscience grounding: Dual coding (Paivio 1986). Simultaneous auditory and spatial processing creates redundant memory traces.

**Mechanic: Affix Workshop**

An interactive station where you experiment with affixes. Given a root, you can apply different prefixes and suffixes and see the results - both valid words (which light up and spawn into the world) and invalid combinations (which fizzle with a gentle explanation of why). This teaches productive word-formation rules through experimentation.

Neuroscience grounding: Hypothesis testing / discovery learning (Bruner 1961). Generating predictions and receiving feedback is more effective than being told rules.

**Mechanic: Passage Cloze**

An attestation passage with certain words replaced by blanks. The missing words are always related to the current root family. You fill in the blanks by selecting from word-objects in the environment. The passage comes from the knowledge base with full source citation.

Neuroscience grounding: Cloze / fill-in-the-blank tasks engage productive recall in context (Jonz 1991). Contextualised practice transfers better to real reading comprehension.

**Mechanic: Etymology Quiz (Depth Challenge)**

At the root monument's deepest excavation layer: "Which modern German words descend from this root?" Given a PIE or PGmc root, identify which NHG words (shown as distant lights on the surface above) belong to this family. Correct answers create visible light-beam connections between the underground root and the surface buildings. Wrong guesses are gently explained ("that word actually comes from a different root; here's why they look similar").

## 3.3 Collection & Memory Mechanics

The personal library system, driven by spaced repetition but disguised as collection and curation.

**Mechanic: The Personal Wortschatz (Word Treasury)**

Every word, root, passage, or etymology chain you interact with can be "collected" into your personal Wortschatz. This is a 3D miniature world that grows as your collection grows - a personal garden/museum of language. Items in your Wortschatz are subject to spaced repetition review, but presented as "revisiting your collection" rather than "drill time."

Implementation: Modified SM-2 algorithm (Wozniak & Biedalak 1994) running locally. Review intervals computed on-device. Items due for review glow or subtly animate in your Wortschatz. You choose which to revisit. No forced review sessions.

**Mechanic: Root Tree Growth**

Each root in your collection is visualised as a growing tree. New derived words = new branches. Mastered words = leaves/fruit. The tree grows over weeks and months, providing a long-term visual metaphor for your deepening knowledge of that root family. Trees can be viewed in your Wortschatz garden.

Neuroscience grounding: Growth visualisation supports self-efficacy (Bandura 1977) without competitive comparison. You see your own growth over time.

**Mechanic: Source Bookshelf**

Every source you encounter (DWDS entries, Grimm's DWB, DTA texts, fairy tales) is saved in a virtual bookshelf in your Wortschatz. You can browse by source, by author, by period. Tapping a source opens the external URL. This is the "curated information library" the user builds over time.

## 3.4 Speaking & Writing Mechanics

The hardest modalities for a lightweight app. Our approach is honest about limitations.

**Speaking: Pronunciation Garden**

Using the Web Speech API (SpeechRecognition interface), the game can offer basic pronunciation practice. The learner hears a word, attempts to say it, and the recognition engine provides rough feedback. This is not high-fidelity pronunciation training - we're honest about that. The UI shows it as a "practice space" where you can experiment, not a grading system.

Technical note: Web Speech API quality varies by device and browser. Progressive enhancement: if unavailable, this feature gracefully degrades to listen-only mode. We do not require it.

**Writing: Inscription Stones**

At certain points in the world, blank inscription stones invite you to type words. Type the correct inflected form of a word given a grammatical context ("Dative plural of Haus?" → Häusern). On mobile, the keyboard appears naturally. This is lightweight but effective for active production of word forms.

# Part IV: Spaced Repetition - Hidden Engine, Visible Garden

## 4.1 The Core Insight

Spaced repetition is the single most effective technique for long-term vocabulary retention (Dunlosky et al. 2013, "high utility" rating). But every existing implementation presents it as drill: a queue of flashcards. Urwort hides the SRS engine beneath the exploration layer. The learner never sees an algorithm - they see a living world where some places call to them more than others.

## 4.2 How It Works

- **Every collected item has an SRS state:** interval, ease factor, next review date. Stored locally on device. Modified SM-2 algorithm.
- **Items due for review manifest in the world:** A root monument you haven't visited in a while develops a subtle glow. A building whose word is due for review has a "fading" visual effect (less saturated, slightly transparent). Walking to it and interacting counts as a review.
- **Review happens through normal gameplay:** Inspecting a word-object = recognition review. Doing a morpheme assembly = active recall review. Completing a cloze passage = contextual review. Each interaction type maps to a review quality score (0-5 in SM-2 terms).
- **The Wortschatz (personal collection) serves as a fallback:** If you don't naturally encounter due items in the world, your Wortschatz garden highlights them. You can do focused review there. But it's never forced.
- **Root-level scheduling:** The SRS doesn't just schedule individual words. It schedules root families. When a root is due, the entire island subtly beckons. This means a single visit reviews multiple related words, exploiting the root-family structure.

## 4.3 Why Not Just Use Anki?

Anki is excellent at what it does. Urwort is not trying to replace it. The differences:

- **Context:** Anki presents isolated cards. Urwort presents words in spatial, etymological, and literary context. Context-dependent encoding produces more transferable knowledge.
- **Discovery:** Anki requires you to pre-populate your deck. Urwort generates discovery from the ontology. You don't need to know what to study.
- **Motivation:** Anki review sessions feel like work. Urwort review feels like returning to a familiar place. The affective dimension matters for long-term engagement.
- **Export compatibility:** Users should be able to export their Wortschatz as Anki decks if they want. Interoperability, not lock-in.

# Part V: Technical Architecture

## 5.1 Platform: PWA-First

Urwort is a Progressive Web App. This is a structural choice, not a compromise:

- **Universal access:** Runs on any device with a modern browser. No App Store gatekeeping. No platform fees. Aligns with the "free for everyone" principle.
- **Offline-first:** Service workers cache the ontology data, 3D assets, and audio. The game works fully offline after initial load. This is essential for learners with intermittent connectivity.
- **Installable:** Add to home screen. Feels like a native app. No download friction.
- **Progressive degradation:** Full experience with WebGPU. Good experience with WebGL2. Basic experience with WebGL1. The game works everywhere, just with different visual fidelity.

## 5.2 Rendering Pipeline

| **Component**   | **Technology**                 | **Rationale**                                                                                                                        |
| --------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| 3D Engine       | Three.js                       | Industry standard for web 3D. Huge ecosystem. Supports WebGL1/2 and WebGPU. MIT license.                                             |
| Render Style    | Low-poly / pixel-inspired      | Minimal geometry = fast rendering. Distinctive aesthetic. Vertex-coloured meshes avoid texture bandwidth. Runs on 5-year-old phones. |
| Shading         | Custom toon/flat shader        | Simple lighting model. 1-2 directional lights + ambient. No PBR. No reflections. No shadows on lowest tier.                          |
| Camera          | Isometric / slight perspective | 2.5D feel. Fixed camera angle with rotation. No free-look (reduces motion sickness, simplifies UI).                                  |
| LOD System      | 3-tier: close/medium/far       | Close: full geometry + interactable. Medium: simplified geometry + label. Far: billboard sprite. Essential for mobile.               |
| Draw Distance   | Adaptive fog + chunk loading   | Only render nearby chunks. Atmospheric fog hides pop-in. Load/unload chunks based on player position.                                |
| Post-Processing | Minimal: colour grading only   | No bloom, no SSAO, no motion blur. Colour grading per biome/semantic field. One full-screen pass maximum.                            |

## 5.3 Procedural Generation Pipeline

| **Stage**         | **Algorithm**                  | **Input**                                | **Output**                              |
| ----------------- | ------------------------------ | ---------------------------------------- | --------------------------------------- |
| 1\. World Map     | WFC (2D tilemap)               | Ontology adjacency matrix + tile rules   | 2D grid of biome tiles                  |
| 2\. Height Map    | Per-tile lookup + Perlin noise | Biome tiles + noise seed                 | Height values per vertex                |
| 3\. Island Layout | Force-directed graph layout    | Root's derivation tree                   | Building positions + path splines       |
| 4\. Building Gen  | Parametric templates           | Lexeme properties (freq, POS, syllables) | Low-poly mesh + vertex colours          |
| 5\. Object Place  | Poisson disc sampling          | Building interiors + lexeme list         | Interactable object positions           |
| 6\. Dressing      | Perlin noise + biome rules     | Tile type + height map                   | Trees, rocks, grass patches (instanced) |

All generation runs on the client. The ontology data (JSON, ~5-20MB for 5,000 lexemes) is cached locally via service worker. Generation is deterministic from the ontology hash, so the world is consistent across sessions and devices.

## 5.4 Data Architecture

| **Data Layer**     | **Storage**                               | **Details**                                                                                                               |
| ------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Ontology (shared)  | Service Worker cache (IndexedDB fallback) | JSON-LD export of the full ontology. Versioned. Fetched from CDN on first load, updated periodically. ~5-20MB compressed. |
| 3D Assets          | Service Worker cache                      | Low-poly GLTF models for templates. Small (<2MB total). Vertex-coloured, no textures.                                     |
| Audio              | Service Worker cache + lazy load          | Pronunciation audio clips. Lazy-loaded per region. ~50KB per word average. Prioritise cached for collected words.         |
| User State         | IndexedDB (local)                         | Wortschatz collection, SRS state, exploration progress, settings. Never leaves device unless user explicitly exports.     |
| User Contributions | Local draft → sync to server              | Attestation submissions, corrections, notes. Stored locally first. Synced to review pipeline when online.                 |

## 5.5 Performance Targets

| **Metric**                    | **Target**                      | **Minimum**                   |
| ----------------------------- | ------------------------------- | ----------------------------- |
| Frame rate                    | 60fps on mid-range phone (2022) | 30fps on low-end phone (2019) |
| Initial load (cached)         | <2 seconds                      | <5 seconds                    |
| Time to interaction           | <3 seconds                      | <6 seconds                    |
| Offline data footprint        | <50MB (5,000 lexemes + assets)  | <100MB (full)                 |
| Memory usage                  | <150MB                          | <256MB                        |
| Battery drain (20min session) | <5% on 4000mAh battery          | <10%                          |

## 5.6 Progressive Enhancement Tiers

| **Tier**       | **Capability**   | **Visual Quality**                                                                                 | **Fallback**             |
| -------------- | ---------------- | -------------------------------------------------------------------------------------------------- | ------------------------ |
| Tier 3 (Best)  | WebGPU available | Full shading, instanced vegetation, particle effects for word interactions, smooth LOD transitions | N/A                      |
| Tier 2 (Good)  | WebGL2           | Toon shading, reduced vegetation, simple transition effects                                        | Auto-detected at startup |
| Tier 1 (Basic) | WebGL1 only      | Flat shading, minimal vegetation, no post-processing, lower draw distance                          | Auto-detected at startup |
| Tier 0 (Text)  | No WebGL         | 2D card-based interface. Same ontology, same mechanics, no 3D world. Still a good learning tool.   | Ultimate fallback        |

# Part VI: UX Design - Interface as Landscape

## 6.1 Navigation Model

- **Touch/click to move:** Tap a location to walk there. No virtual joysticks. No complex gesture controls. One finger navigates. Two fingers rotate camera. Pinch to zoom.
- **Tap objects to interact:** Single tap = quick preview (word + pronunciation). Long press / double tap = full inspection (morphology, etymology, attestation).
- **Minimap:** Optional small minimap showing nearby root-islands. Tap a root name on the minimap to navigate there directly. Colour-coded by semantic field.
- **Search:** Pull-down search bar. Type any German word → the camera flies to its location in the world. This is the "I know what I want to learn" path.
- **Wortschatz access:** Persistent small icon (a seed/sprout). Tap to enter your personal collection space.

## 6.2 Information Display

All information displays are embedded in the 3D world, not in flat overlays:

- **Word cards:** Unfold in 3D space near the object. Semi-transparent panels that blend with the environment. Show: word, IPA, audio button, morphological decomposition, definition, attestation snippet, source link.
- **Etymology layers:** Shown as archaeological strata beneath root monuments. Each layer is a physical plane with inscriptions.
- **Derivation paths:** Glowing lines on the ground connecting root monument to derived-word buildings. Following the path animates the derivation step by step.
- **Source links:** Always visible as a small book icon on word cards and attestation scrolls. Tap to open external URL in browser. The app never hides the source.

## 6.3 Accessibility

- **Colour-blind modes:** All colour-coded information has secondary encoding (shape, pattern, label). Tested against Deuteranopia, Protanopia, Tritanopia.
- **Text scaling:** All in-world text respects system font size settings. Minimum 14px equivalent at default.
- **Reduced motion:** Respects prefers-reduced-motion. Camera movements become instant cuts. Animations become state changes. Game is fully playable.
- **Screen reader path:** Tier 0 (text fallback) is fully screen-reader accessible. The same ontology data, same exercises, presented as structured HTML.
- **Language of instruction:** Starts in the user's L1 (initially English + German supported). Gradually reduces L1 scaffolding as the user progresses. User controls the L1/L2 balance in settings.

## 6.4 Onboarding

No tutorial. No instruction screens. The game teaches itself through the first island:

- **First launch:** You appear on a small, simple island with the root -haus- (Haus = house). The root monument is right in front of you. Natural curiosity drives interaction.
- **First interaction:** Touching the monument reveals "Haus" with pronunciation. The card shows morphological decomposition (simple: just the root). Definition appears.
- **First derivation:** A glowing path leads to a nearby building: "Hausfrau." Walking there and touching it shows the compound decomposition. The user learns the compound mechanic without being told.
- **First attestation:** A scroll near the Hausfrau building opens a sentence from Grimm: "Die Hausfrau stellte eine große Schüssel auf den Tisch." Root words glow. Source link visible.
- **First bridge:** At the island's edge, a bridge leads toward "Schuh" island (via Handschuh). The user discovers inter-island navigation.
- **First collection:** After 3-4 interactions, a gentle prompt: "Would you like to add Haus to your collection?" (This prompt appears once, early. After that, the collection gesture is available without prompting.)

Total onboarding time: 2-3 minutes. No text walls. No forced sequences. Just a well-designed first island.

# Part VII: Sound Design

## 7.1 Ambient Soundscapes

Each biome type has a generative ambient soundscape, not looped audio files. Using the Web Audio API and Tone.js:

- **Germanic forest biome:** Wind through leaves (filtered noise), distant birdsong (sine oscillators with vibrato), occasional wood creaks. Calm and meditative.
- **Latin stone biome:** Gentle water (filtered noise with resonance), stone echoes (reverb), subtle choral pad (very low in mix).
- **Greek ruin biome:** Open air, wind, occasional distant bell-like tones (FM synthesis).
- **French garden biome:** Fountain, soft insect sounds, faint music-box melody fragments.
- **Underground/etymology layers:** Deep resonance, dripping water, more reverb. Deeper layers = lower pitch environment.

## 7.2 Interaction Audio

- **Word pronunciation:** Played from cached audio files (sourced from Wiktionary/Forvo, creative commons). Clear, unhurried, with optional repeat button.
- **UI sounds:** Minimal. Soft click for navigation. Gentle chime for collection. No harsh beeps for errors - a soft wooden "tock" for incorrect attempts.
- **Discovery fanfare:** When you discover a new root family, a subtle musical phrase plays. Not triumphant - contemplative. Like finding something ancient and beautiful.

## 7.3 Technical Audio Constraints

- **Total audio asset size:** <3MB for ambient + UI sounds (generated via Web Audio API, not pre-recorded). Pronunciation files are additional, lazy-loaded.
- **Mobile audio context:** Web Audio API requires user gesture to start AudioContext on iOS/Android. First tap on the world starts audio. No autoplay.
- **Mute/volume:** Always accessible. Separate controls for ambient, pronunciation, and UI sounds.

# Part VIII: Community & Contribution Model

## 8.1 Contribution Types

- **Attestation submission:** User finds a sentence in a public-domain text containing a word in the ontology. They submit the passage with source citation. Review pipeline validates the source and adds it to the shared ontology.
- **Etymology correction:** User notices a disputed or outdated etymology. They submit a correction with source citation. Reviewed by contributors with linguistic background.
- **Pronunciation recording:** Native speakers can contribute pronunciation recordings for words lacking audio. Quality-checked via community voting.
- **Source verification:** Users audit existing source citations. Confirm that URLs still work. Verify that the information matches the cited source. This is the most accessible contribution type.
- **Translation of L1 layer:** Expanding the interface language / L1 support. Community-driven translation of UI text and definition glosses.

## 8.2 Contribution Incentives (Not Gamification)

We explicitly avoid leaderboards, badges, or competitive recognition for contributions. Instead:

- **Attribution:** Every contribution carries the contributor's chosen name. Their name appears in the ontology's source citations. They become part of the scholarly apparatus.
- **Visible impact:** When a contributed attestation appears in the game world as a scroll, the contributor's name is discreetly shown. "Beleg eingereicht von \[name\]."
- **Community pages:** A simple contributor directory. Who has contributed what. Transparent but not ranked.
- **The ontology itself as commons:** The entire ontology is open-source and CC-licensed. Contributing to it is contributing to a public good. This appeals to intrinsic motivation.

## 8.3 Moderation & Quality Control

- **Tiered review:** Simple contributions (source verification, pronunciation) require 1 reviewer. Complex contributions (etymology corrections, new root entries) require 2+ reviewers.
- **Source-required policy:** Every contribution must cite a source. No unsourced additions to the ontology. This is the quality firewall.
- **Version history:** All changes to the ontology are versioned. Reverts are possible. No data is ever truly deleted.

# Part IX: Open Source & Distribution

## 9.1 Licence Structure

- **Game code:** MIT or Apache 2.0. Maximum permissiveness. Anyone can fork, modify, deploy.
- **Ontology data:** Creative Commons Attribution-ShareAlike (CC BY-SA 4.0). Ensures the knowledge stays open while requiring attribution to sources.
- **3D assets:** CC0 (public domain) where possible. CC BY for contributed assets.
- **Audio:** CC BY-SA for community recordings. Wiktionary/Forvo audio retains its original licence.

## 9.2 Repository Structure

- **urwort/engine:** Three.js game engine, procedural generation, UI system.
- **urwort/ontology:** The ontology data, schema, and population scripts.
- **urwort/assets:** Low-poly 3D models, shaders, audio generation scripts.
- **urwort/api:** Optional backend for community contributions and ontology sync.
- **urwort/docs:** This design specification, contribution guides, data dictionary.

## 9.3 Deployment

- **Primary:** Static hosting (Netlify, Cloudflare Pages, GitHub Pages). The PWA is a static site with cached data. No server required for core gameplay.
- **API (optional):** Lightweight server for community contributions, ontology sync, and user account backup (if the user opts in). Can run on a single small VPS.
- **Self-hosting:** Anyone can clone and host their own instance. The documentation includes deployment instructions for all major static hosts.

# Part X: Development Roadmap

## Phase 0: Foundation (Months 1-2)

- **Ontology:** Populate first 500 lexemes (A1-A2 core vocabulary) with full root chains, morphological decomposition, and frequency data.
- **Engine:** Basic Three.js scene. Flat terrain. Camera controls. Tap-to-interact system. Word card display.
- **WFC prototype:** Simple 2D tilemap generation from ontology adjacency. No 3D extrusion yet.
- **Deliverable:** Playable prototype where you can walk a flat plane, tap word-objects, and see morphological decomposition + etymology. Ugly but functional.

## Phase 1: Vertical Slice (Months 3-4)

- **Ontology:** Expand to 2,000 lexemes. Add attestation layer (100-200 passages from Grimm, Goethe, and Deutsche Welle).
- **World:** Full 2.5D terrain generation from WFC. Island layout from derivation trees. 3-4 biome types with distinct visual identity.
- **Mechanics:** Root excavation. Compound bridge walking. Morpheme assembly exercise. Passage cloze.
- **SRS:** Local SM-2 implementation. Collection mechanic. Wortschatz view (simple list, not yet 3D garden).
- **Deliverable:** A beautiful, functional vertical slice covering 10-15 root families. Playable on desktop and mobile Chrome.

## Phase 2: PWA & Offline (Months 5-6)

- **PWA:** Service worker. Offline mode. Install prompt. Cached ontology + assets.
- **Audio:** Ambient soundscapes (Web Audio API). Pronunciation audio (Wiktionary integration).
- **Performance:** LOD system. Chunk loading. Frame rate optimisation for mobile. Progressive enhancement tiers.
- **Deliverable:** Installable PWA that works offline. Runs at 60fps on mid-range phones.

## Phase 3: Full Content & Community (Months 7-10)

- **Ontology:** Expand to 5,000+ lexemes. Full A1-B2 vocabulary. Rich attestation layer.
- **Mechanics:** Sound Garden (listening). Affix Workshop. Inscription Stones (writing). Pronunciation Garden (speaking, if Web Speech API viable).
- **Wortschatz:** 3D personal garden view. Root tree growth visualisation. Source bookshelf.
- **Community:** Contribution pipeline. Attestation submission. Source verification system.
- **Deliverable:** Public launch. Open-source repository. Contribution guide.

## Phase 4: Expansion (Ongoing)

- **Ontology growth:** Community-driven expansion toward 15,000-25,000 lexemes.
- **Content:** More attestation sources. More literary periods. More text types.
- **Features:** Anki export. User accounts (optional) for cross-device sync. Dialect layer. Collaborative world features.
- **Languages:** The ontology schema and game engine are language-agnostic. Dutch, Swedish, and other Germanic languages could reuse the framework with new ontology data.

# Appendix: Neuroscience Evidence Map

Every game mechanic is grounded in established cognitive science. This table maps mechanics to their evidence base.

| **Mechanic**                       | **Principle**                                        | **Key Evidence**                                          |
| ---------------------------------- | ---------------------------------------------------- | --------------------------------------------------------- |
| Root Excavation                    | Depth of processing; elaborative encoding            | Craik & Lockhart 1972; Craik & Tulving 1975               |
| Spatial World                      | Method of loci; spatial memory                       | Yates 1966; O'Keefe & Nadel 1978; Reggente et al. 2018    |
| Morpheme Assembly                  | Retrieval practice; testing effect                   | Karpicke & Roediger 2008; Roediger & Butler 2011          |
| Sound Garden                       | Dual coding theory                                   | Paivio 1986; Mayer 2001                                   |
| Affix Workshop                     | Discovery learning; hypothesis testing               | Bruner 1961; Alfieri et al. 2011                          |
| Passage Cloze                      | Contextual encoding; transfer-appropriate processing | Godden & Baddeley 1975; Morris et al. 1977                |
| SRS / Review                       | Spaced repetition; spacing effect                    | Ebbinghaus 1885; Cepeda et al. 2006; Dunlosky et al. 2013 |
| Error tolerance                    | Hypercorrection effect                               | Metcalfe 2017; Butterfield & Metcalfe 2001                |
| No streaks / no competition        | Self-determination theory; intrinsic motivation      | Deci & Ryan 1985; Ryan & Deci 2000                        |
| 5-min sessions / natural endpoints | Spacing > massing; distributed practice              | Cepeda et al. 2006; Kornell 2009                          |
| Root tree growth                   | Self-efficacy; mastery orientation                   | Bandura 1977; Dweck 2006                                  |
| Compound Bridge Walking            | Morphological awareness aids reading                 | Kuo & Anderson 2006; Carlisle 2000                        |
| Passage Encounter                  | Context-dependent memory; incidental learning        | Godden & Baddeley 1975; Hulstijn & Laufer 2001            |
| Free exploration                   | Autonomy support; curiosity-driven learning          | Deci & Ryan 1985; Gruber et al. 2014                      |