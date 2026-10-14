#!/usr/bin/env python3
"""
CLI entry point Express (backend/server.js) shells out to for the
Python-side steps of the pipeline. Node handles steps 3 (schema), 6
(CGDA), 7 (validation) in-process — see services/schema, services/cgda,
services/validation — since those have zero Python dependencies.

Subcommands:
  detect <image_path>
      Steps 1+2: validates the upload, then runs real CV detection
      (services/detection/heuristic_detector.py) on the actual image, and
      real OCR (services/detection/ocr_extractor.py) to read any
      placeholder/button text actually drawn in the wireframe (e.g. a
      "Name" placeholder inside an input box), attaching it to the
      matching element. No trained model, no network. Prints
      {"elements": [...]} — each element has a "label" field (the OCR
      text, or null if none was found nearby).

  generate <schema_json> [error_report_json] [instructions]
      Steps 4+5: RAG retrieval (real SQLite vector DB) + code generation.
      Default GEN_MODE=template uses the deterministic compiler
      (services/codegen/template_compiler.py) — always produces a 100%
      structurally-accurate match to the schema, no network needed.
      GEN_MODE=llm calls a free-tier LLM (services/codegen/generate.py,
      Gemini by default) and falls back to the deterministic compiler if
      the API call fails for any reason, so a request never hard-fails
      just because a network call didn't work.
      error_report_json (optional): validation engine's diff from a
      previous failed attempt, fed back in on a retry.
      instructions (optional): free-text user design instructions (e.g.
      "dark theme with rounded blue buttons"). In template mode, parsed
      deterministically by services/codegen/instruction_parser.py into
      concrete style overrides (fixed vocabulary — never invents a style
      direction the user didn't name). In llm mode, appended to the
      prompt as-is.
      Prints {"rawJsx": "...", "genMode": "template"|"llm"|"template-fallback"}.

Every error path prints {"error": "..."} to stderr and exits non-zero,
so the Node caller can surface a clean message instead of a stack trace.
"""
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "services" / "preprocessing"))
sys.path.insert(0, str(ROOT / "services" / "detection"))
sys.path.insert(0, str(ROOT / "services" / "rag"))
sys.path.insert(0, str(ROOT / "services" / "codegen"))
sys.path.insert(0, str(ROOT / "services" / "vision"))
sys.path.insert(0, str(ROOT / "services" / "visual"))


def cmd_detect(image_path: str, instructions: str = "") -> dict:
    import cv2
    from preprocess import InvalidInputError, load_and_run, validate_input
    from heuristic_detector import detect_from_array, to_schema_input

    try:
        data = Path(image_path).read_bytes()
        validate_input(data, image_path)
    except InvalidInputError as e:
        raise RuntimeError(f"Invalid image: {e}")
    except FileNotFoundError:
        raise RuntimeError(f"File not found: {image_path}")

    # Detection deliberately consumes the same normalized 1024px image that
    # preprocessing produces, rather than merely validating then ignoring it.
    processed = load_and_run(image_path)
    img = cv2.imread(image_path)
    if img is None:
        raise RuntimeError(f"Could not decode image: {image_path}")
    img = cv2.resize(img, (processed.resized_shape[1], processed.resized_shape[0]))
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    # Three-pass detection. Each pass fixes a real, verified failure mode
    # of doing this more simply — see the docstrings on the functions
    # involved for the specific before/after cases that drove each one.
    #
    # Pass 1: find text at WORD level (tight boxes, not full lines) so it
    # can be masked out before shape detection. Word-level, not
    # line-level, matters here: masking with merged LINE bounding boxes
    # instead — whenever multiple separate widgets sit at a similar height
    # (e.g. "LOGO", "Login", "Sign Up" all on one header row) — spans
    # across the gaps between them too, painting over (and destroying)
    # button borders that happened to fall inside that wide merged span.
    # A tight per-word mask only ever covers the actual glyph pixels,
    # never bleeds into unrelated shapes nearby. Verified directly: this
    # was the reason a header's "Login" button vanished from detection
    # entirely under the line-level version.
    #
    # Pass 2: run shape detection (buttons, inputs, containers, images) on
    # the text-masked image. CV contour detection has no concept of "this
    # is a letter, not a widget" — individual letters/word-fragments in a
    # heading get misread as separate buttons/icons/containers otherwise
    # (a single 3-element wireframe produced 24 spurious detections
    # before masking was introduced; a text-heavy heading alone produced 16).
    #
    # Pass 3: run text-LINE extraction (grouping words like "Join our
    # team today!" into one phrase), this time EXCLUDING any word that
    # falls inside a detected widget's box from pass 2. This matters for
    # the same reason as pass 1's word-level masking: without excluding
    # widget-owned words, Tesseract's line grouping (purely about vertical
    # position) merges "LOGO", "Login", and "Sign Up" into one garbled
    # standalone text line, and those buttons lose their own labels.
    #
    # All of this is best-effort: if Tesseract isn't installed, detection
    # still succeeds using CV-only shape detection with no text lines and
    # no labels, rather than failing the whole request.
    ocr_status = {"enabled": False, "executablePath": None, "version": None, "reason": "OCR not attempted"}
    try:
        from ocr import configure_tesseract
        ocr_status = configure_tesseract()
    except Exception as exc:
        ocr_status = {"enabled": False, "executablePath": None, "version": None, "reason": str(exc)}
    text_regions_for_masking = []
    shape_input = gray
    text_lines = []
    try:
        from ocr_extractor import extract_text_regions, mask_out_text_lines
        text_regions_for_masking = extract_text_regions(img)
        shape_input = mask_out_text_lines(gray, text_regions_for_masking)
    except Exception:
        pass

    detections = detect_from_array(shape_input)
    shape_elements = [e for e in to_schema_input(detections) if e["type"] != "text"]

    try:
        from ocr_extractor import extract_text_lines as _extract_text_lines_again
        text_lines = _extract_text_lines_again(img, exclude_boxes=shape_elements)
    except Exception:
        pass

    def text_role(line):
        value = line.text.strip()
        if re.search(r"(?:[$€£₹]\s?\d|\d+[.,]\d{2})", value): return "price"
        if len(value) >= 36 or value.count(" ") >= 5: return "description"
        if line.height >= 24: return "heading"
        return "copy"
    # Keep shared OCR document lines as schema evidence; the masking pass may
    # intentionally omit text inside visual controls.
    ocr_lines = []
    if ocr_status["enabled"]:
        try:
            from ocr_extractor import extract_ocr_document
            document = extract_ocr_document(img)
            # The sparse pass is best for prominent headings, while the
            # normalized pass recovers CTA/contact copy. Keep both but reject
            # OCR line-art garbage and page-wide header amalgams; header words
            # are reconstructed from their own OCR boxes below.
            header_limit = processed.resized_shape[0] * .13
            ocr_lines = [line for line in document["lines"] if re.search(r"[A-Za-z0-9]", line["text"]) and line["text"].strip() not in {"=", "|"} and not (line["pass"] == "normalized-psm6" and line["y"] < header_limit)]
            header_words = [word for word in document["words"] if word["y"] < header_limit and re.fullmatch(r"[A-Za-z]{2,}", word["text"])]
            for word in header_words:
                ocr_lines.append({"text": word["text"], "confidence": word["confidence"], "x": word["x"], "y": word["y"], "width": word["width"], "height": word["height"], "pass": f'{word["pass"]}-header-word'})
        except Exception:
            ocr_lines = []
    text_elements = []
    for line in ocr_lines:
        text = line["text"].strip()
        if not re.search(r"[A-Za-z0-9]", text):
            continue
        role_source = type("OcrLine", (), {"text": text, "height": line["height"]})()
        role = text_role(role_source)
        if re.search(r"(?i)\b(get started|send|contact)\b", text): role = "action"
        if "product title" in text.lower(): role = "heading"
        elif "similar product" in text.lower(): role = "section-heading"
        elif line["y"] < processed.resized_shape[0] * .16 and role == "copy": role = "nav-link"
        element_type = "button" if role == "action" and re.search(r"(?i)\b(get started|send|contact)\b", text) else "text"
        text_elements.append({"type":element_type, "confidence":min(line["confidence"] / 100.0, 1.0), "x":line["x"], "y":line["y"], "width":line["width"], "height":line["height"], "label":text, "role":role, "ocrEvidence":{"pass":line["pass"],"confidence":line["confidence"]}})
    if not text_elements:
        text_elements = [{"type":"text", "confidence":min(line.confidence / 100.0, 1.0), "x":line.x, "y":line.y, "width":line.width, "height":line.height, "label":line.text, "role":text_role(line)} for line in text_lines]

    elements = shape_elements + text_elements
    if not elements:
        raise RuntimeError(
            "No UI elements detected in this image. Try a wireframe with "
            "clearer boxes/outlines (this detector looks for outlined or "
            "filled rectangular regions) or readable text."
        )

    # Word-level OCR label-matching (a "Submit" inside a button, a "Name"
    # placeholder inside an input) runs against the ORIGINAL, unmasked
    # image — only shape detection needed the text masked away; matching
    # a widget's own label to it needs the text still visible. This only
    # labels shape_elements — text_elements already carry their own text
    # directly as `label`, set above.
    try:
        from ocr_extractor import extract_text_regions, attach_labels
        word_regions = extract_text_regions(img)
        labeled_shapes = attach_labels(shape_elements, word_regions)
        # OCR is evidence, never an automatic CTA. A price or selector/read
        # field discovered inside a rectangular contour must not become a
        # button merely because the CV box happened to be button-shaped.
        for element in labeled_shapes:
            label = (element.get("label") or "").strip()
            lowered = label.lower()
            if element["type"] == "button" and re.search(r"(?:[$€£₹]\s?\d|\d+[.,]\d{2})", label):
                element["type"], element["role"] = "text", "price"
            elif element["type"] == "button" and (lowered.startswith("select ") or "choose" in lowered):
                element["type"], element["role"] = "input", "select"
            elif element["type"] == "button" and "search" in lowered:
                element["type"], element["role"] = "input", "search"
        elements = labeled_shapes + text_elements
    except Exception:
        for e in shape_elements:
            e.setdefault("label", None)
        elements = shape_elements + text_elements

    # Shared evidence fusion occurs after OCR labels/text lines and before
    # schema construction. It is used identically by backend uploads because
    # they invoke this CLI function.
    try:
        from ocr_extractor import extract_ocr_document
        from ocr_layout_fusion import fuse_layout_evidence
        document = extract_ocr_document(img) if ocr_status["enabled"] else None
        elements = fuse_layout_evidence(elements, document, {"width": processed.resized_shape[1], "height": processed.resized_shape[0]})
    except Exception:
        pass

    # Generic macro-to-micro recovery: local ROI contours supplement global
    # detection without assuming a page category or item count.
    recovery = {"regions": [], "repeatedGroups": []}
    try:
        from roi_recovery import recover_regions
        recovered, recovery = recover_regions(gray, elements, {"width": processed.resized_shape[1], "height": processed.resized_shape[0]})
        elements.extend(recovered)
    except Exception as exc:
        recovery = {"regions": [], "repeatedGroups": [], "error": str(exc)}

    vision = {"used": False, "reason": "not attempted"}
    try:
        from provider import analyze as analyze_vision
        vision = analyze_vision(image_path, instructions)
    except Exception as exc:
        vision = {"used": False, "reason": f"vision adapter unavailable: {exc}"}
    vision_merge = {"used": False, "added": [], "matched": [], "rejected": []}
    # Infer category from vision or default to generic
    category = "generic"
    if vision.get("used") and vision.get("schema"):
        category = vision.get("schema", {}).get("pageCategory", "generic")
    
    if vision.get("used") and vision.get("schema"):
        try:
            from merge_with_cv import merge
            elements, vision_merge = merge(elements, vision["schema"], {"width": processed.resized_shape[1], "height": processed.resized_shape[0]}, category)
            # Update category from canonical reconciliation if it was determined
            if vision_merge.get("category"):
                category = vision_merge["category"]
        except Exception as exc:
            vision["used"] = False
            vision["reason"] = f"vision merge rejected: {exc}"
    return {"elements": elements, "meta": {"canvas": {"width": processed.resized_shape[1], "height": processed.resized_shape[0]}, "warnings": processed.warnings, "ocr": ocr_status, "roiRecovery": recovery, "vision": vision, "visionMerge": vision_merge, "category": category}}


def cmd_preprocess(image_path: str) -> dict:
    from preprocess import InvalidInputError, load_and_run
    try:
        result = load_and_run(image_path)
    except InvalidInputError as e:
        raise RuntimeError(f"Invalid image: {e}")
    return {
        "originalShape": {"height": result.original_shape[0], "width": result.original_shape[1]},
        "processedShape": {"height": result.resized_shape[0], "width": result.resized_shape[1]},
        "scaleFactor": {"x": result.scale_factor[0], "y": result.scale_factor[1]},
        "warnings": result.warnings,
    }

def cmd_style(image_path: str) -> dict:
    from style_extractor import extract_style
    return extract_style(image_path)


def generate_from_schema(schema: dict, templates: list[dict], error_report: dict | None = None, instructions: str | None = None) -> dict:
    """Shared generation implementation for the backend and forensic runner.

    Retrieval is deliberately supplied by the caller. The frontend backend
    uses its compatibility index; the fixture runner uses a read-only query
    so that evidence collection can never mutate the legacy database.
    """
    from instruction_parser import parse_instructions
    overrides = parse_instructions(instructions)

    # Element additions ("add a footer") are resolved here, separately
    # from `rawJsx`, and deliberately NOT included in what goes through
    # CGDA/validation — see template_compiler.py's resolve_addition()
    # docstring: CGDA's job is to strip content with no schema backing,
    # and an addition never has schema backing by definition (it wasn't
    # in the wireframe), so running it through CGDA would just strip it
    # right back out. Instead, the backend splices `addition["code"]` into
    # the final response only after rawJsx has independently passed
    # validation — see backend/server.js.
    # Additions are a normal-upload feature. Fixture runs intentionally do
    # not introduce unobserved elements or open the legacy DB for writing.
    addition = None

    mode = os.environ.get("GEN_MODE", "template").lower()
    if mode == "llm":
        from generate import generate_code
        note = ""
        if error_report:
            note += (
                f"\n\nPrevious attempt failed validation: missing types "
                f"{error_report.get('missingInCode')}, extra unaccounted tags "
                f"{error_report.get('extraInCode')}. Fix these specifically."
            )
        if instructions:
            note += f"\n\nAdditional design instructions from the user: {instructions}"
        try:
            raw_jsx = generate_code(schema, templates, extra_instructions=note)
            return {
                "rawJsx": raw_jsx,
                "genMode": "llm",
                "templates": templates,
                "recognizedInstructions": overrides.recognized_keywords,
                "addition": addition,
            }
        except Exception as e:
            # Graceful fallback rather than failing the whole request: if
            # the LLM call fails (no key set, rate-limited, network down),
            # the deterministic compiler still produces valid output —
            # still honoring whatever style instructions were recognized.
            from template_compiler import compile_schema
            return {
                "rawJsx": compile_schema(schema, templates, overrides),
                "genMode": "template-fallback",
                "templates": templates,
                "llmError": str(e),
                "recognizedInstructions": overrides.recognized_keywords,
                "addition": addition,
            }

    from template_compiler import compile_schema
    return {
        "rawJsx": compile_schema(schema, templates, overrides),
        "genMode": "template",
        "templates": templates,
        "recognizedInstructions": overrides.recognized_keywords,
        "addition": addition,
    }


def cmd_generate(schema: dict, error_report: dict | None, instructions: str | None) -> dict:
    from retrieve import build_index, retrieve_layout_context
    from template_compiler import resolve_addition
    db = build_index()
    # Retrieval describes the selected tree, while compilation receives the
    # complete CodegenTree (including the dependency manifest).
    retrieval_tree = schema.get("root") if schema.get("kind") == "CodegenTree" else schema
    templates = retrieve_layout_context(retrieval_tree, db)
    result = generate_from_schema(schema, templates, error_report, instructions)
    # Keep the existing production addition behavior separate from fixtures.
    from instruction_parser import parse_instructions
    result["addition"] = resolve_addition(parse_instructions(instructions).addition_query, db)
    return result


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "usage: cli_pipeline.py <preprocess|detect|generate> ..."}), file=sys.stderr)
        sys.exit(1)

    subcommand = sys.argv[1]
    try:
        if subcommand == "preprocess":
            if len(sys.argv) != 3:
                raise RuntimeError("usage: cli_pipeline.py preprocess <image_path>")
            result = cmd_preprocess(sys.argv[2])
        elif subcommand == "detect":
            if len(sys.argv) not in (3, 4):
                raise RuntimeError("usage: cli_pipeline.py detect <image_path> [instructions]")
            result = cmd_detect(sys.argv[2], sys.argv[3] if len(sys.argv) == 4 else "")
        elif subcommand == "style":
            if len(sys.argv) != 3: raise RuntimeError("usage: cli_pipeline.py style <image_path>")
            result = cmd_style(sys.argv[2])
        elif subcommand == "generate":
            if len(sys.argv) < 3:
                raise RuntimeError("usage: cli_pipeline.py generate <schema_json> [error_report_json] [instructions]")
            schema = json.loads(sys.argv[2])
            error_report = json.loads(sys.argv[3]) if len(sys.argv) > 3 and sys.argv[3] not in ("", "null") else None
            instructions = sys.argv[4] if len(sys.argv) > 4 else None
            result = cmd_generate(schema, error_report, instructions)
        elif subcommand == "generate-file":
            if len(sys.argv) != 4:
                raise RuntimeError("usage: cli_pipeline.py generate-file <input_json_path> <output_json_path>")
            input_path, output_path = Path(sys.argv[2]), Path(sys.argv[3])
            if not input_path.is_file():
                raise RuntimeError("generation input file not found")
            request = json.loads(input_path.read_text(encoding="utf-8"))
            if not isinstance(request, dict) or not isinstance(request.get("schema"), dict):
                raise RuntimeError("generation input requires a schema object")
            result = cmd_generate(request["schema"], request.get("errorReport"), request.get("instructions"))
            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(json.dumps(result), encoding="utf-8")
            result = {"output": str(output_path)}
        elif subcommand == "vision-smoke":
            if len(sys.argv) != 2: raise RuntimeError("usage: cli_pipeline.py vision-smoke")
            from provider import smoke_test
            result = smoke_test()
        elif subcommand == "vision-gemini-models":
            if len(sys.argv) != 2: raise RuntimeError("usage: cli_pipeline.py vision-gemini-models")
            from provider import discover_gemini_models
            result = discover_gemini_models()
        else:
            raise RuntimeError(f"unknown subcommand '{subcommand}'. Use 'detect' or 'generate'.")
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result))


if __name__ == "__main__":
    main()
