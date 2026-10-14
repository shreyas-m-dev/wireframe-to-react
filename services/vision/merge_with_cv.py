"""Canonical reconciliation: use new canonical_reconciliation module for single-tree enforcement."""
from __future__ import annotations
from canonical_reconciliation import canonical_reconciliation

def merge(cv_elements, vision_schema, canvas=None, category="generic"):
    """Reconcile CV/OCR and vision into exactly one canonical page tree.
    
    This is now a thin wrapper around canonical_reconciliation which provides:
    - Duplicate suppression with evidence merging
    - Category-aware role filtering
    - Single-tree validation
    - Proper parent-child assignment preparation
    
    Args:
        cv_elements: CV/OCR detected elements
        vision_schema: Optional Gemini vision schema
        canvas: Canvas dimensions {width, height}
        category: Page category (landing, ecommerce, dashboard, auth, generic)
    
    Returns:
        Tuple of (canonical_elements, reconciliation_report)
    """
    result = canonical_reconciliation(cv_elements, vision_schema, canvas, category)
    
    # Convert new report format to legacy format for backward compatibility
    new_report = result["report"]
    legacy_report = {
        "used": new_report["visionUsed"],
        "added": [],  # Not tracked in new format
        "matched": [],  # Not tracked in new format
        "rejected": [],  # Not tracked in new format
        "duplicateReconciliation": new_report["duplicateSuppression"]["decisions"],
        "schemaSource": new_report["schemaSource"],
        "category": new_report["category"],
        "validation": new_report["validation"],
        "categoryFiltering": new_report["categoryFiltering"]
        ,"diagnostics": new_report.get("diagnostics", {})
    }
    
    return result["elements"], legacy_report
