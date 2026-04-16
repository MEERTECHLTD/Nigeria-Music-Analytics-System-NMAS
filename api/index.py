"""Vercel serverless entry point for NMAS FastAPI backend."""
import sys
from pathlib import Path

# Add backend to Python path so nmas package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from nmas.application import create_app  # noqa: E402

app = create_app()
