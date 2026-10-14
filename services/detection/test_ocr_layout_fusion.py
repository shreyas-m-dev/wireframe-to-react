"""Generalization tests: fusion must not turn every layout into ecommerce."""
from __future__ import annotations
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
from ocr_layout_fusion import fuse_layout_evidence

def el(kind, x, y, w, h, role=None, label=None):
    return {"type":kind,"x":x,"y":y,"width":w,"height":h,"confidence":.8,"role":role,"label":label}

def test_login_stays_generic():
    items=[el("container",0,0,800,600,"page"),el("container",0,60,800,500,"main"),el("input",240,180,320,40,label="Email"),el("input",240,240,320,40,label="Password"),el("button",240,300,320,40,label="Sign in")]
    fused=fuse_layout_evidence(items,{"lines":[]}, {"width":800,"height":600})
    assert not any(x.get("role") in {"product-area","product-detail","related-products","product-card-grid"} for x in fused)

def test_dashboard_stays_generic():
    items=[el("container",0,0,1200,800,"page"),el("container",0,80,1200,650,"main"),el("container",0,80,250,650,"sidebar"),el("container",270,100,900,300),el("container",270,430,260,220),el("container",560,430,260,220)]
    fused=fuse_layout_evidence(items,{"lines":[]}, {"width":1200,"height":800})
    assert not any(x.get("role") == "product-area" for x in fused)

if __name__ == "__main__":
    test_login_stays_generic(); test_dashboard_stays_generic(); print("PASS: OCR fusion generalizes beyond ecommerce")
