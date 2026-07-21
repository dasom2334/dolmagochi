# 침실 정적 아트 추출 — SCENE-RULES.md 준수.
# times/day.png → 128×72 다운샘플 → **디라이팅(무광원 알베도)** → 양자화 → 셸인페인팅 → 레이어 rect.
# 디라이팅을 반드시 거친다: 조명이 구워진 채 쓰면 오버레이·광원과 이중으로 겹친다(§6).
from PIL import Image
import numpy as np, json, os

HERE=os.path.dirname(__file__)
REF=os.path.join(HERE,'..','..','reference','bedroom','times','day.png')
a0=np.array(Image.open(REF).convert('RGB'))
small=np.array(Image.fromarray(a0).resize((128,72), Image.BOX)).astype(float)
H,W,_=small.shape

def box_blur(a,r):
    for ax in (0,1):
        pad=[(r,r) if i==ax else (0,0) for i in range(2)]
        if a.ndim==3: pad+=[(0,0)]
        ap=np.pad(a,pad,mode='edge'); c=np.cumsum(ap,axis=ax); n=2*r+1
        s0=[slice(None)]*a.ndim; s1=[slice(None)]*a.ndim
        s0[ax]=slice(n-1,None); s1[ax]=slice(None,-n)
        z=list(c.shape); z[ax]=1
        a=(c[tuple(s0)]-np.concatenate([np.zeros(z),c[tuple(s1)]],axis=ax))/n
    return a

# 1) 휘도 플랫필드 — 광 웅덩이·글로우·비네트 제거, 색조 보존 (delight.py)
lum=small.mean(2); L=lum.copy()
for _ in range(3): L=box_blur(L,10)
L=np.maximum(L,25)
albedo=small*(L.mean()*1.12/L)[:,:,None]
# 2) 웜캐스트 부분 중화 (0.5 — 과하면 파랑이 초록으로 튄다)
Wc=albedo.reshape(-1,3).mean(0); Wc=Wc/Wc.mean()
albedo=albedo/(Wc[None,None,:]**0.5)
# 3) 채도 소폭 감소
l2=albedo.mean(2,keepdims=True); albedo=l2+(albedo-l2)*0.88
# 4) punch — 디라이팅으로 눌린 대비·채도 복원 (거실 §4.6/§22). 거실과 퀄리티 맞춤.
#    명도 S커브(중간 기준 벌림)로 대비, 채도 부스트. 발광체 없으니 전체 적용.
alb=albedo/255.0
lum=alb.mean(2,keepdims=True)
lum2=np.clip(0.5+(lum-0.5)*1.24, 0, 1)                 # 명도 대비 ×1.24 (그림자 과증폭 방지)
# 어두운 구석을 살짝 들어올린다(거실처럼 방 전체가 죽지 않게) — 감마 0.92
lum2=lum2**0.92
alb=alb*(lum2/np.maximum(lum,1e-4))
l3=alb.mean(2,keepdims=True)
alb=l3+(alb-l3)*1.38                                    # 채도 ×1.38 (초록 튐 완화)
albedo=np.clip(alb*255,0,255)                           # float 유지 — 아래 디셰이드까지

# 4.3) 소품 디셰이드 — **질감만 남기고 구운 창햇빛 명암 제거**(사용자 지시 #2).
#   러그·침대는 레퍼런스에서 창햇빛이 대각선으로 구워져 있다. 휘도 플랫필드(1단계)는
#   휘도만 펴서 warm/cool **색조** 그라디언트가 남고, punch가 그걸 키웠다.
#   여기서 소품 bbox마다 **채널별** 저주파 플랫필드로 나눈다:
#     flat[c] = px[c] * mean[c] / blur[c]   (blur = 소품 크기 반경)
#   · 저주파(대각선 명암·색조) → 나눠서 평탄화
#   · 고주파(무늬·결)·외곽선 → 반경보다 작아 그대로 보존
def deshade(a, box, rad=8):
    x0,y0,x1,y1=box
    reg=a[y0:y1+1, x0:x1+1].astype(float)
    bl=reg.copy()
    for _ in range(3): bl=box_blur(bl, rad)
    m=reg.reshape(-1,3).mean(0)
    reg=reg*(m[None,None,:]/np.maximum(bl,1.0))
    a[y0:y1+1, x0:x1+1]=np.clip(reg,0,255)
    return a
for box in [(77,29,121,49)]:                            # bd-bed (러그는 절차 생성으로 대체됨)
    albedo=deshade(albedo, box)
albedo=albedo.astype('uint8')
Image.fromarray(albedo).resize((128*6,72*6),Image.NEAREST).save(os.path.join(HERE,'albedo_x6.png'))

# 4) 양자화 40색
q=Image.fromarray(albedo).quantize(colors=40,method=Image.MEDIANCUT).convert('RGB')
b=np.array(q).astype(int)

# 4.5) 엣지보존 디테일 감소 — **외곽선은 그대로, 면 속 색만 뭉갠다**(사용자 지시).
#   median/blur 는 외곽선을 무너뜨린다. 대신 "고립 스펙클"만 제거한다:
#   8이웃 중 THR개 이상이 한 색으로 일치하고 중심이 그와 다르면 그 색으로 스냅.
#   · 평탄한 면 속 홀로 튄 노이즈 → 다수색으로 흡수(면 색 단순화)
#   · 외곽선/1px 선분 → 선을 따라 같은 색 이웃이 있어 THR을 못 넘겨 **보존**
def despeckle(a, passes=2, thr=5):
    H,W,_=a.shape
    for _ in range(passes):
        out=a.copy()
        for y in range(H):
            for x in range(W):
                cnt={}
                for dy in (-1,0,1):
                    for dx in (-1,0,1):
                        if dx==0 and dy==0: continue
                        ny,nx=y+dy,x+dx
                        if 0<=ny<H and 0<=nx<W:
                            k=(a[ny,nx,0],a[ny,nx,1],a[ny,nx,2])
                            cnt[k]=cnt.get(k,0)+1
                if not cnt: continue
                mk=max(cnt,key=cnt.get)
                if cnt[mk]>=thr and mk!=(a[y,x,0],a[y,x,1],a[y,x,2]):
                    out[y,x]=mk
        a=out
    return a
b=despeckle(b)
Image.fromarray(b.astype('uint8')).save(os.path.join(HERE,'base128.png'))
FLOOR_Y=49

BOX={'bd-frames':(69,7,101,24),'bd-shelf':(53,9,71,16),'bd-bed':(77,29,121,49),
     'bd-fan':(116,29,127,49),'bd-nightstand':(64,36,80,49),'bd-desk':(10,32,53,49),
     'bd-chair':(27,40,43,49),'bd-laptop':(30,26,43,35),'bd-deskplant':(13,26,23,36),
     'bd-rug':(36,51,98,69)}
GLASS=[(22,7,36,17),(38,7,54,17),(22,19,36,31),(38,19,54,31)]

sprite=np.zeros((H,W),bool); glass=np.zeros((H,W),bool)
for (x0,y0,x1,y1) in BOX.values(): sprite[y0:y1+1,x0:x1+1]=True
for (x0,y0,x1,y1) in GLASS: glass[y0:y1+1,x0:x1+1]=True
shell=b.copy()
for y in range(H):
    cx=[x for x in range(W) if not sprite[y,x] and not glass[y,x]]
    if not cx: continue
    for x in range(W):
        if sprite[y,x] or glass[y,x]: shell[y,x]=b[y,min(cx,key=lambda c:abs(c-x))]

def hexc(c): return '#%02x%02x%02x'%(int(c[0]),int(c[1]),int(c[2]))
def emit(get,x0,y0,x1,y1):
    o=[]
    for y in range(y0,y1+1):
        run=None
        for x in range(x0,x1+1):
            col=get(x,y)
            if col is None:
                if run:o.append(run);run=None
                continue
            hc=hexc(col)
            if run and run[2]==hc: run[1]+=1
            else:
                if run:o.append(run)
                run=[x,1,hc,y]
        if run:o.append(run)
    return [[r[0],r[3],r[1],1,r[2]] for r in o]

groups={}
for gid,(x0,y0,x1,y1) in BOX.items():
    groups[gid]=emit(lambda x,y:(b[y,x] if ((b[y,x]-shell[y,x])**2).sum()>26*26 else None),x0,y0,x1,y1)
groups['bd-wall']=emit(lambda x,y:(None if glass[y,x] else shell[y,x]),0,0,W-1,FLOOR_Y-1)
groups['bd-floor']=emit(lambda x,y:shell[y,x],0,FLOOR_Y,W-1,H-1)

Z=['bd-wall','bd-floor','bd-frames','bd-shelf','bd-bed','bd-fan','bd-nightstand','bd-rug','bd-desk','bd-laptop','bd-deskplant','bd-chair']
PROPS=['bd-desk','bd-chair','bd-laptop','bd-deskplant','bd-nightstand','bd-bed','bd-fan','bd-rug','bd-shelf','bd-frames']
with open(os.path.join(HERE,'..','geom-art.js'),'w') as f:
    f.write('// 레퍼런스(times/day.png) 128×72 → 디라이팅(무광원 알베도) → 양자화 → 셸인페인팅 추출.\n')
    f.write('// tools/extract.py 산출물. 손편집 금지 — 재추출로 갱신. SCENE-RULES.md 준수.\n')
    f.write('export const BD_ART = '+json.dumps(groups,separators=(',',':'))+';\n')
    f.write('export const BD_ART_Z = '+json.dumps(Z)+';\n')
    f.write('export const BD_ART_PROPS = '+json.dumps(PROPS)+';\n')
    f.write('export const BD_GLASS = '+json.dumps(GLASS)+';\n')
print('albedo wall:',albedo[12,100],'floor:',albedo[60,110],'bed:',albedo[36,96])
print('done', {k:len(v) for k,v in groups.items()})
