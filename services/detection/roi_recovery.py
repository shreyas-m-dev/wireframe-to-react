"""Reusable macro-region ROI recovery and geometry-only repeated grouping."""
from __future__ import annotations
from dataclasses import dataclass
import cv2
import numpy as np

def _box(x,y,w,h): return {"x":float(x),"y":float(y),"width":float(w),"height":float(h)}
def _inside(a,b): return a["x"]>=b["x"] and a["y"]>=b["y"] and a["x"]+a["width"]<=b["x"]+b["width"] and a["y"]+a["height"]<=b["y"]+b["height"]
def _iou(a,b):
 x1,y1=max(a['x'],b['x']),max(a['y'],b['y']); x2,y2=min(a['x']+a['width'],b['x']+b['width']),min(a['y']+a['height'],b['y']+b['height']); inter=max(0,x2-x1)*max(0,y2-y1); return inter/(a['width']*a['height']+b['width']*b['height']-inter or 1)

def recover_roi(gray: np.ndarray, parent: dict, existing: list[dict]) -> dict:
    """Recover local rectangles within a parent ROI in page coordinates."""
    H,W=gray.shape[:2]; x=max(0,int(parent['x'])); y=max(0,int(parent['y'])); w=min(W-x,int(parent['width'])); h=min(H-y,int(parent['height']))
    roi=gray[y:y+h,x:x+w]; result={"parentRole":parent.get("role"),"roiBounds":_box(x,y,w,h),"candidatesBeforeSuppression":[],"accepted":[],"rejected":[]}
    if roi.size==0: result['rejected'].append({'reason':'empty-roi'}); return result
    edges=cv2.Canny(cv2.GaussianBlur(roi,(3,3),0),40,120); edges=cv2.dilate(edges,np.ones((2,2),np.uint8),1)
    contours,_=cv2.findContours(edges,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
    for contour in contours:
        lx,ly,lw,lh=cv2.boundingRect(contour)
        if lw<max(12,w*.035) or lh<max(12,h*.035): continue
        candidate={**_box(x+lx,y+ly,lw,lh),"localBounds":_box(lx,ly,lw,lh),"parentRegionId":parent.get('id'),"recoveryStrategy":"roi-canny-contours","confidence":.55,"evidence":["local rectangular contour"],"uncertainty":None,"clipped":lx<=2 or ly<=2 or lx+lw>=w-2 or ly+lh>=h-2}
        result['candidatesBeforeSuppression'].append(candidate)
    for candidate in sorted(result['candidatesBeforeSuppression'],key=lambda q:q['width']*q['height'],reverse=True):
        if any(_iou(candidate, global_box)>.72 for global_box in existing): result['rejected'].append({"bounds":_box(candidate['x'],candidate['y'],candidate['width'],candidate['height']),"reason":"global-duplicate"}); continue
        if any(_iou(candidate, kept)>.65 for kept in result['accepted']): result['rejected'].append({"bounds":_box(candidate['x'],candidate['y'],candidate['width'],candidate['height']),"reason":"roi-duplicate"}); continue
        result['accepted'].append(candidate)
    return result

def group_repeated(candidates: list[dict]) -> dict | None:
    """Geometry-only grouping; supports variable row, column, and grid counts."""
    if len(candidates)<2: return None
    candidates=sorted(candidates,key=lambda q:(q['y'],q['x'])); widths=np.array([q['width'] for q in candidates]); heights=np.array([q['height'] for q in candidates])
    if widths.std()/max(widths.mean(),1)>.28 or heights.std()/max(heights.mean(),1)>.28: return None
    xs=np.array([q['x'] for q in candidates]); ys=np.array([q['y'] for q in candidates]); horizontal=ys.std()<heights.mean()*.35; vertical=xs.std()<widths.mean()*.35
    orientation='horizontal' if horizontal else 'vertical' if vertical else 'grid'
    cols=len(candidates) if horizontal else 1 if vertical else max(2,round(len(candidates)**.5)); rows=1 if horizontal else len(candidates) if vertical else int(np.ceil(len(candidates)/cols))
    gaps=np.diff(sorted(xs)) - widths.mean() if horizontal else np.diff(sorted(ys))-heights.mean() if vertical else np.array([])
    return {"orientation":orientation,"rowCount":rows,"columnCount":cols,"itemCount":len(candidates),"averageItemBounds":{"width":float(widths.mean()),"height":float(heights.mean())},"averageGap":float(gaps.mean()) if len(gaps) else None,"acceptedItems":candidates,"rejectedCandidates":[],"confidence":.65,"evidence":["similar ROI-local rectangles","alignment and size consistency"],"clippedItems":[q for q in candidates if q.get('clipped')]}

def recover_repeated_cards(gray: np.ndarray, parent: dict, heading: dict | None = None) -> dict:
    """Multi-pass, category-neutral low-contrast repeated-card recovery."""
    H,W=gray.shape; x,y=max(0,int(parent['x'])),max(0,int(parent['y'])); w,h=min(W-x,int(parent['width'])),min(H-y,int(parent['height']))
    if heading: y=max(y,int(heading['y']+heading['height'])); h=max(0,min(H-y,int(parent['y']+parent['height']-y)))
    roi=gray[y:y+h,x:x+w]; out={"roi":_box(x,y,w,h),"sourceRegionParent":parent.get('role'),"headingEvidence":heading,"passConfigurations":[],"rawCandidates":[],"groupClusters":[],"acceptedGroup":None,"acceptedCardCount":0,"rejectedCandidates":[],"uncertainty":None}
    if roi.size==0: out['uncertainty']='empty content ROI'; return out
    clahe=cv2.createCLAHE(clipLimit=2.5,tileGridSize=(8,8)).apply(roi); den=cv2.bilateralFilter(clahe,5,35,35)
    variants=[('pass-a-edges',cv2.morphologyEx(cv2.Canny(den,25,100),cv2.MORPH_CLOSE,np.ones((3,3),np.uint8))),('pass-b-adaptive',cv2.morphologyEx(cv2.adaptiveThreshold(den,255,cv2.ADAPTIVE_THRESH_GAUSSIAN_C,cv2.THRESH_BINARY_INV,31,5),cv2.MORPH_CLOSE,np.ones((3,3),np.uint8)))]
    # Projection pass supplies alignment evidence rather than fabricated boxes.
    vertical=(cv2.Canny(den,25,100)>0).mean(axis=0); out['projectionPeaks']=[int(i) for i,v in enumerate(vertical) if v>np.percentile(vertical,92)]
    for name,binary in variants:
        out['passConfigurations'].append({"name":name,"strategy":"CLAHE/bilateral + contour"})
        contours,_=cv2.findContours(binary,cv2.RETR_LIST,cv2.CHAIN_APPROX_SIMPLE)
        for c in contours:
            lx,ly,lw,lh=cv2.boundingRect(c)
            if lw<w*.07 or lh<h*.14: continue
            aspect=lw/max(lh,1); clipped=ly+lh>=h-3 or lx<=2 or lx+lw>=w-2
            candidate={**_box(x+lx,y+ly,lw,lh),"localBounds":_box(lx,ly,lw,lh),"sourcePasses":[name],"clipped":clipped,"features":{"aspect":aspect,"top":y+ly,"edgeDensity":float(binary[ly:ly+lh,lx:lx+lw].mean()/255)},"candidateScore":.45+(.1 if clipped else .2),"confidence":.55}
            out['rawCandidates'].append(candidate)
    # Merge duplicate evidence across passes and cluster row-aligned boxes.
    unique=[]
    for q in sorted(out['rawCandidates'],key=lambda z:-z['candidateScore']):
        same=next((u for u in unique if _iou(q,u)>.5),None)
        if same: same['sourcePasses']=sorted(set(same['sourcePasses']+q['sourcePasses'])); same['candidateScore']=max(same['candidateScore'],q['candidateScore'])+.08
        else: unique.append(q)
    group=group_repeated(unique)
    if group and group['itemCount']>=3:
        group['confidence']=min(.9,group['confidence']+.12*sum(len(q['sourcePasses'])>1 for q in group['acceptedItems']))
        group['evidence']+=['multi-pass contour consensus','projection alignment available']
        out['acceptedGroup']=group; out['acceptedCardCount']=group['itemCount']; out['groupClusters']=[group]
    else:
        out['rejectedCandidates']=[{"bounds":_box(q['x'],q['y'],q['width'],q['height']),"reason":"no 3-item size/alignment consensus"} for q in unique]
        out['uncertainty']='low-contrast candidates did not form a multi-signal repeated-card consensus'
    return out

def recover_regions(gray: np.ndarray, elements: list[dict], canvas: dict) -> tuple[list[dict],dict]:
    """Run generic plugins based on parent roles, returning new neutral nodes."""
    additions=[]; report={"regions":[],"repeatedGroups":[]}; parents=[e for e in elements if e.get('role') in {'gallery','media-region','related-products','repeated-region','main','section'}]
    for parent in parents:
        local=recover_roi(gray,parent,elements+additions); report['regions'].append(local); accepted=local['accepted']
        if parent.get('role') in {'gallery','media-region'}:
            below=[q for q in accepted if q['y']>parent['y']+parent['height']*.62 and q['width']<parent['width']*.42]
            repeat=group_repeated(below)
            if repeat:
                role='thumbnail-gallery' if parent.get('role')=='gallery' else 'media-thumbnail-strip'
                bx=min(q['x'] for q in below); by=min(q['y'] for q in below); bx2=max(q['x']+q['width'] for q in below); by2=max(q['y']+q['height'] for q in below)
                additions.append({"type":"region","role":role,"confidence":repeat['confidence'],**_box(bx,by,bx2-bx,by2-by),"label":None,"recovery":repeat})
                for q in below: additions.append({"type":"image","role":"thumbnail-image","confidence":q['confidence'],**_box(q['x'],q['y'],q['width'],q['height']),"label":None,"recovery":q})
                report['repeatedGroups'].append({"parentRole":parent.get('role'),"semanticRole":role,**repeat})
        if parent.get('role') in {'related-products','repeated-region','section'}:
            heading=next((e for e in elements if e.get('role')=='section-heading' and _inside(e,parent)),None)
            diagnosis=recover_repeated_cards(gray,parent,heading); report.setdefault('cardDiagnostics',[]).append(diagnosis)
            repeat=diagnosis.get('acceptedGroup') or group_repeated([q for q in accepted if q['width']>parent['width']*.08 and q['height']>parent['height']*.18])
            if repeat:
                role='product-card-grid' if parent.get('role')=='related-products' else 'repeated-card-grid'
                bx=min(q['x'] for q in repeat['acceptedItems']); by=min(q['y'] for q in repeat['acceptedItems']); bx2=max(q['x']+q['width'] for q in repeat['acceptedItems']); by2=max(q['y']+q['height'] for q in repeat['acceptedItems'])
                additions.append({"type":"region","role":role,"confidence":repeat['confidence'],**_box(bx,by,bx2-bx,by2-by),"label":None,"recovery":repeat})
                for q in repeat['acceptedItems']: additions.append({"type":"region","role":"product-card" if role=='product-card-grid' else 'card',"confidence":q['confidence'],**_box(q['x'],q['y'],q['width'],q['height']),"label":None,"recovery":q})
                report['repeatedGroups'].append({"parentRole":parent.get('role'),"semanticRole":role,**repeat})
    return additions,report
