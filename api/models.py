"""Pydantic models for API requests and responses"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime


class Sense(BaseModel):
    """A single sense/definition"""
    glosses: List[str] = Field(default_factory=list)
    raw_glosses: List[str] = Field(default_factory=list)
    tags: List[str] = Field(default_factory=list)
    links: List[Any] = Field(default_factory=list)
    synonyms: List[str] = Field(default_factory=list)


class Form(BaseModel):
    """Word form/inflection"""
    form: str
    tags: Optional[List[str]] = Field(default_factory=list)


class Sound(BaseModel):
    """Pronunciation sound"""
    ipa: Optional[str] = None
    ogg_url: Optional[str] = None
    mp3_url: Optional[str] = None


class Entry(BaseModel):
    """A single entry from kaikki.org (one etymology/PoS variant)"""
    word: str
    pos: str = ""
    etymology_number: Optional[int] = None
    senses: List[Sense] = Field(default_factory=list)
    forms: List[Form] = Field(default_factory=list)
    etymology_text: Optional[str] = None
    sounds: List[Sound] = Field(default_factory=list)


class KaikkiResponse(BaseModel):
    """Response format matching PWA expectations"""
    word: str
    fetchedAt: int  # Unix timestamp in milliseconds
    entries: List[Entry] = Field(default_factory=list)
    allSenses: List[Sense] = Field(default_factory=list)
    allForms: List[Form] = Field(default_factory=list)
    etymology: Optional[str] = None
    ipa: List[str] = Field(default_factory=list)
    audio: List[str] = Field(default_factory=list)


class ErrorResponse(BaseModel):
    """Error response format"""
    error: str
    message: str
    word: Optional[str] = None
    retry_after: Optional[int] = None
