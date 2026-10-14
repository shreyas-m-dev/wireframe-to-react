"""Provider-agnostic structured layout analysis contract.

Disabled mode is deliberately the default: local CV/OCR remains fully
functional and no image or secret leaves the machine. Cloud providers are an
opt-in future integration and must return schema JSON, never executable JSX.
"""
from __future__ import annotations
import base64
import json
import os
import urllib.error
import urllib.request
import hashlib
from pathlib import Path
from schema_prompt import SYSTEM_PROMPT, GEMINI_SYSTEM_PROMPT, parse_json_content, user_prompt
from validation import validate_vision_schema

class ProviderRequestError(RuntimeError):
    def __init__(self, message: str, meta: dict): super().__init__(message); self.meta = meta

def resolve_api_key(provider: str | None = None) -> tuple[str | None, str]:
    """Return a normalized key and source without ever exposing its value."""
    sources = ("VISION_API_KEY", "GEMINI_API_KEY") if provider == "gemini" else ("VISION_API_KEY", "OPENAI_API_KEY")
    for source in sources:
        value = os.getenv(source, "").strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}: value = value[1:-1].strip()
        if value: return value, source
    return None, "none"

def key_audit(provider: str | None = None) -> dict:
    key, source = resolve_api_key(provider)
    return {"configured": bool(key), "source": source, "length": len(key or ""), "fingerprint": f"sha256:{hashlib.sha256((key or '').encode()).hexdigest()[:12]}" if key else None}


def status() -> dict:
    provider = os.getenv("VISION_PROVIDER", "disabled").lower()
    enabled = os.getenv("VISION_ENABLED", "false").lower() == "true"
    audit = key_audit(provider)
    configured = enabled and provider in {"openai", "anthropic", "gemini"} and audit["configured"]
    return {"provider": provider, "enabled": enabled, "configured": configured, "model": os.getenv("VISION_MODEL") or None, "timeoutSeconds": int(os.getenv("VISION_TIMEOUT_SECONDS", "20")), "maxImageDimension": int(os.getenv("VISION_MAX_IMAGE_DIMENSION", "1024")), "keyPresent": audit["configured"], "keySource": audit["source"]}

def _classify_http_error(exc: urllib.error.HTTPError) -> dict:
    error_type = error_code = ""
    adapter_report = {}
    try:
        body = json.loads(exc.read().decode("utf-8", errors="replace")); error = body.get("error", {})
        error_type, error_code = str(error.get("type") or ""), str(error.get("code") or "")
    except Exception: pass
    token = f"{error_type} {error_code}".lower(); retry_after = exc.headers.get("Retry-After")
    category = "provider-error"; retryable = False
    if exc.code == 429:
        if "insufficient" in token or "quota" in token: category = "insufficient-quota"
        elif "rate" in token: category, retryable = "rate-limit", bool(retry_after and retry_after.isdigit() and int(retry_after) <= 3)
        elif "large" in token or "length" in token: category = "request-too-large"
        else: category = "unknown-429"
    elif exc.code in {401, 403}: category = "authentication-or-model-access"
    elif exc.code == 400: category = "request-format"
    return {"httpStatus": exc.code, "category": category, "retryable": retryable, "retryAfterSeconds": int(retry_after) if retry_after and retry_after.isdigit() else None, "safeCode": error_code or None, "safeMessage": f"provider HTTP {exc.code} ({category})"}

def _post(url: str, payload: dict, headers: dict, timeout: int) -> dict:
    request = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", **headers}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response: return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        meta = _classify_http_error(exc)
        raise ProviderRequestError(meta["safeMessage"], meta) from exc
    except urllib.error.URLError as exc:
        raise ProviderRequestError("provider network error", {"httpStatus": None, "category": "network-error", "retryable": False, "safeCode": type(exc.reason).__name__.lower(), "safeMessage": "provider network error"}) from exc
    except TimeoutError as exc:
        raise ProviderRequestError("provider timeout", {"httpStatus": None, "category": "timeout", "retryable": False, "safeCode": None, "safeMessage": "provider timeout"}) from exc

def _image(path: str | Path, max_dimension: int) -> tuple[str, str]:
    raw = Path(path).read_bytes(); suffix = Path(path).suffix.lower(); mime = "image/png" if suffix == ".png" else "image/webp" if suffix == ".webp" else "image/jpeg"
    try:
        import cv2
        image = cv2.imread(str(path))
        if image is not None and max(image.shape[:2]) > max_dimension:
            scale = max_dimension / max(image.shape[:2]); image = cv2.resize(image, (round(image.shape[1] * scale), round(image.shape[0] * scale)), interpolation=cv2.INTER_AREA)
            ok, encoded = cv2.imencode(".png" if mime == "image/png" else ".jpg", image)
            if ok: raw = encoded.tobytes()
    except Exception:
        pass
    return mime, base64.b64encode(raw).decode("ascii")

def _call_openai(image_path: str | Path, instructions: str, config: dict) -> dict:
    mime, data = _image(image_path, config["maxImageDimension"]); model = config["model"] or "gpt-4.1-mini"
    payload = {"model": model, "temperature": 0, "max_tokens": int(os.getenv("VISION_MAX_OUTPUT_TOKENS", "3000")), "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": SYSTEM_PROMPT}, {"role": "user", "content": [{"type": "text", "text": user_prompt(instructions)}, {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{data}"}}]}]}
    key, _ = resolve_api_key("openai")
    reply = _post("https://api.openai.com/v1/chat/completions", payload, {"Authorization": f"Bearer {key}"}, config["timeoutSeconds"])
    return parse_json_content(reply["choices"][0]["message"]["content"])

def _call_anthropic(image_path: str | Path, instructions: str, config: dict) -> dict:
    mime, data = _image(image_path, config["maxImageDimension"]); model = config["model"] or "claude-3-5-haiku-latest"
    payload = {"model": model, "max_tokens": int(os.getenv("VISION_MAX_OUTPUT_TOKENS", "6000")), "temperature": 0, "system": SYSTEM_PROMPT, "messages": [{"role": "user", "content": [{"type": "image", "source": {"type": "base64", "media_type": mime, "data": data}}, {"type": "text", "text": user_prompt(instructions)}]}]}
    key, _ = resolve_api_key("anthropic")
    reply = _post("https://api.anthropic.com/v1/messages", payload, {"x-api-key": key, "anthropic-version": "2023-06-01"}, config["timeoutSeconds"])
    return parse_json_content("".join(block.get("text", "") for block in reply.get("content", []) if block.get("type") == "text"))

def _classify_gemini_error(exc: urllib.error.HTTPError) -> dict:
    code = status = ""
    try:
        body = json.loads(exc.read().decode("utf-8", errors="replace")); error = body.get("error", {}); code, status = str(error.get("code") or ""), str(error.get("status") or "")
    except Exception: pass
    token = f"{code} {status}".lower()
    category = "provider-error"
    if exc.code == 404: category = "model-not-found"
    elif exc.code == 401: category = "authentication"
    elif exc.code == 403: category = "permission"
    elif exc.code == 429: category = "rate-limit"
    elif exc.code == 400: category = "invalid-request"
    elif "model" in token: category = "invalid-model"
    elif "image" in token or "size" in token: category = "image-too-large"
    return {"httpStatus": exc.code, "category": category, "retryable": False, "safeCode": status or code or None, "safeMessage": f"Gemini HTTP {exc.code} ({category})"}

def normalize_gemini_model(model: str) -> str:
    """Env accepts `gemini-x` or `models/gemini-x`; REST path gets one prefix."""
    return str(model or "").strip().removeprefix("models/")

def _gemini_models_request(config: dict) -> dict:
    key, _ = resolve_api_key("gemini")
    request = urllib.request.Request("https://generativelanguage.googleapis.com/v1beta/models", headers={"x-goog-api-key": key}, method="GET")
    try:
        with urllib.request.urlopen(request, timeout=config["timeoutSeconds"]) as response: return json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        meta = _classify_gemini_error(exc); raise ProviderRequestError(meta["safeMessage"], meta) from exc
    except urllib.error.URLError as exc:
        raise ProviderRequestError("Gemini network error", {"httpStatus": None, "category": "network-error", "retryable": False, "safeCode": type(exc.reason).__name__.lower(), "safeMessage": "Gemini network error"}) from exc

def discover_gemini_models() -> dict:
    config = status(); base = {"provider": "gemini", "keyConfigured": config["keyPresent"], "requestSucceeded": False, "httpStatus": None, "models": [], "recommendedModel": None, "safeErrorCategory": None, "safeErrorCode": None, "safeErrorMessage": None}
    if config["provider"] != "gemini": return {**base, "safeErrorCategory": "disabled", "safeErrorMessage": "VISION_PROVIDER is not gemini"}
    if not config["keyPresent"]: return {**base, "safeErrorCategory": "disabled", "safeErrorMessage": "Gemini key is not configured"}
    try:
        payload = _gemini_models_request(config); result = []
        for item in payload.get("models", []):
            name, methods = str(item.get("name") or ""), item.get("supportedGenerationMethods") or []
            supports_generate = "generateContent" in methods
            # ListModels does not consistently emit modalities. Only make a
            # cautious documented-family inference after the API listed it.
            is_multimodal_family = name.startswith("models/gemini-") and "image" not in name.lower() and "embedding" not in name.lower() and "audio" not in name.lower()
            if not supports_generate or not is_multimodal_family: continue
            result.append({"name": name, "displayName": item.get("displayName") or name, "supportedGenerationMethods": methods, "inputModalities": ["TEXT", "IMAGE"], "outputModalities": ["TEXT"], "supportsImageInput": True, "supportsGenerateContent": True, "capabilitySource": "listed-generateContent+gemini-multimodal-family-inference"})
        preferred = next((x["name"] for x in result if normalize_gemini_model(x["name"]) == normalize_gemini_model(config["model"])), None)
        return {**base, "requestSucceeded": True, "httpStatus": 200, "models": result, "recommendedModel": preferred or (result[0]["name"] if result else None)}
    except ProviderRequestError as exc:
        meta = exc.meta; return {**base, "httpStatus": meta["httpStatus"], "safeErrorCategory": meta["category"], "safeErrorCode": meta["safeCode"], "safeErrorMessage": meta["safeMessage"]}

def _selected_gemini_model(config: dict) -> str:
    configured = normalize_gemini_model(config["model"])
    if os.getenv("VISION_GEMINI_AUTO_SELECT_MODEL", "false").lower() != "true": return configured
    discovered = discover_gemini_models(); selected = discovered.get("recommendedModel")
    return normalize_gemini_model(selected) if selected else configured

def _gemini_request(mime: str, data: str, instructions: str, config: dict, minimal: bool = False) -> tuple[dict, dict]:
    model = _selected_gemini_model(config); key, _ = resolve_api_key("gemini")
    prompt = "Return JSON only. Inspect this simple UI image. page_type must be exactly generic. sections must be a non-empty array containing exactly one section: id section-1, kind generic, bounds [0,0,1,1], layout column, columns 1, and a non-empty items array with a heading, button, and media item. Use normalized bounds. No Markdown or prose." if minimal else user_prompt(instructions)
    system = "Return JSON only with exactly one generic section and heading, button, media items." if minimal else GEMINI_SYSTEM_PROMPT
    generation = {"temperature": 0, "maxOutputTokens": min(int(os.getenv("VISION_MAX_OUTPUT_TOKENS", "4000")), 4000), "responseMimeType": "application/json"}
    schema_requested = False
    if minimal:
        generation["responseSchema"] = {"type": "OBJECT", "required": ["page_type", "sections"], "properties": {"page_type": {"type": "STRING", "enum": ["generic"]}, "sections": {"type": "ARRAY", "minItems": 1, "maxItems": 3, "items": {"type": "OBJECT", "required": ["id", "kind", "bounds", "layout", "columns", "items", "confidence"], "properties": {"id": {"type": "STRING"}, "kind": {"type": "STRING", "enum": ["generic"]}, "bounds": {"type": "ARRAY", "minItems": 4, "maxItems": 4, "items": {"type": "NUMBER"}}, "layout": {"type": "STRING", "enum": ["column"]}, "columns": {"type": "INTEGER"}, "items": {"type": "ARRAY", "minItems": 1, "maxItems": 10, "items": {"type": "OBJECT", "required": ["id", "kind", "bounds", "confidence"], "properties": {"id": {"type": "STRING"}, "kind": {"type": "STRING", "enum": ["heading", "button", "media"]}, "bounds": {"type": "ARRAY", "minItems": 4, "maxItems": 4, "items": {"type": "NUMBER"}}, "confidence": {"type": "NUMBER"}}}}, "confidence": {"type": "NUMBER"}}}}}}
        schema_requested = True
    payload = {"systemInstruction": {"parts": [{"text": system}]}, "contents": [{"role": "user", "parts": [{"text": prompt}, {"inlineData": {"mimeType": mime, "data": data}}]}], "generationConfig": generation}
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    request = urllib.request.Request(url, data=json.dumps(payload).encode(), headers={"Content-Type": "application/json", "x-goog-api-key": key}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=config["timeoutSeconds"]) as response: reply = json.loads(response.read().decode())
    except urllib.error.HTTPError as exc:
        meta = _classify_gemini_error(exc); raise ProviderRequestError(meta["safeMessage"], meta) from exc
    except urllib.error.URLError as exc:
        raise ProviderRequestError("Gemini network error", {"httpStatus": None, "category": "network-error", "retryable": False, "safeCode": type(exc.reason).__name__.lower(), "safeMessage": "Gemini network error"}) from exc
    text = "".join(part.get("text", "") for candidate in reply.get("candidates", []) for part in candidate.get("content", {}).get("parts", []) if isinstance(part, dict))
    return parse_json_content(text), {"responseMimeTypeRequested": "application/json", "responseSchemaRequested": schema_requested, "responseSchemaNativeEnforcementSupported": schema_requested}

def _call_gemini(image_path: str | Path, instructions: str, config: dict) -> dict:
    mime, data = _image(image_path, config["maxImageDimension"])
    return _gemini_request(mime, data, instructions, config)[0]


def analyze(image_path: str | Path, instructions: str = "") -> dict:
    config = status()
    if not config["enabled"]: return {"used": False, "schema": None, "reason": "VISION_ENABLED is false; local CV/OCR used", "status": config}
    if config["provider"] in {"disabled", "local"}: return {"used": False, "schema": None, "reason": "no cloud provider selected; local CV/OCR used", "status": config}
    if not config["configured"]: return {"used": False, "schema": None, "reason": "vision provider key is not configured; local CV/OCR used", "status": config, "errorMeta": {"category": "disabled", "safeMessage": "vision provider key is not configured"}}
    try:
        payload = _call_openai(image_path, instructions, config) if config["provider"] == "openai" else _call_gemini(image_path, instructions, config) if config["provider"] == "gemini" else _call_anthropic(image_path, instructions, config)
        adapter_report = None
        if config["provider"] == "gemini":
            from gemini_schema_adapter import adapt_gemini_response
            payload, adapter_report = adapt_gemini_response(payload)
        return {"used": True, "schema": validate_vision_schema(payload), "reason": None, "status": config, "adapterReport": adapter_report}
    except ProviderRequestError as exc:
        return {"used": False, "schema": None, "reason": exc.meta["safeMessage"], "status": config, "errorMeta": exc.meta}
    except ValueError as exc:
        return {"used": False, "schema": None, "reason": "vision schema validation failed", "status": config, "errorMeta": {"httpStatus": 200, "category": "invalid-schema", "retryable": False, "safeCode": None, "safeMessage": "vision schema validation failed"}}
    except Exception:
        return {"used": False, "schema": None, "reason": "vision provider response could not be processed", "status": config, "errorMeta": {"httpStatus": None, "category": "provider-error", "retryable": False, "safeCode": None, "safeMessage": "vision provider response could not be processed"}}

def smoke_test() -> dict:
    """Explicit diagnostic only; sends a tiny generated image, never a user upload."""
    config = status(); base = {"provider": config["provider"], "model": config["model"], "keyConfigured": config["keyPresent"], "requestAttempted": False, "httpStatus": None, "status": "request-error", "schemaValid": None, "retryable": False, "safeErrorCategory": None, "safeErrorCode": None, "safeErrorMessage": None}
    if not config["configured"]:
        return {**base, "status": "request-error", "safeErrorCategory": "disabled", "safeErrorMessage": "vision provider is not configured"}
    # Generated, non-user UI image: page frame, heading, CTA and media box.
    import cv2, numpy as np
    canvas = np.full((160, 220, 3), 255, dtype=np.uint8); cv2.rectangle(canvas, (4, 4), (215, 155), (20, 20, 20), 2); cv2.rectangle(canvas, (20, 32), (140, 45), (20, 20, 20), -1); cv2.rectangle(canvas, (20, 62), (92, 88), (20, 20, 20), 2); cv2.rectangle(canvas, (112, 62), (196, 132), (20, 20, 20), 2)
    ok, encoded = cv2.imencode(".png", canvas); tiny = base64.b64encode(encoded.tobytes()).decode("ascii") if ok else ""
    adapter_report = {}
    try:
        if config["provider"] == "gemini":
            schema, request_summary = _gemini_request("image/png", tiny, "", config, minimal=True)
            from gemini_schema_adapter import adapt_gemini_response
            schema, adapter_report = adapt_gemini_response(schema)
        else:
            key, _ = resolve_api_key("openai"); payload = {"model": config["model"] or "gpt-4.1-mini", "temperature": 0, "max_tokens": 300, "response_format": {"type": "json_object"}, "messages": [{"role": "system", "content": "Return JSON only: pageCategory and one bounded neutral region node."}, {"role": "user", "content": [{"type": "text", "text": "Analyze this tiny test image."}, {"type": "image_url", "image_url": {"url": f"data:image/png;base64,{tiny}"}}]}]}; reply = _post("https://api.openai.com/v1/chat/completions", payload, {"Authorization": f"Bearer {key}"}, config["timeoutSeconds"]); schema = parse_json_content(reply["choices"][0]["message"]["content"])
        validate_vision_schema(schema)
        page_info = adapter_report.get("pageType", {}) if config["provider"] == "gemini" else {}
        return {**base, "requestAttempted": True, "httpStatus": 200, "status": "success", "rawPageType": page_info.get("originalPageType"), "normalizedPageType": page_info.get("normalizedPageType"), "pageTypeNormalizationApplied": bool(page_info and page_info.get("mappingReason") != "canonical"), "sectionsLength": adapter_report.get("sectionCount") if config["provider"] == "gemini" else None, "itemCount": adapter_report.get("itemCount") if config["provider"] == "gemini" else None, **(request_summary if config["provider"] == "gemini" else {}), "geminiResponseValid": config["provider"] == "gemini", "internalSchemaValid": True, "schemaValid": True, "schemaAdapterUsed": config["provider"] == "gemini"}
    except ProviderRequestError as exc:
        meta = exc.meta; label = "rate-limit" if meta["category"] == "rate-limit" else "quota" if meta["category"] == "insufficient-quota" else "model-error" if meta["category"] == "authentication-or-model-access" else "request-error"
        return {**base, "requestAttempted": True, "httpStatus": meta["httpStatus"], "status": label, "retryable": meta["retryable"], "safeErrorCategory": meta["category"], "safeErrorCode": meta["safeCode"], "safeErrorMessage": meta["safeMessage"]}
    except ValueError as exc:
        return {**base, "requestAttempted": True, "httpStatus": 200, "status": "request-error", "geminiResponseValid": False if config["provider"] == "gemini" else None, "internalSchemaValid": False, "schemaValid": False, "schemaAdapterUsed": config["provider"] == "gemini", "safeErrorCategory": "invalid-schema", "safeErrorMessage": str(exc)[:180]}


def accept_response(payload: dict) -> dict:
    """Validation seam for future provider adapters before merge/codegen."""
    validate_vision_schema(payload)
    return payload
