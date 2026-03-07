"""In-memory caching with TTL"""
import time
import logging
from typing import Optional, Dict, Any
from collections import OrderedDict
from .models import KaikkiResponse
from .config import config

logger = logging.getLogger(__name__)


class TTLCache:
    """
    Simple in-memory cache with TTL and LRU eviction.
    
    Stores entries with expiration times. Automatically evicts expired
    entries and uses LRU eviction when cache size limit is reached.
    """
    
    def __init__(self, ttl_seconds: int, max_size: int = 10000):
        """
        Initialize cache.
        
        Args:
            ttl_seconds: Time-to-live in seconds
            max_size: Maximum number of entries before LRU eviction
        """
        self.ttl_seconds = ttl_seconds
        self.max_size = max_size
        self._cache: OrderedDict[str, Dict[str, Any]] = OrderedDict()
    
    def _is_expired(self, entry: Dict[str, Any]) -> bool:
        """Check if cache entry is expired"""
        expires_at = entry.get("expires_at", 0)
        return time.time() > expires_at
    
    def _cleanup_expired(self):
        """Remove expired entries"""
        expired_keys = [
            key for key, entry in self._cache.items()
            if self._is_expired(entry)
        ]
        for key in expired_keys:
            del self._cache[key]
            logger.debug(f"Evicted expired entry: {key}")
    
    def get(self, key: str) -> Optional[KaikkiResponse]:
        """
        Get entry from cache.
        
        Args:
            key: Cache key (e.g., "de:Haus")
        
        Returns:
            Cached KaikkiResponse or None if not found/expired
        """
        self._cleanup_expired()
        
        if key not in self._cache:
            return None
        
        entry = self._cache[key]
        
        if self._is_expired(entry):
            del self._cache[key]
            logger.debug(f"Entry expired: {key}")
            return None
        
        # Move to end (most recently used)
        self._cache.move_to_end(key)
        
        return entry["data"]
    
    def set(self, key: str, value: KaikkiResponse):
        """
        Store entry in cache.
        
        Args:
            key: Cache key
            value: KaikkiResponse to cache
        """
        self._cleanup_expired()
        
        # Evict oldest if at max size
        if len(self._cache) >= self.max_size and key not in self._cache:
            # Remove oldest entry (first in OrderedDict)
            oldest_key = next(iter(self._cache))
            del self._cache[oldest_key]
            logger.debug(f"Evicted LRU entry: {oldest_key}")
        
        expires_at = time.time() + self.ttl_seconds
        
        self._cache[key] = {
            "data": value,
            "cached_at": time.time(),
            "expires_at": expires_at,
        }
        
        # Move to end (most recently used)
        self._cache.move_to_end(key)
        
        logger.debug(f"Cached entry: {key} (expires in {self.ttl_seconds}s)")
    
    def clear(self):
        """Clear all cache entries"""
        self._cache.clear()
        logger.info("Cache cleared")
    
    def stats(self) -> Dict[str, Any]:
        """Get cache statistics"""
        self._cleanup_expired()
        return {
            "size": len(self._cache),
            "max_size": self.max_size,
            "ttl_seconds": self.ttl_seconds,
        }


# Global cache instance
_cache: Optional[TTLCache] = None


def get_cache() -> TTLCache:
    """Get or create global cache instance"""
    global _cache
    if _cache is None:
        _cache = TTLCache(
            ttl_seconds=config.CACHE_TTL,
            max_size=config.CACHE_MAX_SIZE,
        )
    return _cache
