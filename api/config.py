"""Configuration for Kaikki API"""
import os
from typing import Optional

class Config:
    """Application configuration"""
    
    # API Server
    HOST: str = os.getenv("KAIKKI_API_HOST", "0.0.0.0")
    PORT: int = int(os.getenv("KAIKKI_API_PORT", "8000"))
    
    # Caching
    CACHE_TTL: int = int(os.getenv("KAIKKI_CACHE_TTL", "86400"))  # 24 hours
    CACHE_MAX_SIZE: int = int(os.getenv("KAIKKI_CACHE_MAX_SIZE", "10000"))
    USE_REDIS: bool = os.getenv("KAIKKI_USE_REDIS", "false").lower() == "true"
    REDIS_URL: Optional[str] = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    
    # Rate Limiting
    RATE_LIMIT_PER_MINUTE: int = int(os.getenv("KAIKKI_RATE_LIMIT_PER_MINUTE", "100"))
    
    # kaikki.org
    KAIKKI_BASE_URL: str = os.getenv("KAIKKI_BASE_URL", "https://kaikki.org/dictionary")
    KAIKKI_TIMEOUT: int = int(os.getenv("KAIKKI_TIMEOUT", "5"))  # seconds
    KAIKKI_MAX_RETRIES: int = int(os.getenv("KAIKKI_MAX_RETRIES", "2"))
    
    # Logging
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO")

config = Config()
