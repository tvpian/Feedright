"""pytest configuration — add packages/ to sys.path so nutrition_core is importable."""
import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
