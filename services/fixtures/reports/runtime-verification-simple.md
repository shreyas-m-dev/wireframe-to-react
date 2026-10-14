# Fixture report: simple_layout.png

- Source dimensions: 1200×800; normalized: 1024×1024
- Quality warnings: ['Aspect ratio 1.50 differs notably from target 1.00; resize will distort proportions. Consider pad-to-square upstream if this matters.']
- Perspective/glare/screen-border correction: not implemented
- Macro regions: ['page', 'header', 'main', 'gallery', 'product-detail', 'media']
- Elements by role/type: `{'page': 1, 'header': 1, 'button': 3, 'main': 1, 'gallery': 1, 'product-detail': 1, 'media': 1, 'container': 1}`
- Hierarchy depth: 4
- Repeated groups: []
- Retrieved legacy records (read-only): ['product-detail-gallery-page', 'product-gallery-section', 'product-detail-section', 'header-logo-nav-buttons']
- Generator: deterministic `template_compiler.compile_schema`; no LLM call
- Fidelity: {'score': 1, 'fullPage': True, 'majorRegionCount': 5, 'leafCount': 6, 'mediaCount': 2, 'buttonCount': 3, 'maxDepth': 4, 'passed': True, 'reasons': []}
- Code validation: valid=True; structural accuracy=0.5; auto repairs=5
- Preview screenshot: not produced; no browser screenshot renderer is configured
- Outputs: `detections.png`, `macro-zones.png`, `schema.json`, `retrieval.json`, `GeneratedComponent.jsx`, `validation.json`
- Limitations: classical CV only; OCR is attempted only when its executable is available; no perspective correction or rendered-image comparison.
