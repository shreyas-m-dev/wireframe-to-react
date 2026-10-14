import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from provider import analyze
from validation import validate_vision_schema
from merge_with_cv import merge
from provider import resolve_api_key, key_audit
from provider import _classify_http_error
import provider as provider_module
from provider import normalize_gemini_model, discover_gemini_models
import os
from io import BytesIO
from urllib.error import HTTPError

assert analyze("ignored.png")["used"] is False
valid = {"pageCategory": "generic", "nodes": [{"id": "main", "type": "region", "role": "section", "confidence": .9, "bounds": {"x": 0, "y": 0, "width": 1, "height": 1}, "children": []}]}
assert validate_vision_schema(valid) is valid
try:
    validate_vision_schema({"pageCategory": "x", "nodes": [{"id": "bad", "type": "region", "role": "x", "bounds": {"x": 0, "y": 0, "width": 2, "height": 1}}]})
    raise AssertionError("invalid bounds accepted")
except ValueError: pass
merged, report = merge([], valid, {"width": 100, "height": 100})
assert len(merged) == 1 and report["used"] and report["schemaSource"] == "vision-merged"
old_vision, old_openai, old_gemini = os.environ.get("VISION_API_KEY"), os.environ.get("OPENAI_API_KEY"), os.environ.get("GEMINI_API_KEY")
os.environ["VISION_API_KEY"] = "  'vision-test-key'  "; os.environ["OPENAI_API_KEY"] = "openai-test-key"
assert resolve_api_key() == ("vision-test-key", "VISION_API_KEY") and key_audit()["length"] == len("vision-test-key")
os.environ.pop("VISION_API_KEY"); assert resolve_api_key() == ("openai-test-key", "OPENAI_API_KEY")
os.environ["GEMINI_API_KEY"] = "gemini-test-key"; assert resolve_api_key("gemini") == ("gemini-test-key", "GEMINI_API_KEY")
if old_vision is not None: os.environ["VISION_API_KEY"] = old_vision
if old_openai is not None: os.environ["OPENAI_API_KEY"] = old_openai
else: os.environ.pop("OPENAI_API_KEY", None)
if old_gemini is not None: os.environ["GEMINI_API_KEY"] = old_gemini
else: os.environ.pop("GEMINI_API_KEY", None)
quota = HTTPError("https://example.test", 429, "Too Many Requests", {"Retry-After": "2"}, BytesIO(b'{"error":{"type":"insufficient_quota","code":"insufficient_quota"}}'))
rate = HTTPError("https://example.test", 429, "Too Many Requests", {"Retry-After": "2"}, BytesIO(b'{"error":{"type":"rate_limit_exceeded"}}'))
quota_report, rate_report = _classify_http_error(quota), _classify_http_error(rate)
assert quota_report["category"] == "insufficient-quota" and not quota_report["retryable"]
assert rate_report["category"] == "rate-limit" and rate_report["retryable"]
assert normalize_gemini_model("models/gemini-test") == "gemini-test" and normalize_gemini_model("gemini-test") == "gemini-test"
saved_provider, saved_enabled, saved_key, saved_request = os.environ.get("VISION_PROVIDER"), os.environ.get("VISION_ENABLED"), os.environ.get("GEMINI_API_KEY"), provider_module._gemini_models_request
os.environ.update({"VISION_PROVIDER": "gemini", "VISION_ENABLED": "true", "GEMINI_API_KEY": "gemini-test-key"})
provider_module._gemini_models_request = lambda _config: {"models": [{"name": "models/text-only", "supportedGenerationMethods": ["generateContent"]}, {"name": "models/gemini-live-audio", "supportedGenerationMethods": ["generateContent"]}, {"name": "models/gemini-valid", "displayName": "Valid", "supportedGenerationMethods": ["generateContent"]}]}
models = discover_gemini_models(); assert models["requestSucceeded"] and models["recommendedModel"] == "models/gemini-valid" and len(models["models"]) == 1
provider_module._gemini_models_request = saved_request
for name, value in (("VISION_PROVIDER", saved_provider), ("VISION_ENABLED", saved_enabled), ("GEMINI_API_KEY", saved_key)):
    if value is None: os.environ.pop(name, None)
    else: os.environ[name] = value
print("PASS: vision disabled mode, validation, and conservative merge")
