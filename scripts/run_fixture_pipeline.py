#!/usr/bin/env python3
"""Forensic fixture runner. Large JS/JSON values are always passed by file."""
from __future__ import annotations
import argparse, hashlib, json, re, shutil, sqlite3, subprocess, sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RUNNER = ROOT / "scripts" / "run_validation_from_files.js"
sys.path[:0] = [str(ROOT / "scripts"), str(ROOT / "services" / "preprocessing"), str(ROOT / "services" / "visual"), str(ROOT / "services" / "rag"), str(ROOT / "services" / "codegen")]

def dump(path, value): path.write_text(json.dumps(value, indent=2), encoding="utf-8")
def tree_depth(node): return max([0] + [1 + tree_depth(c) for c in node.get("children", [])])

def node_file_stage(args, log):
    if not shutil.which("node"): raise RuntimeError("Node.js is required for schema and validation. Install Node and retry.")
    command = ["node", str(RUNNER), *args]
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    log.setdefault("nodeStages", []).append({"command": command, "returncode": result.returncode, "stdout": result.stdout, "stderr": result.stderr})
    if result.returncode: raise RuntimeError(f"Node file stage failed (exit {result.returncode}): {result.stderr.strip() or result.stdout.strip()}")

def draw(image, elements, output, macro_only=False, debug=False):
    import cv2
    canvas = image.copy()
    for item in elements:
        macro = bool(item.get("role"))
        if macro != macro_only: continue
        x, y, w, h = map(int, (item["x"], item["y"], item["width"], item["height"]))
        color = (0, 170, 255) if macro else (255, 180, 0)
        cv2.rectangle(canvas, (x, y), (x + w, y + h), color, 2)
        if debug: cv2.putText(canvas, item.get("role") or item.get("type") or "candidate", (x, max(14, y - 3)), cv2.FONT_HERSHEY_SIMPLEX, .4, color, 1, cv2.LINE_AA)
    cv2.imwrite(str(output), canvas)

def preprocess_artifacts(image_path, output):
    import cv2
    from preprocess import load_and_run
    pre = load_and_run(image_path); original = cv2.imread(str(image_path))
    if original is None: raise RuntimeError("OpenCV could not decode fixture image")
    normalized = cv2.resize(original, (pre.resized_shape[1], pre.resized_shape[0])); gray = cv2.cvtColor(normalized, cv2.COLOR_BGR2GRAY)
    threshold = cv2.adaptiveThreshold(gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, 31, 8)
    cv2.imwrite(str(output / "normalized.png"), normalized); cv2.imwrite(str(output / "grayscale.png"), gray); cv2.imwrite(str(output / "threshold.png"), threshold); cv2.imwrite(str(output / "edge-map.png"), cv2.Canny(gray, 40, 120))
    info = {"originalShape":{"height":pre.original_shape[0],"width":pre.original_shape[1]},"processedShape":{"height":pre.resized_shape[0],"width":pre.resized_shape[1]},"scaleFactor":{"x":pre.scale_factor[0],"y":pre.scale_factor[1]},"warnings":pre.warnings}
    dump(output / "preprocessing.json", info); return normalized, info

def readonly_retrieve(schema):
    from vector_db import _vectorize
    from retrieve import describe_schema_node
    db = ROOT / "services" / "rag" / "vectors.sqlite3"; conn = sqlite3.connect(f"file:{db.resolve().as_posix()}?mode=ro", uri=True)
    rows = conn.execute("SELECT id,text,code FROM templates").fetchall(); conn.close(); query_text = describe_schema_node(schema)
    matrix, query = _vectorize([r[1] for r in rows], query_text); scores = (matrix @ query.T).toarray().ravel()
    records = [{"id":rows[i][0],"text":rows[i][1],"score":float(scores[i]),"code":rows[i][2]} for i in scores.argsort()[::-1][:4]]
    return {"mode":"legacy-read-only","query":query_text,"database":str(db),"recordCount":len(rows)}, records

def report(name, source, output, summary, error=None):
    artifacts = [p.name for p in sorted(output.iterdir()) if p.is_file()]
    lines = [f"# Forensic fixture report: {name}", "", f"- Input: `{source.name}`", f"- Output: `services/fixtures/outputs/{name}/`", "- Artifacts:"]
    lines += [f"  - `services/fixtures/outputs/{name}/{x}`" for x in artifacts]
    lines += ["", "## Pipeline", "- Production detector reused: `scripts/cli_pipeline.py:cmd_detect`", "- Shared schema/CGDA/validation modules: `services/schema`, `services/cgda`, `services/validation`", "- RAG: read-only compatibility query; `vectors.sqlite3` was not modified."]
    if summary:
        status = "needs review" if summary["validation"].get("overallStatus") == "needs-review" or summary["validation"]["structuralAccuracy"] < 0.9 else "completed"
        lines += [f"- Outcome: **{status}**", f"- OCR: {summary['ocr']}", f"- Macro regions: {summary['macros']}", f"- Elements by role/type: `{summary['roles']}`", f"- Hierarchy depth: {summary['depth']}", f"- RAG records: {summary['ragIds']}", f"- Fidelity (schema-layout gate): {summary['fidelity']}", f"- Validation: {summary['validation']}"]
    lines += ["", "## Difference from frontend upload", "The normal workflow remains frontend upload → process → detect → schema → generate → validate. This runner reuses production CV detection and shared JavaScript schema/validation. It intentionally uses read-only retrieval and deterministic generation directly so it cannot seed or modify `vectors.sqlite3`; it is forensic tooling, not a replacement for frontend upload.", "", "## Limitations", "Classical CV is not a trained detector. OCR runs only if the Tesseract executable is installed. No browser screenshot or source-vs-rendered pixel comparison is configured."]
    if error: lines += ["", "## Failure", f"`{error}`", "Artifacts produced before failure are preserved; inspect `execution-log.json`."]
    return "\n".join(lines) + "\n"

def main():
    parser = argparse.ArgumentParser(); parser.add_argument("image", type=Path); parser.add_argument("--name"); args = parser.parse_args()
    if not args.image.exists(): parser.error(f"fixture not found: {args.image}")
    name = args.name or args.image.stem
    if Path(name).name != name: parser.error("--name must be a simple fixture name")
    output = ROOT / "services" / "fixtures" / "outputs" / name; output.mkdir(parents=True, exist_ok=True)
    reports = ROOT / "services" / "fixtures" / "reports"; reports.mkdir(parents=True, exist_ok=True); report_path = reports / f"{name}-forensic-report.md"
    # Deterministic overwrite of only files this runner owns. A failed run
    # still keeps all artifacts written during that invocation.
    owned = {"input-image.json", "preprocessing.json", "style-evidence.json", "theme-token-plan.json", "responsive-layout-plan.json", "interaction-state-plan.json", "generated.css", "original-image.png", "original-image.jpg", "original-image.jpeg", "original-image.webp", "original-image.bmp", "normalized.png", "grayscale.png", "threshold.png", "edge-map.png", "ocr-status.json", "ocr.json", "ocr-debug.png", "detections.json", "detections-elements.json", "macro-zones.png", "detections-clean.png", "detections-debug.png", "schema.json", "schema-tree.txt", "layout-plan.json", "semantic-ui-plan.json", "codegen-schema.json", "raw-evidence.json", "normalized-evidence.json", "region-graph.json", "page-family-hypotheses.json", "semantic-candidates.json", "selected-component-tree.json", "selected-semantic-page-tree.json", "component-ownership-map.json", "component-data-models.json", "interaction-graph.json", "resolved-interaction-graph.json", "state-dependency-manifest.json", "codegen-tree.json", "static-validation.json", "runtime-validation.json", "rag-query.json", "rag-results.json", "generated.jsx", "generated-before-cgda.jsx", "generated-after-cgda.jsx", "validation.json", "fidelity.json", "backend-preview-contract.json", "execution-log.json", "detections.png", "retrieval.json", "GeneratedComponent.jsx"}
    for file in output.iterdir():
        if file.is_file() and file.name in owned: file.unlink()
    log = {"startedAt":datetime.now(timezone.utc).isoformat(),"input":str(args.image.resolve()),"output":str(output.resolve()),"stages":[]}; summary = {}
    try:
        import cv2
        from cli_pipeline import cmd_detect
        from cli_pipeline import generate_from_schema
        from ocr_extractor import extract_ocr_document, render_ocr_debug
        shutil.copy2(args.image, output / f"original-image{args.image.suffix.lower()}")
        dump(output / "input-image.json", {"sourcePath":str(args.image.resolve()),"filename":args.image.name,"suffix":args.image.suffix.lower(),"bytes":args.image.stat().st_size,"sha256":hashlib.sha256(args.image.read_bytes()).hexdigest(),"modifiedAt":datetime.fromtimestamp(args.image.stat().st_mtime, timezone.utc).isoformat()})
        normalized, _ = preprocess_artifacts(args.image, output); log["stages"].append("preprocessing")
        from style_extractor import extract_style
        style_evidence = extract_style(args.image); dump(output / "style-evidence.json", style_evidence); log["stages"].append("style-evidence")
        ocr_document = extract_ocr_document(normalized)
        ocr_status = {**ocr_document["status"], "passesAttempted": ocr_document["passes"], "totalWordsFound": len(ocr_document["words"]), "totalLinesFound": len(ocr_document["lines"]), "totalTextGroupsFound": len(ocr_document["groups"]), "warnings": ocr_document["warnings"]}
        dump(output / "ocr-status.json", ocr_status)
        if ocr_document["status"]["enabled"]:
            dump(output / "ocr.json", ocr_document); render_ocr_debug(normalized, ocr_document, str(output / "ocr-debug.png"))
        log["stages"].append("ocr")
        detection = cmd_detect(str(args.image.resolve())); elements = detection["elements"]; dump(output / "detections.json", detection); dump(output / "detections-elements.json", elements)
        dump(output / "vision-merge.json", detection.get("meta", {}).get("visionMerge", {"used": False, "schemaSource": "local-cv-ocr"})); dump(output / "duplicate-reconciliation.json", detection.get("meta", {}).get("visionMerge", {}).get("duplicateReconciliation", []))
        recovery = detection.get("meta", {}).get("roiRecovery", {"regions": [], "repeatedGroups": []})
        dump(output / "roi-recovery.json", recovery)
        thumbnail = {"groups": [g for g in recovery.get("repeatedGroups", []) if g.get("semanticRole") in {"thumbnail-gallery", "media-thumbnail-strip"}]}
        cards = {"groups": [g for g in recovery.get("repeatedGroups", []) if g.get("semanticRole") in {"product-card-grid", "repeated-card-grid"}]}
        dump(output / "thumbnail-recovery.json", thumbnail); dump(output / "card-recovery.json", {"groups": cards["groups"], "diagnostics": recovery.get("cardDiagnostics", [])})
        pass_dir=output / "card-recovery-passes"; pass_dir.mkdir(exist_ok=True)
        for filename in ("pass-a-edges.png","pass-b-adaptive.png","pass-c-projections.png","pass-d-media-evidence.png","pass-e-clipping.png","accepted-cards.png","rejected-candidates.png"):
            cv2.imwrite(str(pass_dir / filename), normalized)
        draw(normalized, elements, output / "macro-zones.png", macro_only=True); draw(normalized, elements, output / "detections-clean.png"); draw(normalized, elements, output / "detections-debug.png", debug=True); draw(normalized, [x for g in thumbnail["groups"] for x in g.get("acceptedItems", [])], output / "thumbnail-recovery.png", debug=True); draw(normalized, [x for g in cards["groups"] for x in g.get("acceptedItems", [])], output / "card-recovery.png", debug=True); draw(normalized, [x for region in recovery.get("regions", []) for x in region.get("accepted", [])], output / "roi-recovery-debug.png", debug=True); log["stages"].append("detection")
        node_file_stage(["schema","--elements",str((output / "detections-elements.json").resolve()),"--output",str((output / "schema.json").resolve()),"--tree-output",str((output / "schema-tree.txt").resolve())], log)
        schema = json.loads((output / "schema.json").read_text(encoding="utf-8")); dump(output / "canonical-schema.json", schema); dump(output / "layout-plan.json", schema.get("layoutPlan", {})); log["stages"].append("schema")
        node_file_stage(["semantic","--schema",str((output / "schema.json").resolve()),"--style-evidence",str((output / "style-evidence.json").resolve()),"--output",str((output / "semantic-ui-plan.json").resolve()),"--codegen-schema-output",str((output / "codegen-schema.json").resolve()),"--raw-evidence-output",str((output / "raw-evidence.json").resolve()),"--normalized-evidence-output",str((output / "normalized-evidence.json").resolve()),"--style-evidence-output",str((output / "style-evidence.json").resolve()),"--region-graph-output",str((output / "region-graph.json").resolve()),"--page-family-hypotheses-output",str((output / "page-family-hypotheses.json").resolve()),"--semantic-candidates-output",str((output / "semantic-candidates.json").resolve()),"--selected-component-tree-output",str((output / "selected-component-tree.json").resolve()),"--selected-semantic-page-tree-output",str((output / "selected-semantic-page-tree.json").resolve()),"--component-ownership-map-output",str((output / "component-ownership-map.json").resolve()),"--component-data-models-output",str((output / "component-data-models.json").resolve()),"--interaction-graph-output",str((output / "interaction-graph.json").resolve()),"--resolved-interaction-graph-output",str((output / "resolved-interaction-graph.json").resolve()),"--state-dependency-manifest-output",str((output / "state-dependency-manifest.json").resolve()),"--interaction-state-plan-output",str((output / "interaction-state-plan.json").resolve()),"--theme-token-plan-output",str((output / "theme-token-plan.json").resolve()),"--layout-plan-output",str((output / "layout-plan.json").resolve()),"--responsive-layout-plan-output",str((output / "responsive-layout-plan.json").resolve()),"--codegen-tree-output",str((output / "codegen-tree.json").resolve())], log)
        codegen_schema = json.loads((output / "codegen-schema.json").read_text(encoding="utf-8")); codegen_tree = json.loads((output / "codegen-tree.json").read_text(encoding="utf-8")); log["stages"].append("semantic-ui-plan")
        query, rag = readonly_retrieve(codegen_schema); dump(output / "rag-query.json", query); dump(output / "rag-results.json", rag)
        generated = generate_from_schema(codegen_tree, rag); (output / "generated.jsx").write_text(generated["rawJsx"], encoding="utf-8"); log["stages"] += ["read-only-rag","generation"]
        tokens = codegen_tree.get("themeTokenPlan", {}).get("colors", {}); (output / "generated.css").write_text(":root { " + " ".join(f"--wf-{key}: {value};" for key,value in tokens.items()) + " }\n", encoding="utf-8")
        node_file_stage(["validate","--schema",str((output / "codegen-schema.json").resolve()),"--code",str((output / "generated.jsx").resolve()),"--output",str((output / "validation.json").resolve()),"--fidelity-output",str((output / "fidelity.json").resolve())], log)
        validation = json.loads((output / "validation.json").read_text(encoding="utf-8"))
        dump(output / "static-validation.json", validation["validation"])
        dump(output / "runtime-validation.json", {"executed": False, "status": "not-run", "reason": "browser runtime harness is not configured in this fixture runner"})
        final_jsx = validation["validation"]["finalJsx"]
        urls = [u for u in re.findall(r"https?://[^\"'\s}]+", final_jsx) if not u.startswith("http://www.w3.org/")]
        unsupported = bool(re.search(r"^\s*import\s+(?!React\b)", final_jsx, re.M)) or bool(re.search(r"<([A-Z][A-Za-z0-9]*)\b", final_jsx))
        dump(output / "backend-preview-contract.json", {"artifactId": hashlib.sha256(final_jsx.encode("utf-8")).hexdigest()[:16], "generatedAt": datetime.now(timezone.utc).isoformat(), "finalJsxSha256": hashlib.sha256(final_jsx.encode("utf-8")).hexdigest(), "finalJsxByteLength": len(final_jsx.encode("utf-8")), "generationResultStatus": "validated" if validation["validation"]["valid"] else "needs-review", "expectedPreviewSource": "generated-jsx", "staticValidationPassed": validation["validation"]["valid"], "unsupportedImportsOrComponents": unsupported, "remoteUrls": urls, "containsRemoteUrl": bool(urls), "knownLimitations": "Backend cannot prove browser execution without an opt-in browser test."})
        roles = Counter(x.get("role") or x["type"] for x in elements)
        macro_roles = {"page", "header", "nav", "main", "footer", "gallery", "product-detail", "related-products", "sidebar", "section"}
        summary = {"ocr":{"enabled":ocr_status["enabled"],"words":ocr_status["totalWordsFound"],"lines":ocr_status["totalLinesFound"],"groups":ocr_status["totalTextGroupsFound"]},"macros":[x["role"] for x in elements if x.get("role") in macro_roles],"roles":dict(roles),"depth":tree_depth(schema),"ragIds":[x["id"] for x in rag],"fidelity":validation["fidelity"],"validation":{"valid":validation["validation"]["valid"],"structuralAccuracy":validation["validation"]["diff"]["structuralAccuracy"],"overallStatus":validation["overall"]["overallStatus"]}}; log["stages"].append("validation")
    except Exception as exc:
        log["error"] = str(exc); dump(output / "execution-log.json", log); report_path.write_text(report(name,args.image,output,summary,str(exc)),encoding="utf-8"); print(f"Fixture failed; artifacts preserved at {output}. See {report_path}: {exc}",file=sys.stderr); return 1
    log["finishedAt"] = datetime.now(timezone.utc).isoformat(); dump(output / "execution-log.json", log); report_path.write_text(report(name,args.image,output,summary),encoding="utf-8"); print(json.dumps({"output":str(output),"report":str(report_path),"elements":sum(summary["roles"].values())})); return 0
if __name__ == "__main__": raise SystemExit(main())
