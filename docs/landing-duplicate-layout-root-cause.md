# Landing Wireframe Duplicate and Layout Root Cause Analysis

## Executive Summary

The current generated webpage is structurally and visually wrong due to fundamental issues in the canonical reconciliation pipeline. The system is not properly merging CV/OCR evidence with Gemini vision data, not suppressing duplicate nodes, and not enforcing a single coherent page hierarchy.

## Critical Findings

### 1. Vision Merge Not Executing

**Evidence**: `vision-merge.json` shows:
```json
{
  "used": false,
  "added": [],
  "matched": [],
  "rejected": []
}
```

**Root Cause**: The Gemini vision system is returning valid data (HTTP 200, schemaValid=true), but the merge step is not being triggered or is failing silently. The `merge_with_cv.py` function receives empty or null vision schema despite successful Gemini responses.

**Impact**: No semantic interpretation from Gemini is being incorporated into the final schema, leaving only raw CV/OCR geometry without proper page structure understanding.

### 2. Duplicate Reconciliation Not Running

**Evidence**: `duplicate-reconciliation.json` is an empty array `[]`.

**Root Cause**: The duplicate detection and reconciliation logic in `merge_with_cv.py` is not being executed, or the conditions for duplicate detection are not being met due to the failed vision merge.

**Impact**: Duplicate nodes with highly overlapping bounds are not being suppressed, leading to multiple equivalent elements in the final schema.

### 3. Duplicate CONTACT Buttons in Header

**Source**: CV/OCR detections show two CONTACT buttons in header:

- **button-19**: `x=822, y=72, width=87, height=14`, confidence=0.96, text="CONTACT"
- **button-21**: `x=670, y=73, width=74, height=13`, confidence=0.92, text="CONTACT"

**Root Cause**: OCR detects "CONTACT" twice in the header region - once as a navigation link and once as a CTA button. The system creates separate button nodes for both OCR detections without reconciling them.

**Why Retained**: Both have high confidence (>0.9) and similar bounds, but the duplicate suppression logic is not working due to the failed merge pipeline.

**Should Be**: One CONTACT button in header (the CTA), and CONTACT should also appear as a nav-link in the nav-group.

### 4. Missing CONTACT Nav Link

**Evidence**: The nav-group (region-24) contains only:
- text-22: ABOUT (nav-link)
- text-23: SERVICES (nav-link)

**Missing**: CONTACT nav-link should be in the nav-group between SERVICES and the CTA button.

**Root Cause**: OCR detected CONTACT as button elements rather than nav-link text, and the role assignment logic did not recognize it as navigation.

**Should Be**: Three nav-links: ABOUT, SERVICES, CONTACT (as text links), plus one CONTACT CTA button.

### 5. Wrong Page Hierarchy

**Evidence**: The schema tree shows:
```
root-0: page-root
  container-1: page
    container-2: header
      region-24: nav-group (with ABOUT, SERVICES only)
      button-19: CONTACT (duplicate 1)
      button-21: CONTACT (duplicate 2)
    container-3: region (empty generic container)
    container-4: main
      container-5: media-region (ecommerce-style structure)
        image-7: media
        region-30: media-thumbnail-strip (wrong for landing)
        image-31: thumbnail-image (wrong for landing)
      container-6: section (empty)
      region-25: hero-section (orphaned)
      text-10: copy (orphaned)
      text-16: copy (orphaned)
      region-26: services-section
      region-27: about-section (tiny bounds)
    region-28: contact-section (outside main)
    region-29: form (empty)
    container-9: footer
```

**Root Cause**: 
1. No canonical single-tree enforcement
2. Empty containers not removed
3. Media structures from ecommerce detection not suppressed for landing pages
4. Hero and other sections not properly parented
5. Contact section orphaned outside main

**Should Be**:
```
root-0: page-root
  container-1: page
    container-2: header
      text/logo: LOGO
      region-24: nav-group
        text-22: ABOUT (nav-link)
        text-23: SERVICES (nav-link)
        text-CONTACT: CONTACT (nav-link)
      button-19: CONTACT (single CTA)
    container-4: main
      region-25: hero-section
        text-15: HEADLINE
        text-copy: supporting paragraph
        button-11: GET STARTED
      region-26: services-section
        text-17: OUR SERVICES
        container-8: feature-card-grid
          feature-card (x3 if geometry supports)
      region-27: split-content-section
        [media + text columns]
      region-28: about-section
        text: ABOUT US
        text: about content
        region: map-region
      region-29: contact-section
        text: CONTACT US
        region-30: form
          input
          button: SEND
    container-9: footer (if source actually has footer)
```

### 6. Ecommerce Structures in Landing Page

**Evidence**: The schema contains:
- `media-thumbnail-strip` (region-30)
- `thumbnail-image` nodes (image-32, image-31)
- Large `media-region` with product-like layout

**Root Cause**: The CV/ROI recovery system is detecting repeated rectangular contours and assuming ecommerce thumbnail/gallery patterns. The category-aware filtering is not working to suppress these structures for landing pages.

**Should Be**: These ecommerce-specific structures should be suppressed when page category is landing, unless there's clear evidence of actual product cards.

### 7. Empty Containers and Regions

**Evidence**: 
- container-3: region (empty, 911x1412 bounds)
- container-6: section (empty, 491x784 bounds)
- region-27: about-section (tiny 170x25 bounds, essentially just the heading)
- region-29: form (empty)

**Root Cause**: The macro-layout pass creates structural containers based on geometry but doesn't clean up empty ones. The canonical reconciliation should remove empty semantic containers when their children have been assigned elsewhere.

**Should Be**: Empty containers should be removed, and meaningful content should be properly parented.

### 8. Orphaned Content

**Evidence**: 
- hero-section (region-25) is a direct child of main, not properly grouped
- text-10 and text-16 (copy) are direct children of main, not in hero-section
- contact-section (region-28) is outside main, at page level

**Root Cause**: Parent-child assignment is based on simple containment heuristics that don't account for reading order and semantic grouping. The canonical reconciliation should reparent orphaned content into appropriate sections.

**Should Be**: All content should be properly nested within semantic sections.

### 9. Missing Section Boundaries

**Evidence**: The source image clearly has:
- Services section with three feature cards
- Split content section with media + text
- About section with map
- Contact form with input and SEND button

**Current Schema**: Missing most of these structures, has empty placeholders instead.

**Root Cause**: The CV detection is not recognizing these semantic sections, and without Gemini vision merge, there's no semantic interpretation to fill in the gaps.

**Should Be**: Proper section detection based on visual patterns and reading order.

### 10. Layout Plan Not Reflecting Source

**Evidence**: `layout-plan.json` shows:
- pageCategory: "generic" (should be "landing")
- Missing major zones for services, split-content, about with map
- hero-section with wrong bounds
- contact-section at wrong position

**Root Cause**: Layout plan is generated from the corrupted canonical schema, not from source evidence.

**Should Be**: Layout plan should reflect the actual visual structure of the source image.

## System Issues

### 1. No Single-Tree Enforcement

**Problem**: The pipeline allows multiple competing page trees to coexist:
- CV/OCR macro-layout tree
- Gemini vision tree (when it works)
- Old local schema
- Merged schema (when merge works)

**Should Be**: Exactly one canonical page tree after reconciliation.

### 2. No Category-Aware Filtering

**Problem**: Ecommerce structures (thumbnail strips, product cards) are not suppressed for landing pages.

**Should Be**: Category-aware role filtering based on detected page type.

### 3. No Duplicate Suppression

**Problem**: Nodes with highly overlapping bounds (>0.78 IoU) and compatible roles are not being merged.

**Should Be**: Aggressive duplicate suppression with evidence merging.

### 4. No Parent-Child Validation

**Problem**: Children can exist outside their semantic parents, and empty parents can exist alongside their children.

**Should Be**: Strict parent-child validation and reparenting.

### 5. No Reading Order Enforcement

**Problem**: Nodes are not sorted by reading order, leading to wrong visual sequence.

**Should Be**: Reading order should determine child ordering and section boundaries.

### 6. No Geometry Validation

**Problem**: Bounds can be invalid (negative, zero-sized, outside canvas) without repair.

**Should Be**: Geometry validation and repair before reconciliation.

## Pipeline Failures

### Vision Provider Status
- ✅ Gemini smoke test: HTTP 200 success
- ✅ schemaValid: true
- ✅ geminiResponseValid: true
- ✅ internalSchemaValid: true
- ✅ schemaAdapterUsed: true
- ❌ vision-merge.json: "used": false
- ❌ duplicate-reconciliation.json: empty array

### Schema to Code Generation
- ✅ schemaToCodeCoverage: 1.0 (but this is node preservation, not fidelity)
- ❌ canonicalTreeValidity: not enforced
- ❌ duplicateNodeRate: not properly measured
- ❌ sourceStructureCoverage: 0.25 (very poor)
- ❌ visual comparison: pending

## Required Fixes

### Immediate Priority

1. **Fix Vision Merge**: Ensure Gemini vision data is actually passed to and processed by `merge_with_cv.py`
2. **Implement Duplicate Suppression**: Fix the duplicate detection logic in `merge_with_cv.py`
3. **Enforce Single Tree**: Add validation to ensure exactly one page root and one coherent hierarchy
4. **Add Category Awareness**: Suppress domain-specific nodes based on detected page category
5. **Fix Parent-Child Assignment**: Implement proper reparenting of orphaned content
6. **Remove Empty Containers**: Clean up empty semantic containers
7. **Fix Layout Plan**: Generate layout from canonical schema, not corrupted intermediate data

### Secondary Priority

8. **Improve Section Detection**: Better CV detection of semantic sections
9. **Add Reading Order**: Sort nodes by reading order before layout planning
10. **Geometry Validation**: Add bounds validation and repair
11. **Role Normalization**: Map equivalent roles to canonical forms
12. **Evidence Merging**: Combine evidence from multiple sources properly

## Conclusion

The root cause is a complete failure of the canonical reconciliation pipeline. The system is collecting good CV/OCR data and getting valid Gemini vision responses, but the merge and duplicate suppression steps are not working. This results in a schema that contains:
- Duplicate nodes (multiple CONTACT buttons)
- Wrong structures (ecommerce in landing page)
- Empty containers
- Orphaned content
- Missing sections
- Wrong hierarchy

The fix requires rebuilding the canonical reconciliation to enforce a single coherent page tree with proper duplicate suppression, category-aware filtering, and parent-child validation.