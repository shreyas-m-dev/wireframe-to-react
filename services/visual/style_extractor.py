"""Local, deterministic visual-style evidence extraction.

This is intentionally palette/geometry analysis rather than a design-template
lookup: monochrome wireframes receive an accessible neutral token plan and
colour screenshots preserve a sampled accent when it has adequate contrast.
"""
from __future__ import annotations
from pathlib import Path
import cv2
import numpy as np

def _hex(bgr): return "#{:02x}{:02x}{:02x}".format(int(bgr[2]), int(bgr[1]), int(bgr[0]))
def _luminance(rgb):
    values=[]
    for c in rgb:
        v=c/255; values.append(v/12.92 if v<=.04045 else ((v+.055)/1.055)**2.4)
    return .2126*values[0]+.7152*values[1]+.0722*values[2]
def _contrast(a,b):
    return (max(_luminance(a),_luminance(b))+.05)/(min(_luminance(a),_luminance(b))+.05)

def extract_style(path: str | Path) -> dict:
    image=cv2.imread(str(path), cv2.IMREAD_COLOR)
    if image is None: raise ValueError("OpenCV could not decode image for style extraction")
    h,w=image.shape[:2]; sample=cv2.resize(image,(min(240,w),min(240,h)),interpolation=cv2.INTER_AREA)
    pixels=sample.reshape((-1,3)).astype(np.float32); _,labels,centers=cv2.kmeans(pixels,5,None,(cv2.TERM_CRITERIA_EPS+cv2.TERM_CRITERIA_MAX_ITER,24,1),4,cv2.KMEANS_PP_CENTERS)
    counts=np.bincount(labels.ravel(),minlength=len(centers)); ranked=centers[np.argsort(counts)[::-1]]
    gray=cv2.cvtColor(sample,cv2.COLOR_BGR2GRAY); saturation=cv2.cvtColor(sample,cv2.COLOR_BGR2HSV)[:,:,1]
    colorful=ranked[np.argmax([np.mean(cv2.cvtColor(np.uint8([[c]]),cv2.COLOR_BGR2HSV)[0,0,1]) for c in ranked])]
    dark=np.array([25,35,45]); light=np.array([255,255,255]); bg=ranked[0]
    is_dark=_luminance(bg[::-1])<.35; primary=colorful if np.mean(saturation)>20 else np.array([219,115,37]) # accessible blue in BGR
    if _contrast(primary[::-1], (light if not is_dark else dark))<3: primary=np.array([219,115,37])
    edges=cv2.Canny(gray,60,140); density=float(np.mean(edges>0));
    monochrome=float(np.std(saturation))<12 or float(np.mean(saturation))<16
    return {"version":1,"source":"local-image-analysis","image":{"width":w,"height":h},"confidence":.72,
      "dominantColors":[_hex(c) for c in ranked],"monochrome":monochrome,"edgeDensity":round(density,4),
      "themeHints":{"mode":"dark" if is_dark else "light","dense":density>.12,"cornerRadius":"12px","shadow":"subtle"},
      "themeTokenPlan":{"mode":"dark" if is_dark else "light","colors":{"background":"#111827" if is_dark else _hex(bg),"surface":"#1f2937" if is_dark else "#f8fafc","text":"#f9fafb" if is_dark else "#1f2937","mutedText":"#cbd5e1" if is_dark else "#64748b","primary":_hex(primary),"primaryContrast":"#ffffff","border":"#475569" if is_dark else "#d1d5db"},"radius":{"sm":"8px","md":"12px","lg":"18px"},"spacing":{"section":"72px","content":"24px","grid":"24px"},"typography":{"headingFont":"system-ui","bodyFont":"system-ui","heroScale":"clamp(2.25rem, 5vw, 4.5rem)"},"layout":{"maxWidth":"1200px","density":"compact" if density>.12 else "comfortable"}}}
