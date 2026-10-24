"""FastAPI application entry point for WindWise Renewable Forecast Intelligence."""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.core.config import settings
from backend.app.api.v1.endpoints import router as api_v1_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("windwise")

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    description="Wind Forecast Accuracy & Day-Ahead Procurement Support for UK Electricity Wholesale Trading.",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routes under /api/v1 and alias /api for convenience
app.include_router(api_v1_router, prefix="/api/v1", tags=["WindWise V1"])
app.include_router(api_v1_router, prefix="/api", tags=["WindWise Direct"])


@app.get("/")
def root():
    return {
        "service": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "docs": "/docs",
        "health": "/api/v1/health",
        "allowedWindow": f"{settings.ANALYSIS_WINDOW_START} to {settings.ANALYSIS_WINDOW_END}",
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=8000, reload=True)
