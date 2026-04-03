"""Shared test configuration for nmas tests."""
import sys
from pathlib import Path

# Ensure backend directory is on path so 'nmas' is importable
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
