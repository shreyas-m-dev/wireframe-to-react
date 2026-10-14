"""
Instruction parser — reads the user's free-text design instructions
("use a dark theme with rounded blue buttons, add a footer") and maps
them to concrete style overrides for the deterministic compiler
(template_compiler.py). This is a fixed-vocabulary keyword matcher, not
an LLM — it either recognizes a word/phrase from its known list or it
doesn't; it cannot invent a style direction or a UI element the user
didn't ask for. That keeps the default codegen path's core guarantee (no
hallucination) intact even with free-text user instructions in the loop.

Two kinds of instructions are recognized:

1. STYLING (this file, fully self-contained): color, theme, corner
   radius, size/spacing, shadow, border weight, button fill style,
   typography weight, text alignment, opacity. Purely a lookup against a
   fixed vocabulary — always safe, always deterministic.

2. ADDING AN ELEMENT ("add a footer", "include a search bar"): the noun
   phrase after "add"/"include"/"with a" is captured here as
   `addition_query` but NOT resolved to a template in this file — see
   services/codegen/template_compiler.py's `resolve_addition()`, which
   matches it against the SAME real SQLite/TF-IDF RAG index used for
   layout retrieval (services/rag/vector_db.py). This is what makes "add
   a footer" recognize anything in the existing 20-template catalog
   (header/nav, forms, cards, sidebars, tabs, search bars, modals,
   footers, and more) rather than a small hardcoded keyword list — and
   because a match can ONLY ever be one of those 20 pre-written, reviewed
   templates (never LLM-invented JSX), there is no hallucination risk:
   either a real match is found above a confidence threshold, or nothing
   is added.

Anything not recognized in either category is simply ignored — this
module never guesses at intent for words it doesn't know, and never
fails on unrecognized input.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field

# ---------------------------------------------------------------------------
# Vocabulary
# ---------------------------------------------------------------------------

COLOR_ALIASES = {
    "grey": "gray",
    "navy": "indigo",
    "violet": "purple",
    "cyan": "teal",
    "turquoise": "teal",
    "magenta": "pink",
    "maroon": "red",
    "crimson": "red",
    "scarlet": "red",
    "lavender": "purple",
    "mauve": "purple",
    "coral": "orange",
    "peach": "orange",
    "mint": "emerald",
    "jade": "emerald",
    "olive": "lime",
    "gold": "amber",
    "mustard": "amber",
    "beige": "zinc",
    "charcoal": "zinc",
    "aqua": "cyan",
    "azure": "sky",
    "cobalt": "blue",
    "royal": "blue",
    "burgundy": "rose",
    "salmon": "rose",
    "lilac": "purple",
    "plum": "purple",
    "ivory": "zinc",
    "graphite": "slate",
}
KNOWN_ACCENT_COLORS = {
    "blue", "red", "green", "yellow", "purple", "pink", "indigo", "teal",
    "orange", "amber", "lime", "emerald", "cyan", "sky", "violet",
    "fuchsia", "rose", "zinc", "slate", "gray",
}

DARK_PHRASES = ("dark theme", "dark mode", "darkmode", "night mode", "dark colour scheme", "dark color scheme", "make it dark", "use dark")
LIGHT_PHRASES = ("light theme", "light mode", "day mode", "bright theme", "white theme", "not dark", "no dark", "don't make it dark", "dont make it dark")

ROUNDED_PHRASES = ("rounded", "round corners", "pill", "pill-shaped", "pill shaped", "circular", "curved", "curvy", "soft corners", "smooth corners")
SHARP_PHRASES = ("sharp", "square corners", "no rounding", "sharp corners", "hard corners", "boxy", "angular", "crisp corners")

LARGE_WORDS = ("large", "big", "bigger", "spacious", "roomy", "generous", "huge", "oversized", "wide")
SMALL_WORDS = ("small", "compact", "tight", "dense", "tiny", "minimal", "narrow", "condensed", "slim")

SHADOW_WORDS = ("shadow", "shadows", "shadowed", "elevated", "elevation", "floating", "raised")
FLAT_PHRASES = ("flat", "flush", "no shadow", "shadowless")

BOLD_PHRASES = ("bold", "heavy", "strong", "thick text", "emphasized", "emphasised")
LIGHT_WEIGHT_PHRASES = ("thin text", "light text", "light weight", "lightweight text")

CENTER_PHRASES = ("centered", "centred", "center-aligned", "center aligned", "middle-aligned")
LEFT_PHRASES = ("left-aligned", "left aligned", "align left", "left justified")
RIGHT_PHRASES = ("right-aligned", "right aligned", "align right", "right justified")

THICK_BORDER_PHRASES = ("thick border", "heavy border", "bold border", "prominent border")
THIN_BORDER_PHRASES = ("thin border", "light border", "subtle border", "hairline border")
NO_BORDER_PHRASES = ("no border", "borderless", "remove border", "without border")

OUTLINE_BUTTON_PHRASES = ("outline button", "outlined button", "outline buttons", "ghost button", "ghost buttons", "transparent button")
FILLED_BUTTON_PHRASES = ("filled button", "solid button", "filled buttons", "solid buttons")

TRANSPARENT_PHRASES = ("transparent", "translucent", "semi-transparent", "see-through")

# Phrases that introduce an element-addition request — everything after
# the phrase is captured as the addition query (see module docstring).
ADDITION_TRIGGERS = ("add a ", "add an ", "add ", "include a ", "include an ", "include ", "also add ", "with a ", "with an ")


@dataclass
class StyleOverrides:
    accent_color: str | None = None       # e.g. "blue" -> primary buttons use bg-blue-600
    dark_theme: bool = False
    corner_style: str | None = None       # "rounded" | "sharp" | None (default)
    size: str | None = None               # "large" | "small" | None (default)
    shadow: bool | None = None            # True/False, or None (default = no shadow)
    font_weight: str | None = None        # "bold" | "light" | None (default)
    text_align: str | None = None         # "center" | "left" | "right" | None (default)
    border_weight: str | None = None      # "thick" | "thin" | "none" | None (default)
    button_style: str | None = None       # "outline" | "filled" | None (auto from accent_color)
    transparent: bool = False
    addition_query: str | None = None     # free text after "add a ..." — resolved elsewhere, see module docstring
    recognized_keywords: list[str] = field(default_factory=list)  # for the UI to show what was understood


def _extract_addition_query(lowered: str) -> str | None:
    for trigger in ADDITION_TRIGGERS:
        idx = lowered.find(trigger)
        if idx != -1:
            rest = lowered[idx + len(trigger):]
            # stop at the next clause boundary so "add a footer, and make
            # buttons blue" doesn't drag the whole rest of the sentence in
            rest = re.split(r"[,.;]| and ", rest)[0].strip()
            if rest:
                return rest
    return None


def parse_instructions(text: str | None) -> StyleOverrides:
    """
    Pure, deterministic, fixed-vocabulary parsing — no network, no model,
    no ambiguity resolution beyond simple keyword/phrase matching. Safe to
    call with None or an empty string (returns all-default overrides).
    """
    overrides = StyleOverrides()
    if not text:
        return overrides

    lowered = text.lower()
    ordered_words = re.findall(r"[a-z]+", lowered)
    words = set(ordered_words)

    # --- accent color ---
    for word in ordered_words:
        canonical = COLOR_ALIASES.get(word, word)
        if canonical in KNOWN_ACCENT_COLORS:
            overrides.accent_color = canonical
            overrides.recognized_keywords.append(word)
            break  # first mentioned color wins if the user names several

    # --- theme ---
    if any(p in lowered for p in LIGHT_PHRASES) or ("light" in ordered_words and "dark" not in lowered):
        overrides.dark_theme = False
        overrides.recognized_keywords.append("light")
    elif any(p in lowered for p in DARK_PHRASES) or ("dark" in ordered_words and not any(neg in lowered for neg in ["not dark", "no dark", "dont", "don't"])):
        overrides.dark_theme = True
        overrides.recognized_keywords.append("dark")
    else:
        overrides.dark_theme = False

    # --- corner style ---
    if any(p in lowered for p in ROUNDED_PHRASES):
        overrides.corner_style = "rounded"
        overrides.recognized_keywords.append("rounded")
    elif any(p in lowered for p in SHARP_PHRASES):
        overrides.corner_style = "sharp"
        overrides.recognized_keywords.append("sharp")

    # --- size / spacing ---
    if any(w in words for w in LARGE_WORDS):
        overrides.size = "large"
        overrides.recognized_keywords.append("large")
    elif any(w in words for w in SMALL_WORDS):
        overrides.size = "small"
        overrides.recognized_keywords.append("small")

    # --- shadow ---
    if any(w in words for w in SHADOW_WORDS):
        overrides.shadow = True
        overrides.recognized_keywords.append("shadow")
    elif any(p in lowered for p in FLAT_PHRASES):
        overrides.shadow = False
        overrides.recognized_keywords.append("flat")

    # --- typography weight ---
    if any(p in lowered for p in BOLD_PHRASES):
        overrides.font_weight = "bold"
        overrides.recognized_keywords.append("bold")
    elif any(p in lowered for p in LIGHT_WEIGHT_PHRASES):
        overrides.font_weight = "light"
        overrides.recognized_keywords.append("light-weight")

    # --- text alignment ---
    if any(p in lowered for p in CENTER_PHRASES):
        overrides.text_align = "center"
        overrides.recognized_keywords.append("centered")
    elif any(p in lowered for p in LEFT_PHRASES):
        overrides.text_align = "left"
        overrides.recognized_keywords.append("left-aligned")
    elif any(p in lowered for p in RIGHT_PHRASES):
        overrides.text_align = "right"
        overrides.recognized_keywords.append("right-aligned")

    # --- border weight ---
    if any(p in lowered for p in NO_BORDER_PHRASES):
        overrides.border_weight = "none"
        overrides.recognized_keywords.append("borderless")
    elif any(p in lowered for p in THICK_BORDER_PHRASES):
        overrides.border_weight = "thick"
        overrides.recognized_keywords.append("thick-border")
    elif any(p in lowered for p in THIN_BORDER_PHRASES):
        overrides.border_weight = "thin"
        overrides.recognized_keywords.append("thin-border")

    # --- button fill style ---
    if any(p in lowered for p in OUTLINE_BUTTON_PHRASES):
        overrides.button_style = "outline"
        overrides.recognized_keywords.append("outline-buttons")
    elif any(p in lowered for p in FILLED_BUTTON_PHRASES):
        overrides.button_style = "filled"
        overrides.recognized_keywords.append("filled-buttons")

    # --- transparency ---
    if any(p in lowered for p in TRANSPARENT_PHRASES):
        overrides.transparent = True
        overrides.recognized_keywords.append("transparent")

    # --- element addition request ---
    addition = _extract_addition_query(lowered)
    if addition:
        overrides.addition_query = addition
        overrides.recognized_keywords.append(f"add:{addition}")

    return overrides
