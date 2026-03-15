/**
 * Ontology data loader for Phase 0.
 *
 * Fetches the pre-built ontology.json (static file produced by
 * tools/export-ontology.py) and returns typed root clusters.
 *
 * In local dev: served by Vite from game/public/ontology.json
 * On GitHub Pages: served as a static file from /urwort/ontology.json
 */
import type { RootCluster, Wurzel, Wort, WurzelWortLink, CompoundLink } from '@/types';

/** Raw JSON shape from export-ontology.py */
interface OntologyJSON {
  version: number;
  stats: {
    total_clusters: number;
    multi_word_clusters: number;
    total_words: number;
    total_compounds: number;
  };
  clusters: RawCluster[];
}

interface RawCluster {
  wurzel: Wurzel;
  words: Wort[];
  links: WurzelWortLink[];
  compounds: CompoundLink[];
}

/** Options for loading and filtering the ontology */
export interface LoadOptions {
  /** Minimum words per cluster to include (default: 1) */
  minClusterSize?: number;
  /** Maximum number of clusters to load (default: all) */
  maxClusters?: number;
}

/**
 * Fetch and parse the ontology data.
 * Returns typed RootCluster[] ready for the world layout engine.
 */
export async function loadOntology(
  opts: LoadOptions = {},
): Promise<{ clusters: RootCluster[]; stats: OntologyJSON['stats'] }> {
  const {
    minClusterSize = 1,
    maxClusters = Infinity,
  } = opts;

  const url = `${import.meta.env.BASE_URL}ontology.json`;

  console.log(`[Urwort] Fetching ontology from ${url}...`);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Failed to load ontology: ${response.status} ${response.statusText}`);
  }

  const data: OntologyJSON = await response.json();
  console.log(`[Urwort] Ontology loaded: ${data.stats.total_clusters} clusters, ${data.stats.total_words} words`);

  // Filter and limit
  let clusters: RootCluster[] = data.clusters
    .filter(c => c.words.length >= minClusterSize)
    .slice(0, maxClusters);

  console.log(`[Urwort] After filtering (min ${minClusterSize} words, max ${maxClusters}): ${clusters.length} clusters`);

  return { clusters, stats: data.stats };
}
