import sys
import os

# Ensure backend/ is on the path so imports work
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from hypothesis import settings

settings.register_profile("ci", max_examples=100)
settings.load_profile("ci")
