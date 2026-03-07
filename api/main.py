"""FastAPI application for Kaikki.org enrichment API"""
import logging
from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .config import config
from .models import KaikkiResponse, ErrorResponse
from .kaikki import fetch_and_process_word
from .cache import get_cache

# Configure logging
logging.basicConfig(
    level=getattr(logging, config.LOG_LEVEL),
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Create FastAPI app
app = FastAPI(
    title="Kaikki Enrichment API",
    description="API for fetching and processing kaikki.org dictionary data",
    version="1.0.0",
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["*"],
)

# Rate limiting
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

# Make limiter available globally for decorator
@app.middleware("http")
async def add_limiter_to_request(request: Request, call_next):
    request.state.limiter = limiter
    response = await call_next(request)
    return response


@app.get("/")
async def root():
    """Root endpoint"""
    return {
        "service": "Kaikki Enrichment API",
        "version": "1.0.0",
        "endpoints": {
            "kaikki": "/api/kaikki/{word}",
            "health": "/api/health",
        },
    }


@app.get("/api/health")
async def health():
    """Health check endpoint"""
    cache = get_cache()
    stats = cache.stats()
    return {
        "status": "healthy",
        "cache": stats,
    }


@app.get(
    "/api/kaikki/{word}",
    response_model=KaikkiResponse,
    responses={
        404: {"model": ErrorResponse, "description": "Word not found"},
        429: {"model": ErrorResponse, "description": "Rate limit exceeded"},
        500: {"model": ErrorResponse, "description": "Internal server error"},
    },
)
@limiter.limit(f"{config.RATE_LIMIT_PER_MINUTE}/minute")
async def get_kaikki_data(
    request: Request,
    word: str,
    lang: str = Query(default="de", description="Language code (default: de for German)"),
):
    """
    Fetch and process kaikki.org data for a word.
    
    Args:
        word: German word (case-sensitive, e.g., "Haus", "Schule")
        lang: Language code (default: "de")
    
    Returns:
        KaikkiResponse with processed data
    """
    # Validate input
    if not word or not word.strip():
        raise HTTPException(
            status_code=400,
            detail=ErrorResponse(
                error="invalid_word",
                message="Word cannot be empty",
                word=word,
            ).dict(),
        )
    
    word = word.strip()
    cache_key = f"{lang}:{word}"
    cache = get_cache()
    
    # Check cache first
    cached_response = cache.get(cache_key)
    if cached_response:
        logger.info(f"Cache hit: {word}")
        return cached_response
    
    logger.info(f"Cache miss: {word}, fetching from kaikki.org")
    
    try:
        # Fetch and process
        response = await fetch_and_process_word(word, lang)
        
        if response is None:
            raise HTTPException(
                status_code=404,
                detail=ErrorResponse(
                    error="word_not_found",
                    message=f"Word '{word}' not found in kaikki.org",
                    word=word,
                ).dict(),
            )
        
        # Cache the response
        cache.set(cache_key, response)
        
        return response
        
    except HTTPException:
        # Re-raise HTTP exceptions (404, etc.)
        raise
    except Exception as e:
        logger.error(f"Error processing word '{word}': {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=ErrorResponse(
                error="internal_error",
                message=f"Failed to process word: {str(e)}",
                word=word,
            ).dict(),
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "api.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=True,  # Auto-reload in development
    )
