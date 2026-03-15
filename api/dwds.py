"""DWDS (Digitales Wörterbuch der deutschen Sprache) fetching and parsing logic"""
import json
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import httpx
from .config import config

logger = logging.getLogger(__name__)

# DWDS API base URLs
DWDS_CORPUS_URL = "https://www.dwds.de/r/"
DWDS_STAT_URL = "https://www.dwds.de/api/stat/"
DWDS_AUTOCOMPLETE_URL = "https://www.dwds.de/api/complete/"


def build_dwds_snippet_url(word: str) -> str:
    """
    Build DWDS snippet API URL for a word.
    
    Format: https://www.dwds.de/api/wb/snippet/?q={word}
    
    Args:
        word: The word to fetch (case-sensitive)
    
    Returns:
        URL string
    """
    if not word:
        raise ValueError("Word cannot be empty")
    
    return f"https://www.dwds.de/api/wb/snippet/?q={word}"


async def fetch_dwds_snippet(word: str) -> Optional[Dict[str, Any]]:
    """
    Fetch snippet data from DWDS API.
    
    Args:
        word: The word to fetch
    
    Returns:
        Snippet data dict or None if not found/error
    """
    url = build_dwds_snippet_url(word)
    logger.info(f"Fetching DWDS snippet: {url}")
    
    try:
        async with httpx.AsyncClient(timeout=config.KAIKKI_TIMEOUT) as client:
            response = await client.get(url, follow_redirects=True)
            
            if response.status_code == 404:
                logger.info(f"Word '{word}' not found in DWDS (404)")
                return None
            
            response.raise_for_status()
            data = response.json()
            
            # API returns array, get first result
            if isinstance(data, list) and len(data) > 0:
                return data[0]
            elif isinstance(data, dict):
                return data
            else:
                logger.warning(f"Unexpected DWDS snippet format for '{word}'")
                return None
            
    except httpx.TimeoutException:
        logger.error(f"Timeout fetching '{word}' from DWDS")
        raise
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching '{word}' from DWDS: {e.response.status_code}")
        raise
    except Exception as e:
        logger.error(f"Error fetching '{word}' from DWDS: {e}")
        raise


async def fetch_dwds_corpus(word: str, corpus: str = "kern", limit: int = 10) -> Optional[Dict[str, Any]]:
    """
    Fetch corpus data from DWDS JSON API.
    
    Args:
        word: The word to search for
        corpus: Corpus to search (default: "kern" for high-quality corpus)
        limit: Number of results to return (default: 10)
    
    Returns:
        Dict with 'hits' (list) and 'total' (int, if available) or None if error
    """
    params = {
        "q": word,
        "view": "json",
        "corpus": corpus,
        "limit": limit,
    }
    
    # DWDS API requires a User-Agent header to avoid 403 Forbidden
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "application/json",
    }
    
    logger.info(f"Fetching DWDS corpus data: {DWDS_CORPUS_URL} with params {params}")
    
    try:
        async with httpx.AsyncClient(timeout=config.KAIKKI_TIMEOUT) as client:
            response = await client.get(DWDS_CORPUS_URL, params=params, headers=headers, follow_redirects=True)
            
            if response.status_code != 200:
                logger.warning(f"DWDS corpus API returned status {response.status_code} for '{word}'")
                return None
            
            data = response.json()
            # API returns an array of hits
            if isinstance(data, list):
                return {
                    "hits": data,
                    "corpus": corpus,
                    "total": len(data),  # Approximate - actual total might be higher
                }
            elif isinstance(data, dict):
                # If API returns a dict with hits and stats
                return {
                    "hits": data.get("hits", []),
                    "corpus": corpus,
                    "total": data.get("stats", {}).get("total") if "stats" in data else len(data.get("hits", [])),
                }
            else:
                logger.warning(f"Unexpected DWDS corpus response format for '{word}'")
                return None
            
    except httpx.TimeoutException:
        logger.error(f"Timeout fetching corpus data for '{word}' from DWDS")
        return None
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching corpus data for '{word}': {e.response.status_code}")
        return None
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse JSON response for '{word}': {e}")
        return None
    except Exception as e:
        logger.error(f"Error fetching corpus data for '{word}' from DWDS: {e}")
        return None


async def fetch_dwds_frequency(word: str) -> Optional[List[Dict[str, Any]]]:
    """
    Fetch word frequency over time from DWDS statistics API.
    
    Args:
        word: The word to get frequency data for
    
    Returns:
        List of frequency data points [{year, f}] or None if error/not available
    """
    params = {
        "q": word,
    }
    
    headers = {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "application/json",
    }
    
    logger.info(f"Fetching DWDS frequency data: {DWDS_STAT_URL} with params {params}")
    
    try:
        async with httpx.AsyncClient(timeout=config.KAIKKI_TIMEOUT) as client:
            response = await client.get(DWDS_STAT_URL, params=params, headers=headers, follow_redirects=True)
            
            if response.status_code != 200:
                logger.debug(f"DWDS frequency API returned status {response.status_code} for '{word}' (may not be available)")
                return None
            
            # Check if response is JSON
            content_type = response.headers.get("content-type", "")
            if "application/json" not in content_type:
                logger.debug(f"DWDS frequency API returned non-JSON for '{word}'")
                return None
            
            data = response.json()
            
            # Expected format: [{"year": 1900, "f": 2.45}, ...]
            if isinstance(data, list) and len(data) > 0:
                return data
            else:
                logger.debug(f"DWDS frequency API returned empty or unexpected format for '{word}'")
                return None
            
    except httpx.TimeoutException:
        logger.debug(f"Timeout fetching frequency data for '{word}' from DWDS")
        return None
    except httpx.HTTPStatusError:
        # 404 is expected for many words - frequency data may not be available
        logger.debug(f"Frequency data not available for '{word}'")
        return None
    except json.JSONDecodeError:
        logger.debug(f"Failed to parse frequency JSON response for '{word}'")
        return None
    except Exception as e:
        logger.debug(f"Error fetching frequency data for '{word}' from DWDS: {e}")
        return None


def extract_sentence_from_ctx(ctx_data: List) -> str:
    """
    Extract a readable sentence from DWDS ctx_ array format.
    
    The ctx_ field is an array: [prefix, tokens_array, suffix]
    Each token is a dict with 'w' (word), 'ws' (whitespace), 'hl_' (highlight)
    
    Args:
        ctx_data: The ctx_ array from DWDS API
    
    Returns:
        Reconstructed sentence string
    """
    if not isinstance(ctx_data, list) or len(ctx_data) < 2:
        return ""
    
    tokens = ctx_data[1]  # Middle element contains the tokens
    if not isinstance(tokens, list):
        return ""
    
    sentence_parts = []
    for i, token in enumerate(tokens):
        if isinstance(token, dict):
            word = token.get("w", "")
            whitespace = token.get("ws", "0") == "1"  # Convert to boolean
            
            # Add whitespace before word if needed (except for first token)
            if whitespace and i > 0 and sentence_parts:
                sentence_parts.append(" ")
            
            # Add word
            if word:
                sentence_parts.append(word)
    
    return "".join(sentence_parts).strip()


def extract_examples_from_corpus(corpus_data: Dict[str, Any]) -> tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    Extract example sentences from corpus data and statistics.
    
    Args:
        corpus_data: Dict with 'hits' (list) and metadata from DWDS API
    
    Returns:
        Tuple of (examples list, stats dict)
    """
    examples = []
    hits = corpus_data.get("hits", [])
    
    for hit in hits:
        # Extract sentence from ctx_ field
        ctx_data = hit.get("ctx_", [])
        sentence = extract_sentence_from_ctx(ctx_data)
        
        if not sentence:
            continue
        
        # Extract metadata
        meta = hit.get("meta_", {})
        
        example = {
            "sentence": sentence,
            "source": meta.get("title", ""),
            "date": meta.get("date_", ""),
            "author": meta.get("author", ""),
            "newspaper": meta.get("newspaper", ""),
            "bibl": meta.get("bibl", ""),
            "textclass": meta.get("textClass", ""),
        }
        
        examples.append(example)
    
    # Build stats
    stats = {
        "corpus": corpus_data.get("corpus", ""),
        "total_occurrences": corpus_data.get("total"),
        "examples_returned": len(examples),
    }
    
    return examples, stats


async def fetch_and_process_word(word: str, include_corpus: bool = True, include_frequency: bool = True) -> Optional[Dict[str, Any]]:
    """
    Main function: fetch from DWDS and process into response format.
    
    Args:
        word: German word to fetch
        include_corpus: Whether to fetch corpus examples (default: True)
        include_frequency: Whether to fetch frequency data (default: True)
    
    Returns:
        Processed data dict or None if word not found
    """
    # Fetch snippet (fast, basic info)
    snippet = await fetch_dwds_snippet(word)
    if snippet is None:
        return None
    
    # Build word page URL
    word_url = snippet.get("url", f"https://www.dwds.de/wb/{word}")
    
    result = {
        "word": snippet.get("lemma", word),
        "wortart": snippet.get("wortart", ""),  # Part of speech
        "url": word_url,
        "fetchedAt": int(datetime.now().timestamp() * 1000),
        "usage": [],
        "collocations": [],
        "examples": [],
        "etymology": None,
        "synonyms": [],
        "definitions": [],
        "corpus_stats": {},
        "frequency_data": None,
    }
    
    # Fetch corpus data for examples and statistics
    if include_corpus:
        try:
            # Fetch from kern corpus (high-quality, formal German)
            corpus_data = await fetch_dwds_corpus(word, corpus="kern", limit=10)
            if corpus_data:
                # Extract examples and stats
                examples, stats = extract_examples_from_corpus(corpus_data)
                result["examples"] = examples
                result["corpus_stats"]["kern"] = stats
            
            # Optionally fetch from public corpus (web/blogs, informal German)
            # This gives more examples but may be lower quality
            try:
                public_corpus_data = await fetch_dwds_corpus(word, corpus="public", limit=5)
                if public_corpus_data:
                    public_examples, public_stats = extract_examples_from_corpus(public_corpus_data)
                    # Merge public examples (limit to avoid too many)
                    result["examples"].extend(public_examples[:5])
                    result["corpus_stats"]["public"] = public_stats
            except Exception as e:
                logger.debug(f"Failed to fetch public corpus data for '{word}': {e}")
                
        except Exception as e:
            logger.warning(f"Failed to fetch corpus data for '{word}': {e}")
            # Continue without corpus data
    
    # Fetch frequency data (word frequency over time)
    if include_frequency:
        try:
            frequency_data = await fetch_dwds_frequency(word)
            if frequency_data:
                result["frequency_data"] = frequency_data
        except Exception as e:
            logger.debug(f"Failed to fetch frequency data for '{word}': {e}")
            # Frequency data is optional, continue without it
    
    return result
