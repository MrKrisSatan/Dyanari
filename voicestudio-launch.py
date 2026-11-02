"""Start the pinned service after serialising its heavy lazy imports.

VoiceStudio starts background preload workers; resolving these modules first
avoids concurrent transformers lazy-import discovery during the first request.
No upstream source is modified.
"""
import os
import runpy
import sys

source = os.path.abspath(sys.argv[1])
entry = os.path.join(source, "backend", "main.py")
sys.path[:0] = [source, os.path.join(source, "backend")]
os.environ.setdefault("TORCH_COMPILE_DISABLE", "1")
os.environ.setdefault("TORCHDYNAMO_DISABLE", "1")
from transformers import AutoFeatureExtractor, AutoTokenizer, AutoModel  # noqa: E402,F401
from omnivoice.models.omnivoice import OmniVoice  # noqa: E402,F401

sys.argv = [entry]
runpy.run_path(entry, run_name="__main__")
