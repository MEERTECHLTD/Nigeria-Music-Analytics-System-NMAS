"""Entry point for the NMAS NBS Delivery Platform.

Usage:
    python run_nmas.py
    uvicorn nmas.application:app --host 0.0.0.0 --port 8000
"""
from __future__ import annotations

import uvicorn

from nmas.application import create_app
from nmas.config import get_settings

app = create_app()

if __name__ == "__main__":
    settings = get_settings()
    uvicorn.run(
        "run_nmas:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level=settings.log_level.lower(),
    )
