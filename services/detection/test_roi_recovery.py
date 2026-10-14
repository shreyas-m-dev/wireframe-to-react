from __future__ import annotations
import sys
from pathlib import Path
import numpy as np
sys.path.insert(0,str(Path(__file__).resolve().parent))
from roi_recovery import group_repeated

def candidate(x,y,w=30,h=20,clipped=False): return {"x":x,"y":y,"width":w,"height":h,"clipped":clipped}
def main():
 h=group_repeated([candidate(10,20),candidate(50,20),candidate(90,20)]); assert h and h['orientation']=='horizontal' and h['itemCount']==3
 v=group_repeated([candidate(10,20),candidate(10,55),candidate(10,90,clipped=True)]); assert v and v['orientation']=='vertical' and len(v['clippedItems'])==1
 g=group_repeated([candidate(10,10),candidate(50,10),candidate(10,45),candidate(50,45)]); assert g and g['orientation']=='grid'
 print('PASS: ROI repeated geometry horizontal/vertical/grid/clipping')
if __name__=='__main__': main()
