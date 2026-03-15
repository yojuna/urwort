/**
 * OntologyStore — single source of truth for ontology data access.
 *
 * Indexes clusters on load and exposes typed query methods.
 * Replaces ad-hoc raw data walks in other modules.
 */
import type { RootCluster, Wort, Wurzel } from '../types';

// ---------------------------------------------------------------------------
// Umlaut normalisation helpers (shared with search logic)
// ---------------------------------------------------------------------------

/** Transliterate ASCII digraph approximations → canonical German chars */
function normaliseQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/ae/g, 'ä')
    .replace(/oe/g, 'ö')
    .replace(/ue/g, 'ü')
    .replace(/ss/g, 'ß');
}

/** Strip umlauts for ASCII-only comparison */
function stripped(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss');
}

// ---------------------------------------------------------------------------
// Search scoring
// ---------------------------------------------------------------------------

function scoreMatch(query: string, wort: Wort): number {
  const q = normaliseQuery(query);
  const qs = stripped(query);
  const lq = q.toLowerCase();
  const lqs = qs.toLowerCase();

  let score = 0;
  const lemma = wort.lemma.toLowerCase();
  const lemmaSt = stripped(wort.lemma);

  if (lemma === lq || lemmaSt === lqs) return 1000;
  if (lemma.startsWith(lq) || lemmaSt.startsWith(lqs)) score += 200;
  if (lemma.includes(lq) || lemmaSt.includes(lqs)) score += 100;

  if (score === 0) {
    let j = 0;
    for (const ch of lq) {
      const idx = lemma.indexOf(ch, j);
      if (idx !== -1) { score += 1; j = idx + 1; }
    }
  }

  const def = (wort.definition_en || '').toLowerCase();
  if (def.includes(lq) || def.includes(lqs)) score += 20;

  return score;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export interface SearchResult {
  wort: Wort;
  cluster: RootCluster;
  score: number;
}

export class OntologyStore {
  private clusters: RootCluster[];
  private clusterById = new Map<string, RootCluster>();
  private wortById = new Map<string, Wort>();
  private wortToCluster = new Map<string, RootCluster>();

  constructor(clusters: RootCluster[]) {
    this.clusters = clusters;

    // Build indexes
    for (const cluster of clusters) {
      this.clusterById.set(cluster.wurzel.id, cluster);
      for (const wort of cluster.words) {
        this.wortById.set(wort.id, wort);
        this.wortToCluster.set(wort.id, cluster);
      }
    }
  }

  /** Prefix + fuzzy search, max `maxResults` results. Handles umlaut transliteration. */
  searchLemma(query: string, maxResults = 8): SearchResult[] {
    if (!query.trim()) return [];

    const results: SearchResult[] = [];
    for (const cluster of this.clusters) {
      for (const wort of cluster.words) {
        const score = scoreMatch(query, wort);
        if (score > 0) {
          results.push({ wort, cluster, score });
        }
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  /** Lookup by cluster wurzel ID (e.g. "r-42") */
  getCluster(wurzelId: string): RootCluster | null {
    return this.clusterById.get(wurzelId) ?? null;
  }

  /** Lookup by wort ID (e.g. "Haus|NOUN") */
  getWort(wortId: string): Wort | null {
    return this.wortById.get(wortId) ?? null;
  }

  /** Find which cluster contains a given wort */
  getClusterForWort(wortId: string): RootCluster | null {
    return this.wortToCluster.get(wortId) ?? null;
  }

  /** All clusters (for world generation) */
  allClusters(): RootCluster[] {
    return this.clusters;
  }

  get totalWords(): number {
    return this.wortById.size;
  }

  get totalClusters(): number {
    return this.clusters.length;
  }
}
