from PIL import Image
import numpy as np, json

b = np.array(Image.open('base128.png').convert('RGB')).astype(int)
H, W, _ = b.shape
FLOOR_Y = 49

BOX = {
 'bd-frames':   (69,7,101,24),
 'bd-shelf':    (53,9,71,16),
 'bd-bed':      (77,29,121,49),
 'bd-fan':      (116,29,127,49),
 'bd-nightstand':(64,36,80,49),
 'bd-desk':     (10,32,53,49),
 'bd-chair':    (27,40,43,49),
 'bd-laptop':   (30,26,43,35),
 'bd-deskplant':(13,26,23,36),
 'bd-rug':      (36,51,98,69),
}
GLASS = [(22,7,36,17),(38,7,54,17),(22,19,36,31),(38,19,54,31)]

sprite=np.zeros((H,W),bool); glass=np.zeros((H,W),bool)
for (x0,y0,x1,y1) in BOX.values(): sprite[y0:y1+1,x0:x1+1]=True
for (x0,y0,x1,y1) in GLASS: glass[y0:y1+1,x0:x1+1]=True

shell=b.copy()
for y in range(H):
    cleanxs=[x for x in range(W) if not sprite[y,x] and not glass[y,x]]
    if not cleanxs: continue
    for x in range(W):
        if sprite[y,x] or glass[y,x]:
            shell[y,x]=b[y,min(cleanxs,key=lambda c:abs(c-x))]

def hexc(c): return '#%02x%02x%02x'%(int(c[0]),int(c[1]),int(c[2]))
def emit(getcol,x0,y0,x1,y1):
    out=[]
    for y in range(y0,y1+1):
        run=None
        for x in range(x0,x1+1):
            col=getcol(x,y)
            if col is None:
                if run: out.append(run); run=None
                continue
            hc=hexc(col)
            if run and run[2]==hc: run[1]+=1
            else:
                if run: out.append(run)
                run=[x,1,hc,y]
        if run: out.append(run)
    return [[r[0],r[3],r[1],1,r[2]] for r in out]

groups={}
for gid,(x0,y0,x1,y1) in BOX.items():
    groups[gid]=emit(lambda x,y:(b[y,x] if ((b[y,x]-shell[y,x])**2).sum()>26*26 else None),x0,y0,x1,y1)
groups['bd-wall']=emit(lambda x,y:(None if glass[y,x] else shell[y,x]),0,0,W-1,FLOOR_Y-1)
groups['bd-floor']=emit(lambda x,y:shell[y,x],0,FLOOR_Y,W-1,H-1)

# JS 모듈 출력
Z=['bd-wall','bd-floor','bd-frames','bd-shelf','bd-bed','bd-fan','bd-nightstand','bd-rug','bd-desk','bd-laptop','bd-deskplant','bd-chair']
PROPS=['bd-desk','bd-chair','bd-laptop','bd-deskplant','bd-nightstand','bd-bed','bd-fan','bd-rug','bd-shelf','bd-frames']
with open('geom-art.js','w') as f:
    f.write('// 레퍼런스(times/day.png)를 128×72 로 내려 양자화(40색)·셸인페인팅으로 추출.\n')
    f.write('// tools/extract3.py 산출물. 손편집 금지 — 재추출로 갱신.\n')
    f.write('export const BD_ART = ')
    f.write(json.dumps(groups, separators=(',',':')))
    f.write(';\n')
    f.write('export const BD_ART_Z = %s;\n'%json.dumps(Z))
    f.write('export const BD_ART_PROPS = %s;\n'%json.dumps(PROPS))
    # 유리 구멍(절차 하늘 자리)
    f.write('export const BD_GLASS = %s;\n'%json.dumps(GLASS))
print({k:len(v) for k,v in groups.items()})
print('geom-art.js written')
