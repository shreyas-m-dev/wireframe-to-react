"""
Code generation module — Pipeline Step 5.

Prompts the LLM with the schema tree + retrieved templates (step 4) and
gets back raw React/JSX. Kept under version control deliberately per the
build order note ("you'll iterate on it more than any other single file")
— PROMPT_TEMPLATE below is the single source of truth for the prompt.

PROVIDER: defaults to Google AI Studio's Gemini API, which has a genuinely
free tier (no credit card required to generate a key, generous daily quota
on gemini-2.0-flash as of writing). No paid SDK needed — this calls the
REST endpoint directly with `requests`, which is already a dependency.

Get a free key: https://aistudio.google.com/apikey  ->  set GEMINI_API_KEY

An OpenRouter backend is also included (OPENROUTER_API_KEY) if you'd
rather use one of OpenRouter's free-tier models (e.g. models with a
":free" suffix) — set LLM_PROVIDER=openrouter to switch. Both paths go
through the same `generate_code()` interface, so nothing else in the
pipeline (scripts/cli_pipeline.py, the validation retry loop) needs to know which
provider is active.

Requires network at runtime — cannot be executed in this offline sandbox.
The prompt-formatting logic (`build_prompt`) is pure and unit-tested
without needing the API or network.
"""

from __future__ import annotations

import json
import os
from typing import Optional

import requests

# ---------------------------------------------------------------------------
# Provider config
# ---------------------------------------------------------------------------

GEMINI_MODEL = "gemini-2.0-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

# Any OpenRouter model works; pick a ":free" one to stay on the free tier,
# e.g. "meta-llama/llama-3.3-70b-instruct:free" or "google/gemini-2.0-flash-exp:free"
# — check https://openrouter.ai/models?max_price=0 for the current free list,
# since which models are free changes over time.
OPENROUTER_MODEL = os.environ.get("OPENROUTER_MODEL", "meta-llama/llama-3.3-70b-instruct:free")
OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

REQUEST_TIMEOUT_S = 60

PROMPT_TEMPLATE = """You are generating React/JSX code from a UI schema extracted from a wireframe image.

SCHEMA (nested JSON — type/bbox/children describe the detected layout):
{schema_json}

RETRIEVED TEMPLATES (similar patterns from a component library, ranked by relevance):
{templates_block}

RULES:
1. Build the page skeleton first (page/header/main/sections), then render
   nested groups and only then leaf controls. Preserve every macro region,
   repeated group, child count, bbox proportion, and layout direction.
2. Use ONLY the element types present in the schema. Do not invent additional
   UI elements (no decorative icons, no extra buttons, no elements with no
   corresponding schema node) — everything you output will be checked against
   the schema and anything not present will be stripped.
3. Preserve the schema's nesting exactly: a schema node's children must map to
   nested JSX elements inside that node's corresponding JSX element.
4. Use the retrieved templates as style/structure reference where they match a
   schema subtree, but adapt them — don't reproduce a template verbatim if it
   doesn't match the actual schema shape.
5. Never replace a full page with repeated buttons. A repeated button needs
   matching repeated-group evidence in the schema. Preserve image/gallery
   regions and use distinct semantic placeholders when OCR is absent.
6. Output ONLY the JSX for a single functional React component named
   GeneratedComponent. No explanation, no markdown fences, no imports beyond
   `import React from "react"`.
7. Use Tailwind utility classes for styling (matches the template library).

Output the component now.
"""


def build_prompt(schema: dict, templates: list[dict]) -> str:
    """
    Pure formatting function — no API call — so this is testable without
    network access.
    """
    templates_block = "\n\n".join(
        f"--- Template: {t['id']} (relevance {t['score']:.2f}) ---\n{t['code']}"
        for t in templates
    ) or "(no templates retrieved)"

    return PROMPT_TEMPLATE.format(
        schema_json=json.dumps(schema, indent=2),
        templates_block=templates_block,
    )


def _strip_markdown_fences(text: str) -> str:
    """LLMs (especially free/smaller ones) often wrap output in ```jsx
    fences despite being told not to — strip defensively rather than let a
    fence become CGDA's first "hallucinated tag" of the session."""
    text = text.strip()
    if text.startswith("```"):
        lines = text.split("\n")
        lines = lines[1:]  # drop opening fence (with optional language tag)
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    return text


def _call_gemini(prompt: str, api_key: str) -> str:
    resp = requests.post(
        f"{GEMINI_URL}?key={api_key}",
        json={
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.2, "maxOutputTokens": 4000},
        },
        timeout=REQUEST_TIMEOUT_S,
    )
    resp.raise_for_status()
    data = resp.json()
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected Gemini response shape: {data}") from e


def _call_openrouter(prompt: str, api_key: str) -> str:
    resp = requests.post(
        OPENROUTER_URL,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": OPENROUTER_MODEL,
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.2,
            "max_tokens": 4000,
        },
        timeout=REQUEST_TIMEOUT_S,
    )
    resp.raise_for_status()
    data = resp.json()
    try:
        return data["choices"][0]["message"]["content"]
    except (KeyError, IndexError) as e:
        raise RuntimeError(f"Unexpected OpenRouter response shape: {data}") from e


def generate_code(
    schema: dict,
    templates: list[dict],
    api_key: Optional[str] = None,
    extra_instructions: str = "",
    provider: Optional[str] = None,
) -> str:
    """
    Calls a free LLM provider with the formatted prompt. Requires network
    (not available in this sandbox) — see build_prompt() for the testable
    part.

    provider: "gemini" (default) or "openrouter", or set LLM_PROVIDER env var.
    api_key: falls back to GEMINI_API_KEY / OPENROUTER_API_KEY env vars.

    `extra_instructions` is appended to the prompt — used by the retry loop
    (scripts/cli_pipeline.py's cmd_generate) to feed validation-engine
    error reports back in on a regeneration pass.
    """
    provider = (provider or os.environ.get("LLM_PROVIDER", "gemini")).lower()
    prompt = build_prompt(schema, templates) + extra_instructions

    if provider == "gemini":
        key = api_key or os.environ.get("GEMINI_API_KEY")
        if not key:
            raise RuntimeError(
                "No Gemini API key found. Get a free one at "
                "https://aistudio.google.com/apikey and set GEMINI_API_KEY."
            )
        raw = _call_gemini(prompt, key)
    elif provider == "openrouter":
        key = api_key or os.environ.get("OPENROUTER_API_KEY")
        if not key:
            raise RuntimeError(
                "No OpenRouter API key found. Get a free one at "
                "https://openrouter.ai/keys and set OPENROUTER_API_KEY."
            )
        raw = _call_openrouter(prompt, key)
    else:
        raise ValueError(f"Unknown provider '{provider}'. Use 'gemini' or 'openrouter'.")

    return _strip_markdown_fences(raw)
