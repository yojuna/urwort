/* kaikki.js — Kaikki.org API integration (Layer 3 enrichment)
 *
 * Fetches data from our FastAPI backend (/api/kaikki/{word}).
 * The backend handles fetching from kaikki.org and processing JSONL.
 * Stores structured data in wordData.sources.kaikki namespace.
 */

const Kaikki = (() => {

  /**
   * Build the API URL for a German word.
   * 
   * @param {string} word - German word (e.g., "Haus", "Schule")
   * @param {string} lang - Language code (default: "de")
   * @returns {string|null} - URL or null if word is invalid
   */
  function buildAPIURL(word, lang = 'de') {
    if (!word || typeof word !== 'string') return null;
    
    // Use relative URL - nginx will proxy to FastAPI backend
    // Preserve original casing for the word
    return `/api/kaikki/${encodeURIComponent(word)}?lang=${encodeURIComponent(lang)}`;
  }


  /**
   * Fetch data from our FastAPI backend.
   * 
   * @param {string} word - German word to fetch
   * @param {string} lang - Language code (default: "de")
   * @returns {Promise<object|null>} - Parsed data or null on error
   */
  async function fetchWord(word, lang = 'de') {
    const url = buildAPIURL(word, lang);
    if (!url) {
      console.warn('[kaikki] Invalid word for URL building:', word);
      return null;
    }

    try {
      console.log('[kaikki] Fetching from API:', url);
      const response = await fetch(url);
      
      if (!response.ok) {
        // 404 is expected for words not in kaikki.org
        if (response.status === 404) {
          console.log('[kaikki] Word not found:', word);
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
        
        console.error('[kaikki] API error:', response.status, errorData);
        throw new Error(`HTTP ${response.status}: ${errorData.message || response.statusText}`);
      }

      // Parse JSON response (API returns JSON, not HTML)
      const data = await response.json();
      
      if (!data) {
        console.warn('[kaikki] Empty response for:', word);
        return null;
      }

      // The API already returns data in the correct format
      // Just ensure it has the expected structure
      return {
        fetchedAt: data.fetchedAt || Date.now(),
        entries: data.entries || [],
        allSenses: data.allSenses || [],
        allForms: data.allForms || [],
        etymology: data.etymology || null,
        ipa: data.ipa || [],
        audio: data.audio || [],
      };

    } catch (error) {
      console.error('[kaikki] Fetch error for', word, ':', error);
      return null;
    }
  }

  /**
   * Merge Kaikki.org data into an existing word entry.
   * Updates entry.sources.kaikki and saves to IDB.
   * 
   * @param {object} entry - Existing word entry
   * @param {string} dir - Direction ('de-en' or 'en-de')
   * @returns {Promise<object>} - Updated entry
   */
  async function enrichEntry(entry, dir) {
    if (!entry || !entry.w) {
      console.warn('[kaikki] enrichEntry: invalid entry', entry);
      return entry;
    }

    // Only fetch for German words (de-en direction)
    if (dir !== 'de-en') {
      return entry;
    }

    // Check if already enriched
    if (entry.sources?.kaikki) {
      console.log('[kaikki] Already enriched:', entry.w);
      return entry;
    }

    // Fetch from Kaikki.org
    const kaikkiData = await fetchWord(entry.w);
    if (!kaikkiData) {
      // Not found or error — mark as attempted to avoid retries
      entry.sources = entry.sources || {};
      entry.sources.kaikki = { attempted: true, fetchedAt: Date.now() };
      await DB.wordDataPut(entry, dir);
      return entry;
    }

    // Merge into entry
    entry.sources = entry.sources || {};
    entry.sources.kaikki = kaikkiData;

    // Save to IDB
    await DB.wordDataPut(entry, dir);
    console.log('[kaikki] Enriched and saved:', entry.w);

    return entry;
  }

  // ── Expose ────────────────────────────────────────────────────────────────────
  return {
    fetchWord,
    enrichEntry,
    buildAPIURL, // Exposed for testing
  };
})();

window.Kaikki = Kaikki;
