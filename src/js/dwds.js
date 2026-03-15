/* dwds.js — DWDS API integration (Layer 3 enrichment)
 *
 * Fetches data from our FastAPI backend (/api/dwds/{word}).
 * The backend handles fetching from dwds.de and processing corpus data.
 * Stores structured data in wordData.sources.dwds namespace.
 */

const DWDS = (() => {

  /**
   * Build the API URL for a German word.
   * 
   * @param {string} word - German word (e.g., "Haus", "Schule")
   * @returns {string|null} - URL or null if word is invalid
   */
  function buildAPIURL(word) {
    if (!word || typeof word !== 'string') return null;
    
    // Use relative URL - nginx will proxy to FastAPI backend
    // Preserve original casing for the word
    return `/api/dwds/${encodeURIComponent(word)}`;
  }


  /**
   * Fetch data from our FastAPI backend.
   * 
   * @param {string} word - German word to fetch
   * @returns {Promise<object|null>} - Parsed data or null on error
   */
  async function fetchWord(word) {
    const url = buildAPIURL(word);
    if (!url) {
      console.warn('[dwds] Invalid word for URL building:', word);
      return null;
    }

    try {
      console.log('[dwds] Fetching from API:', url);
      const response = await fetch(url);
      
      if (!response.ok) {
        // 404 is expected for words not in DWDS
        if (response.status === 404) {
          console.log('[dwds] Word not found:', word);
          return null;
        }
        
        // Handle other errors
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }
        
        console.error('[dwds] API error:', response.status, errorData);
        throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
      }

      // Parse JSON response
      const data = await response.json();
      
      if (!data) {
        console.warn('[dwds] Empty response for:', word);
        return null;
      }

      // The API already returns data in the correct format
      // Just ensure it has the expected structure
      return {
        fetchedAt: data.fetchedAt || Date.now(),
        word: data.word || word,
        wortart: data.wortart || "",
        url: data.url || "",
        examples: data.examples || [],
        usage: data.usage || [],
        collocations: data.collocations || [],
        etymology: data.etymology || null,
        synonyms: data.synonyms || [],
        definitions: data.definitions || [],
        corpus_stats: data.corpus_stats || null,
      };

    } catch (error) {
      console.error('[dwds] Fetch error for', word, ':', error);
      return null;
    }
  }

  /**
   * Merge DWDS data into an existing word entry.
   * Updates entry.sources.dwds and saves to IDB.
   * 
   * @param {object} entry - Existing word entry
   * @param {string} dir - Direction ('de-en' or 'en-de')
   * @returns {Promise<object>} - Updated entry
   */
  async function enrichEntry(entry, dir) {
    if (!entry || !entry.w) {
      console.warn('[dwds] enrichEntry: invalid entry', entry);
      return entry;
    }

    // Only fetch for German words (de-en direction)
    if (dir !== 'de-en') {
      return entry;
    }

    // Check if already enriched
    if (entry.sources?.dwds) {
      console.log('[dwds] Already enriched:', entry.w);
      return entry;
    }

    // Fetch from DWDS
    const dwdsData = await fetchWord(entry.w);
    if (!dwdsData) {
      // Not found or error — mark as attempted to avoid retries
      entry.sources = entry.sources || {};
      entry.sources.dwds = { attempted: true, fetchedAt: Date.now() };
      await DB.wordDataPut(entry, dir);
      return entry;
    }

    // Merge into entry
    entry.sources = entry.sources || {};
    entry.sources.dwds = dwdsData;

    // Save to IDB
    await DB.wordDataPut(entry, dir);
    console.log('[dwds] Enriched and saved:', entry.w);

    return entry;
  }

  // ── Expose ────────────────────────────────────────────────────────────────────
  return {
    fetchWord,
    enrichEntry,
    buildAPIURL, // Exposed for testing
  };
})();

window.DWDS = DWDS;
