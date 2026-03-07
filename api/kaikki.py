"""Kaikki.org fetching and parsing logic"""
import json
import logging
from typing import List, Optional, Dict, Any
from datetime import datetime
import httpx
from .config import config
from .models import Entry, Sense, Form, Sound, KaikkiResponse

logger = logging.getLogger(__name__)


def build_kaikki_url(word: str, lang: str = "de") -> str:
    """
    Build kaikki.org JSONL URL for a word.
    
    Format: https://kaikki.org/dictionary/{Language}/meaning/{first}/{first2}/{word}.jsonl
    
    Args:
        word: The word to fetch (case-sensitive)
        lang: Language code (default: "de" for German)
    
    Returns:
        URL string
    """
    if not word:
        raise ValueError("Word cannot be empty")
    
    # Extract first letter and first two letters
    first = word[0] if word else ""
    first2 = word[:2] if len(word) >= 2 else first
    
    # Map language code to full name
    lang_map = {
        "de": "German",
        "en": "English",
        "fr": "French",
        "es": "Spanish",
    }
    lang_name = lang_map.get(lang, lang.capitalize())
    
    return f"{config.KAIKKI_BASE_URL}/{lang_name}/meaning/{first}/{first2}/{word}.jsonl"


async def fetch_kaikki_jsonl(word: str, lang: str = "de") -> Optional[str]:
    """
    Fetch JSONL data from kaikki.org.
    
    Args:
        word: The word to fetch
        lang: Language code
    
    Returns:
        JSONL text content or None if not found/error
    """
    url = build_kaikki_url(word, lang)
    logger.info(f"Fetching from kaikki.org: {url}")
    
    try:
        async with httpx.AsyncClient(timeout=config.KAIKKI_TIMEOUT) as client:
            response = await client.get(url, follow_redirects=True)
            
            if response.status_code == 404:
                logger.info(f"Word '{word}' not found in kaikki.org (404)")
                return None
            
            response.raise_for_status()
            return response.text
            
    except httpx.TimeoutException:
        logger.error(f"Timeout fetching '{word}' from kaikki.org")
        raise
    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching '{word}': {e.response.status_code}")
        raise
    except Exception as e:
        logger.error(f"Error fetching '{word}' from kaikki.org: {e}")
        raise


def parse_jsonl_line(line: str) -> Optional[Dict[str, Any]]:
    """
    Parse a single JSONL line into a Python dict.
    
    Args:
        line: Single line from JSONL file
    
    Returns:
        Parsed JSON object or None if invalid
    """
    line = line.strip()
    if not line:
        return None
    
    try:
        return json.loads(line)
    except json.JSONDecodeError as e:
        logger.warning(f"Failed to parse JSONL line: {e}")
        return None


def transform_kaikki_entry(raw_entry: Dict[str, Any]) -> Entry:
    """
    Transform a raw kaikki.org JSON entry into our Entry model.
    
    Args:
        raw_entry: Raw JSON object from kaikki.org
    
    Returns:
        Transformed Entry object
    """
    # Extract senses
    senses = []
    for sense_data in raw_entry.get("senses", []):
        sense = Sense(
            glosses=sense_data.get("glosses", []),
            raw_glosses=sense_data.get("raw_glosses", []),
            tags=sense_data.get("tags", []),
            links=sense_data.get("links", []),
            synonyms=[
                s.get("word") if isinstance(s, dict) else s
                for s in sense_data.get("synonyms", [])
            ],
        )
        senses.append(sense)
    
    # Extract forms
    forms = []
    for form_data in raw_entry.get("forms", []):
        form = Form(
            form=form_data.get("form", ""),
            tags=form_data.get("tags", []),
        )
        forms.append(form)
    
    # Extract sounds
    sounds = []
    for sound_data in raw_entry.get("sounds", []):
        sound = Sound(
            ipa=sound_data.get("ipa"),
            ogg_url=sound_data.get("ogg_url"),
            mp3_url=sound_data.get("mp3_url"),
        )
        sounds.append(sound)
    
    return Entry(
        word=raw_entry.get("word", ""),
        pos=raw_entry.get("pos", ""),
        etymology_number=raw_entry.get("etymology_number"),
        senses=senses,
        forms=forms,
        etymology_text=raw_entry.get("etymology_text"),
        sounds=sounds,
    )


def parse_and_transform_jsonl(jsonl_text: str, word: str) -> KaikkiResponse:
    """
    Parse JSONL text and transform into PWA-compatible format.
    
    Args:
        jsonl_text: Full JSONL file content
        word: The word being processed (for validation)
    
    Returns:
        KaikkiResponse object ready for API response
    """
    # Parse all lines
    entries = []
    for line in jsonl_text.strip().split("\n"):
        raw_entry = parse_jsonl_line(line)
        if raw_entry:
            entry = transform_kaikki_entry(raw_entry)
            entries.append(entry)
    
    if not entries:
        raise ValueError(f"No valid entries found for word '{word}'")
    
    # Flatten senses from all entries
    all_senses = []
    for entry in entries:
        all_senses.extend(entry.senses)
    
    # Flatten and deduplicate forms
    all_forms = []
    seen_forms = set()
    for entry in entries:
        for form in entry.forms:
            if form.form not in seen_forms:
                all_forms.append(form)
                seen_forms.add(form.form)
    
    # Combine etymology texts
    etymology_texts = [
        entry.etymology_text
        for entry in entries
        if entry.etymology_text
    ]
    etymology = "; ".join(etymology_texts) if etymology_texts else None
    
    # Extract IPA pronunciations
    ipa_list = []
    seen_ipa = set()
    for entry in entries:
        for sound in entry.sounds:
            if sound.ipa and sound.ipa not in seen_ipa:
                ipa_list.append(sound.ipa)
                seen_ipa.add(sound.ipa)
    
    # Extract audio URLs
    audio_list = []
    seen_audio = set()
    for entry in entries:
        for sound in entry.sounds:
            for url in [sound.ogg_url, sound.mp3_url]:
                if url and url not in seen_audio:
                    audio_list.append(url)
                    seen_audio.add(url)
    
    # Get current timestamp in milliseconds
    fetched_at = int(datetime.now().timestamp() * 1000)
    
    return KaikkiResponse(
        word=word,
        fetchedAt=fetched_at,
        entries=entries,
        allSenses=all_senses,
        allForms=all_forms,
        etymology=etymology,
        ipa=ipa_list,
        audio=audio_list,
    )


async def fetch_and_process_word(word: str, lang: str = "de") -> Optional[KaikkiResponse]:
    """
    Main function: fetch from kaikki.org and process into response format.
    
    Args:
        word: German word to fetch
        lang: Language code
    
    Returns:
        KaikkiResponse or None if word not found
    """
    jsonl_text = await fetch_kaikki_jsonl(word, lang)
    if jsonl_text is None:
        return None
    
    return parse_and_transform_jsonl(jsonl_text, word)
