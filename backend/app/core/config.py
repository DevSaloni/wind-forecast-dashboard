"""Configuration settings for WindWise Renewable Forecast Intelligence API."""
import os
from pydantic import BaseModel


class Settings(BaseModel):
    PROJECT_NAME: str = "WindWise — Renewable Forecast Intelligence"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Elexon BMRS API Base URL
    ELEXON_API_BASE_URL: str = os.getenv(
        "ELEXON_API_BASE_URL", "https://data.elexon.co.uk/bmrs/api/v1"
    )
    
    # Standard UK Day-Ahead wholesale power market auction cutoff (EPEX SPOT / Nord Pool GB)
    # Market gate closure occurs at 11:00 UTC on day D-1.
    DEFAULT_CUTOFF_HOUR: int = 11
    DEFAULT_CUTOFF_MINUTE: int = 0
    TIMEZONE: str = "UTC"
    
    # Analysis restriction window (January 2026 as specified)
    ANALYSIS_WINDOW_START: str = "2026-01-01"
    ANALYSIS_WINDOW_END: str = "2026-01-31"
    
    # HTTP client configuration
    REQUEST_TIMEOUT_SECONDS: float = 20.0
    MAX_RETRIES: int = 3
    CACHE_TTL_SECONDS: int = 3600  # 1 hour in-memory cache
    
    # CORS origins
    ALLOWED_ORIGINS: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "*",  # Allow dev preview iframes
    ]


settings = Settings()
