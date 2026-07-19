import numpy as np, colorsys, sys

GRID = sys.argv[1] if len(sys.argv)>1 else 'refgrid.npy'
SUF  = sys.argv[2] if len(sys.argv)>2 else ''
g = np.load(GRID).astype(int)
g0 = np.load('refgrid.npy').astype(int)   # 원본(발광체 마스크·색 추출용)
GY, GX = 72, 96

def hx(c): return f"#{int(c[0]):02x}{int(c[1]):02x}{int(c[2]):02x}"

def kmeans(px, k, seed=3):
    px = np.asarray(px, float)
    rng = np.random.RandomState(seed)
    C = [px[rng.randint(len(px))]]
    for _ in range(k-1):  # kmeans++
        d = np.min([( (px-c)**2 ).sum(1) for c in C], axis=0)
        C.append(px[np.argmax(d)])
    C = np.array(C)
    for _ in range(60):
        a = ((px[:,None,:]-C[None])**2).sum(-1).argmin(1)
        for i in range(k):
            m = px[a==i]
            if len(m): C[i] = m.mean(0)
    order = np.argsort(C.sum(1))
    remap = np.zeros(k,int); remap[order]=np.arange(k)
    return C[order], remap[a]

# 라운드 코너 흰색 유출 정리
for y in range(GY):
    for x in range(GX):
        if (y<3 or y>68 or x<3 or x>92) and g[y,x].mean()>150:
            sx = 5 if x<48 else 90
            sy = 2 if y<36 else 69
            g[y,x] = g[sy,sx]

# ---------- 마스크 정의 ----------
layer = np.full((GY,GX), 'static', dtype=object)

WIN = (27,66,4,33)  # x0,x1,y0,y1 창 내부
for y in range(4,34):
    for x in range(27,67):
        if 46<=x<=47 or y==21: continue      # 멀리언은 static
        layer[y,x]='scene'

# 나무는 색 검출로 추출하지 않는다 — 언덕(회보라) 셀이 folia 조건에 오염됨.
# 대신 아래에서 완전형(창밖 가려진 부분 포함)으로 수작화 방출.

# 해
for y in range(12,21):
    for x in range(50,63):
        if layer[y,x]=='scene':
            r,gr,b=g0[y,x]
            if r>200 and gr>165: layer[y,x]='sun'

# 돌 (실루엣 수동)
ORB = {26:(54,60),27:(53,61),28:(53,62),29:(53,63),30:(53,64),31:(52,64),
       32:(51,64),33:(51,65),34:(52,64),35:(51,63)}
for y,(x0,x1) in ORB.items():
    for x in range(x0,x1+1): layer[y,x]='orb'

# 캐비닛(창 밑 선반) 제거 → 벽으로
for y in range(38,49):
    for x in range(47,71): layer[y,x]='cabinet'

# 벽난로 불꽃
for y in range(39,48):
    for x in range(6,18):
        r,gr,b=g0[y,x]
        if r>170 and r-b>80: layer[y,x]='fire'

# 촛불
for y in range(23,32):
    for x in range(3,8):
        d = np.abs(g0[y,x]-g0[26,10]).sum()
        if d>60: layer[y,x]='candle'

# 창턱 화분
for y in range(29,36):
    for x in range(28,33):
        r,gr,b=g[y,x]
        if (gr>=b and gr>45 and r<200) or (r>gr>b and r-b>40 and y>=32):
            layer[y,x]='plant'

# 러그 (사다리꼴)
for y in range(53,67):
    t=(y-53)/13
    x0=round(30-8*t); x1=round(66+5*t)
    for x in range(x0,x1+1): layer[y,x]='rug'

# 바닥 소품: 책 / 글로우 큐브 / 상자
for y in range(57,62):
    for x in range(10,22):
        r,gr,b=g[y,x]
        if r>140: layer[y,x]='props'
for y in range(58,64):
    for x in range(24,30):
        r,gr,b=g[y,x]
        if r>140: layer[y,x]='props'
for y in range(43,49):
    for x in range(21,29):
        r,gr,b=g[y,x]
        if r>75 and r>gr>b and gr>40: layer[y,x]='props'

# 책장 1단 책 6권
BOOKS=[(80,81),(82,83),(84,85),(86,87),(88,89),(90,92)]
for y in range(18,25):
    for bi,(x0,x1) in enumerate(BOOKS):
        for x in range(x0,x1+1):
            r,gr,b=g[y,x]
            if (r+gr+b)/3>55: layer[y,x]=f'book{bi+1}'

# ---------- 인페인팅 ----------
SPRITES={'sun','orb','fire','candle','plant','rug','props','cabinet'}|{f'book{i}' for i in range(1,7)}
base_of={}  # (y,x) -> 배경 소스 셀
for y in range(GY):
    for x in range(GX):
        if layer[y,x] in SPRITES:
            if layer[y,x]=='cabinet':
                src_pool=[xx for xx in range(GX) if layer[y,xx]=='static' and (xx>70 or xx<25) and y<49]
            elif layer[y,x]=='sun' or (layer[y,x]=='orb' and y<=33):
                src_pool=[xx for xx in range(27,67) if layer[y,xx]=='scene']
            else:
                src_pool=[xx for xx in range(GX) if layer[y,xx]=='static']
            if src_pool:
                sx=min(src_pool,key=lambda xx:abs(xx-x))
                base_of[(y,x)]=(y,sx)

# ---------- 리전별 양자화 ----------
def cells_of(name):
    return [(y,x) for y in range(GY) for x in range(GX) if layer[y,x]==name]

regions={}
def quant(name,cells,k,prefix,srcg=None):
    if not cells:
        regions[name]=dict(cells=[],C=np.zeros((k,3)),a=np.array([],int),prefix=prefix); return
    sg = g if srcg is None else srcg
    px=[sg[y,x] for y,x in cells]
    k=min(k,len(px))
    C,a=kmeans(px,k)
    regions[name]=dict(cells=cells,C=C,a=a,prefix=prefix)

sky_cells=[(y,x) for y,x in cells_of('scene') if y<26]
hill_cells=[(y,x) for y,x in cells_of('scene') if y>=26]
quant('sky',sky_cells,7,'k')
quant('hill',hill_cells,4,'h')
quant('sun',cells_of('sun'),2,'sun',srcg=g0)
# orb는 추출하지 않는다(비원형 왜곡) — 아래에서 절차 생성. layer['orb']는 창턱 인페인팅용으로만 유지.
quant('rug',cells_of('rug'),5,'rg')
quant('fire',cells_of('fire'),4,'f',srcg=g0)
quant('candle',cells_of('candle'),3,'cd',srcg=g0)
quant('plant',cells_of('plant'),3,'pl')
quant('props',cells_of('props'),5,'pp')
for i in range(1,7):
    quant(f'book{i}',cells_of(f'book{i}'),2,f'b{i}x')
static_cells=cells_of('static')
quant('static',static_cells,26,'s')

# ---------- 배경(인페인트 포함) 톤 결정 ----------
cell_var={}   # (y,x) -> css var  (배경 레이어)
def var_for(name,idx): return f"--{regions[name]['prefix']}{idx}"
for name in regions:
    reg=regions[name]
    for i,(y,x) in enumerate(reg['cells']):
        if name in ('static','sky','hill'):
            cell_var[(y,x)]=var_for(name,reg['a'][i])
# 인페인트: 소스 셀의 배경 var 복사
for (y,x),(sy,sx) in base_of.items():
    if (sy,sx) in cell_var: cell_var[(y,x)]=cell_var[(sy,sx)]
# 남은 구멍은 인접 행 복사
for y in range(GY):
    for x in range(GX):
        if (y,x) not in cell_var:
            for dy in (1,-1,2,-2,3,-3):
                if (y+dy,x) in cell_var: cell_var[(y,x)]=cell_var[(y+dy,x)]; break

# ---------- rect 방출 ----------
def emit_rows(pairs):  # [(y,x,var)] -> run-merge
    out=[]
    from itertools import groupby
    pairs.sort()
    for y in sorted(set(p[0] for p in pairs)):
        row=sorted([(x,v) for yy,x,v in pairs if yy==y])
        i=0
        while i<len(row):
            x0,v=row[i]; j=i
            while j+1<len(row) and row[j+1][0]==row[j][0]+1 and row[j+1][1]==v: j+=1
            out.append(f'<rect x="{x0}" y="{y}" width="{row[j][0]-x0+1}" height="1" fill="var({v})"/>')
            i=j+1
    return out

svg=[]

# ---------- 창밖 배경: 풀캔버스 절차 재작화 ----------
# 레퍼런스 창 내부 측정(행별 클러스터 밴드 + 능선 y26 + 태양 글로우)을
# 캔버스 전체(96×72)로 확장. 창은 벽의 구멍일 뿐 — 풍경은 벽 뒤에도 존재.
import math
def h2(x,y,salt=0):  # 결정적 의사난수 0..99 (디더용)
    return ((x*73856093) ^ (y*19349663) ^ (salt*83492791)) % 100

# 하늘: 레퍼런스 수직 단면(x63) 실측 그라디언트. y4.5→k0(짙은 자주), y22.5→k6(지평선 호박색).
# 하늘은 알베도가 아니라 광원이므로 디라이팅/양자화 대상이 아님 — 팔레트는 template이 소유.
# 밴딩을 없애기 위해 **오더드(베이어) 디더링**으로 인접 스톱을 섞는다. 도트 그라디언트의 정석.
BAYER4 = [[0,8,2,10],[12,4,14,6],[3,11,1,9],[15,7,13,5]]
def bayer(x,y): return (BAYER4[y & 3][x & 3] + 0.5) / 16.0

SKY_N = 10          # 하늘 그라디언트 스톱 수 (k0..k9). 스톱이 촘촘해야 디더가 격자로 안 보인다.
def dither_stop(gpos, x, y, lo=0, hi=SKY_N-1):
    gpos = max(lo, min(hi, gpos))
    base = math.floor(gpos)
    frac = gpos - base
    s = base + (1 if bayer(x,y) < frac else 0)
    return max(lo, min(hi, int(s)))

def ramp(pts, x):
    """제어점 [(x,y)...] 사이 선형보간 — 능선용. 보간의 자연스러운 계단이 도트 실루엣이 된다."""
    if x <= pts[0][0]: return pts[0][1]
    for i in range(len(pts)-1):
        x0,y0 = pts[i]; x1,y1 = pts[i+1]
        if x0 <= x <= x1:
            return y0 + (y1-y0)*(x-x0)/(x1-x0)
    return pts[-1][1]

# 겹산 3중 실루엣 (뒤→앞). 봉우리와 골이 뚜렷한 삼각 능선 — 잔지터 없이 깔끔한 계단으로.
RIDGE_FAR  = [(0,27),(6,24),(14,28),(22,25),(33,23),(40,27),(46,26),(52,24),
              (58,26),(64,25),(70,28),(78,24),(86,27),(96,25)]
RIDGE_MID  = [(0,31),(10,29),(18,31),(28,28),(36,31),(44,30),(50,29),(57,31),
              (64,29),(72,31),(82,29),(96,31)]
RIDGE_NEAR = [(0,33),(14,32),(26,34),(38,33),(50,34),(62,32),(74,34),(86,33),(96,34)]

def synth(y,x):
    rf = int(round(ramp(RIDGE_FAR,  x)))
    rm = int(round(ramp(RIDGE_MID,  x)))
    rn = int(round(ramp(RIDGE_NEAR, x)))
    # 각 산맥은 **단색 실루엣 + 자기 능선 1px 밝은 림** = 도트 산 표현의 정석.
    # 경계에 디더를 섞으면 얼룩(노이즈)으로 읽히므로 섞지 않는다.
    if y >= rn:
        return '--h1' if y == rn else '--h0'      # 근산: 마루 림 + 단색
    if y >= rm:
        return '--h2' if y == rm else '--h1'      # 중산
    if y >= rf:
        return '--h3' if y <= rf+1 else '--h2'    # 원산: 2px 마루 림
    # ---- 하늘: 레퍼런스처럼 solid 행 밴드 (디더 없음 — 스톱이 촘촘해 계단이 안 보인다) ----
    s = max(0, min(SKY_N-1, int(round((y - 4.0) / 2.1))))
    # 태양 후광은 방사형이라 밴드가 동심원 링으로 보인다 → 여기만 해시 지터로 경계를 흩뜨림.
    d = math.hypot((x-56.5), (y-16)*1.55)
    if d < 13.0:
        halo = (SKY_N-0.4) - d*0.62 + (h2(x,y,60) % 100)/100.0 - 0.5
        s = max(s, max(0, min(SKY_N-1, int(round(halo)))))
    # 얇은 층운: 지평선과 평행한 가로 띠 — 한 스톱 밝게, 양끝만 지터로 페이드
    for (cy, cx0, cx1) in ((8,28,50),(11,56,84),(14,14,42),(17,60,92)):
        if y == cy and cx0-4 <= x <= cx1+4:
            edge = min(x-(cx0-4), (cx1+4)-x) / 5.0
            if h2(x,y,61)/100.0 < min(1.0, edge): s = min(SKY_N-1, s+1)
    return f'--k{s}'

# 방 구조 셀 규칙 분리
def static_sub(y,x):
    if y>=49: return 'floor'
    if ((y==3 and 25<=x<=70) or (3<=y<=34 and 25<=x<=26) or (3<=y<=34 and 67<=x<=69)
        or (46<=x<=47 and 4<=y<=33) or (y==21 and 27<=x<=66)
        or (y==34 and 27<=x<=66) or (35<=y<=37 and 24<=x<=70)):
        return 'winframe'
    if x<=21 and 31<=y<=48: return 'fireplace'
    if x>=78 and 16<=y<=48: return 'shelf'
    return 'wall'
bg_sub={k:[] for k in ('wall','floor','winframe','fireplace','shelf')}
for y in range(GY):
    for x in range(GX):
        if (27<=x<=66 and 4<=y<=33) and not(46<=x<=47 or y==21): continue
        bg_sub[static_sub(y,x)].append((y,x,cell_var[(y,x)]))

svg.append('<g id="base-scenery">')
svg += emit_rows([(y,x,synth(y,x)) for y in range(GY) for x in range(GX)])
svg.append('</g>')

def sprite(name,gid,extra=''):
    reg=regions[name]
    pairs=[(y,x,var_for(name,reg['a'][i])) for i,(y,x) in enumerate(reg['cells'])]
    return [f'<g id="{gid}"{extra}>']+emit_rows(pairs)+['</g>']

svg += sprite('sun','sun')

# ---------- 나무 v1: 클럼프 소나무 (보존) ----------
# 창에 가려진 부분(캔버스 상단·좌측 오버플로, 창살 뒤, 벽 뒤 지면까지의 줄기)도 전부 그린다.
# 줄기: x34-35 (레퍼런스 하부 창 실측), 지면(y40)까지. 잎: t0(암부)/t1(본체)/t2(명부).
tree_svg=['<g id="tree-v1">','<g id="tree-trunk">']
for y in range(8,41):
    if y>=38: x0,x1=33,37      # 뿌리 벌어짐
    elif y>=34: x0,x1=34,36
    else: x0,x1=34,35
    tree_svg.append(f'<rect x="{x0}" y="{y}" width="{x1-x0}" height="1" fill="var(--t3)"/>')
    tree_svg.append(f'<rect x="{x1}" y="{y}" width="1" height="1" fill="var(--t4)"/>')
tree_svg.append('</g>')

CLUMPS=[  # 각 클럼프: [(y,x0,x1), ...] 위→아래. 같은 y에 복수 슬래브 가능
  [(5,30,32),(6,29,33),(7,29,33)],                                   # A 좌상단 봉우리
  [(8,26,40),(8,42,45),(9,24,46),(10,24,46),(11,27,46),
   (12,29,47),(13,30,45),(14,30,44)],                                # B 대형 캐노피(좌·상 오버플로, 창살 뒤 포함)
  [(15,35,44),(16,35,43),(17,38,43),(18,38,42)],                     # C 우하단
  [(15,29,32),(16,28,32),(17,28,31)],                                # D 좌하단
  [(17,33,36),(18,32,36),(19,31,35),(20,31,33)],                     # E 중앙 하단
]
tree_svg.append('<g id="leaves-wrap">')
for clump in CLUMPS:
    ys=sorted(set(r[0] for r in clump))
    for (y,x0,x1) in clump:
        w=x1-x0+1
        if y==ys[0]:
            # 상단 릿지: 본체 톤 위에 끊긴 t2 세그먼트만 (통짜 밝은 슬래브 금지)
            tree_svg.append(f'<rect x="{x0}" y="{y}" width="{w}" height="1" fill="var(--t1)"/>')
            for xx in range(x0,x1+1):
                if h2(xx//3,y,10)<50:
                    tree_svg.append(f'<rect x="{xx}" y="{y}" width="1" height="1" fill="var(--t2)"/>')
        elif y==ys[-1]:
            tree_svg.append(f'<rect x="{x0}" y="{y}" width="{w}" height="1" fill="var(--t0)"/>')
        else:
            tree_svg.append(f'<rect x="{x0}" y="{y}" width="{w}" height="1" fill="var(--t1)"/>')
            hl=1+h2(x1,y,8)%2   # 우측(해 방향) 명부: 1~2px
            tree_svg.append(f'<rect x="{max(x0,x1-hl+1)}" y="{y}" width="{min(hl,w)}" height="1" fill="var(--t2)"/>')
            for xx in range(x0+1,x1):   # 질감 스펙클
                if h2(xx,y,9)<9:
                    tree_svg.append(f'<rect x="{xx}" y="{y}" width="1" height="1" fill="var(--t0)"/>')
tree_svg.append('</g>')
tree_svg.append('</g>')   # /tree-v1
svg += tree_svg

# ---------- 나무 v2: 둥근 활엽수 (타원 로브 합성) ----------
# 로브(타원) 여러 개를 겹쳐 유기적인 수관을 만들고, 상단(하늘이 열린 쪽)일수록 밝게 —
# 방향광이 아니라 앰비언트 오클루전이므로 시간이 바뀌어도 어색해지지 않는다.
# 로브(둥근 잎 뭉치)를 겹쳐 수관을 만든다. 셰이딩은 **로브마다 개별**로 —
# 수관 전체를 하나로 셰이딩하면 아래쪽이 통째로 시커먼 덩어리가 된다.
# 로브 중심 y를 서로 어긋나게 배치 — 같은 높이에 몰리면 음영이 가로 줄무늬가 된다.
LOBES=[(34.5,7.0,4.6,2.8),(29.0,9.5,4.2,2.9),(40.0,10.8,4.4,3.0),(34.0,12.0,5.8,3.2),
       (27.5,13.8,3.8,2.6),(42.0,14.6,3.9,2.7),(35.5,15.8,4.8,2.6),(31.0,16.4,3.6,2.2)]
# 수관 사이로 하늘이 비치는 틈 (잎 뭉치 사이 공간) — 실루엣이 덩어리로 안 보이게
GAPS=[(31.5,10.5,1.5,1.1),(38.0,12.8,1.7,1.2),(33.0,14.2,1.4,1.0)]
canopy={}      # (y,x) -> (로브내 방사 음영값 shade)
for (cx,cy,rx,ry) in LOBES:
    for y in range(int(cy-ry)-1, int(cy+ry)+2):
        for x in range(int(cx-rx)-1, int(cx+rx)+2):
            dx=(x-cx)/rx; dy=(y-cy)/ry
            d=dx*dx+dy*dy
            if d>1.0: continue
            if d>0.90 and h2(x,y,54)<45: continue      # 실루엣 가장자리를 성기게(잎 결)
            v=(y-(cy-ry))/(2*ry)
            shade=v*0.62 + d*0.38                       # 세로 + 방사 → 둥근 잎 뭉치
            prev=canopy.get((y,x))
            if prev is None or shade<prev: canopy[(y,x)]=shade
for (gx,gy,grx,gry) in GAPS:                            # 틈 뚫기
    for (y,x) in list(canopy):
        if ((x-gx)/grx)**2 + ((y-gy)/gry)**2 <= 1.0: del canopy[(y,x)]

t2_svg=['<g id="tree-v2">','<g id="tree2-trunk">']
# 줄기: 위로 갈수록 가늘어지는 테이퍼 + 뿌리 플레어
def trunk_span(y):
    if y>=39: return 32,40                 # 뿌리 플레어
    if y>=36: return 33,39
    if y>=30: return 34,38
    if y>=22: return 34,37
    return 34,36
for y in range(14,41):
    x0,x1=trunk_span(y)
    t2_svg.append(f'<rect x="{x0}" y="{y}" width="{x1-x0}" height="1" fill="var(--t3)"/>')
    t2_svg.append(f'<rect x="{x1}" y="{y}" width="1" height="1" fill="var(--t4)"/>')
    if h2(x0,y,50)<30 and x1-x0>2:   # 나무껍질 세로 결
        t2_svg.append(f'<rect x="{x0+1+h2(y,0,51)%(x1-x0-1)}" y="{y}" width="1" height="1" fill="var(--t0)"/>')
# 가지: 수관 속으로 뻗음
for (bx0,by0,bx1,by1) in ((35,17,30,13),(37,16,41,12),(36,14,33,10)):
    steps=max(abs(bx1-bx0),abs(by1-by0))
    for i in range(steps+1):
        bx=round(bx0+(bx1-bx0)*i/steps); by=round(by0+(by1-by0)*i/steps)
        t2_svg.append(f'<rect x="{bx}" y="{by}" width="1" height="1" fill="var(--t3)"/>')
t2_svg.append('</g>')

leaf_cells=[]
for (y,x),shade in sorted(canopy.items()):
    # 로브의 위·중심에서 멀어질수록 어두움 = 하늘 노출도(앰비언트 오클루전).
    # 방향광이 아니므로 시간이 바뀌어도 어색해지지 않는다.
    if   shade < 0.30: tone='--t2'
    elif shade < 0.60: tone='--t1'
    else:              tone='--t0'
    r=h2(x,y,53)
    if   r < 8:  tone = '--t0'                    # 잎새 틈(그늘)
    elif r > 94 and shade < 0.45: tone='--t2'     # 반짝이는 잎
    leaf_cells.append((y,x,tone))
t2_svg.append('<g id="tree2-leaves">')
t2_svg += emit_rows(leaf_cells)
t2_svg.append('</g>')
t2_svg.append('</g>')
svg += t2_svg
svg.append('<!--PARTICLES-->')
for sub in ('wall','winframe','fireplace','shelf'):
    svg.append(f'<g id="g-{sub}">')
    svg += emit_rows(bg_sub[sub])
    svg.append('</g>')

# ---------- 마룻바닥: 절차 재작화 (무광원 중립, 원근 판자) ----------
# 레퍼런스의 판자 구조(가로 보드 + 어긋난 세로 조인트 + 나뭇결)만 전사하고 광 웅덩이는 배제.
# 원근: 앞(아래)으로 올수록 판자가 두꺼워짐. 색은 전부 --fb* 변수(테마 오버레이가 착색).
# 밴드: 뒤로 갈수록 얇아지는 원근. 각 밴드 = 판자 한 줄.
FLOOR_BANDS=[(49,50),(51,53),(54,56),(57,60),(61,64),(65,68),(69,71)]
svg.append('<g id="g-floor">')
for bi,(y0,y1) in enumerate(FLOOR_BANDS):
    # 판자 길이·시작 오프셋을 밴드마다 어긋나게 (벽돌 격자처럼 정렬되지 않도록)
    plank_w = 24 + (h2(bi,0,30) % 4) * 6
    off = h2(bi,1,31) % plank_w
    joints = [x for x in range(-off, 97, plank_w) if 0 < x < 96]
    edges = [0]+joints+[96]
    for y in range(y0, y1+1):
        for si in range(len(edges)-1):
            x0,x1 = edges[si], edges[si+1]
            r = h2(si,bi,32) % 12                    # 판자별 기본 톤
            tone = '--fb0' if r<3 else ('--fb2' if r<6 else '--fb1')
            svg.append(f'<rect x="{x0}" y="{y}" width="{x1-x0}" height="1" fill="var({tone})"/>')
            # 판자 내부 결: 길이 방향(가로) 2~4px 대시, 판자마다 다른 위치
            gx = x0
            while gx < x1:
                step = 3 + h2(gx,y,33) % 6
                if h2(gx,y,34) < 26:
                    ln = min(2 + h2(gx,y,35) % 3, x1-gx)
                    sh = '--fbl' if h2(gx,y,36) < 62 else '--fbh'
                    if ln>0: svg.append(f'<rect x="{gx}" y="{y}" width="{ln}" height="1" fill="var({sh})"/>')
                gx += step
            # 옹이 (드물게)
            if h2(si,y,37) < 4:
                kx = x0 + 3 + h2(si,y,38) % max(1,(x1-x0-6))
                svg.append(f'<rect x="{kx}" y="{y}" width="2" height="1" fill="var(--fbk)"/>')
        # 판자 위/아래 모따기: 윗줄은 살짝 밝게, 아랫줄은 어둡게 → 두께감
        if y == y0 and bi > 0:
            svg.append(f'<rect x="0" y="{y}" width="96" height="1" fill="var(--fbh)" opacity=".22"/>')
        if y == y1:
            svg.append(f'<rect x="0" y="{y}" width="96" height="1" fill="var(--fbk)" opacity=".55"/>')
        # 세로 맞댐 이음매
        for jx in joints:
            svg.append(f'<rect x="{jx}" y="{y}" width="1" height="1" fill="var(--fbk)"/>')
# 벽 접합부 AO (허용 범위: 맞닿는 곳의 어두움)
for i,(yy,op) in enumerate([(49,'.38'),(50,'.22'),(51,'.10')]):
    svg.append(f'<rect x="0" y="{yy}" width="96" height="1" fill="#120c14" opacity="{op}"/>')
svg.append('</g>')

creg=regions['candle']
svg.append('<g id="candle">')
body=[(y,x,var_for('candle',creg['a'][i])) for i,(y,x) in enumerate(creg['cells']) if creg['a'][i]<2]
flame=[(y,x,var_for('candle',creg['a'][i])) for i,(y,x) in enumerate(creg['cells']) if creg['a'][i]==2]
svg+=emit_rows(body)
svg.append('<g class="c-flame">'); svg+=emit_rows(flame); svg.append('</g>')
svg.append('</g>')
# fire: 톤별 그룹(f-out/mid/core)
freg=regions['fire']
svg.append('<g id="fire">')
for cls,idxs in [('f-out',[0]),('f-mid',[1,2]),('f-core',[3])]:
    pairs=[(y,x,var_for('fire',freg['a'][i])) for i,(y,x) in enumerate(freg['cells']) if freg['a'][i] in idxs]
    if pairs:
        svg.append(f'<g class="{cls}">'); svg+=emit_rows(pairs); svg.append('</g>')
svg.append('</g>')
for i in range(1,7): svg += sprite(f'book{i}',f'bk-{i}')
svg += sprite('plant','sill-plant')
svg += sprite('props','floor-props')
# ---------- 러그: 절차 재작화 (레퍼런스 구조 = 외곽 어두운 단 + 밝은 테두리 줄 + 무늬 필드) ----------
# 레퍼런스 실측: y53에서 x28~68, y65에서 x19~75 (앞으로 벌어지는 사다리꼴)
RUG_Y0, RUG_Y1 = 52, 66
def rug_span(y):
    t = (y-RUG_Y0)/(RUG_Y1-RUG_Y0)
    return round(29 - 10*t), round(67 + 8*t)
svg.append('<g id="rug">')
_rug_cells=[]
for y in range(RUG_Y0, RUG_Y1+1):
    x0,x1 = rug_span(y)
    for x in range(x0, x1+1):
        din = min(x-x0, x1-x, y-RUG_Y0, RUG_Y1-y)   # 가장자리로부터의 거리
        if din == 0:      tone = '--rg0'            # 외곽 어두운 단
        elif din == 1:    tone = '--rg1'
        elif din == 2:    tone = '--rg4'            # 밝은 테두리 줄
        elif din == 3:    tone = '--rg3'
        else:
            tone = '--rg2'                          # 필드
            r = h2(x,y,40)
            if r < 7:    tone = '--rg3'             # 문양 얼룩(밝은 쪽)
            elif r < 12: tone = '--rg1'             # 결(어두운 쪽)
            if din == 4 and h2(x,y,41) < 45: tone = '--rg3'   # 테두리 안쪽 그림자선
        _rug_cells.append((y,x,tone))
svg += emit_rows(_rug_cells)
svg.append('</g>')

# ---------- 돌: 절차 생성 (매끈한 라운드, 얼굴 없음, AO만) ----------
def ball(gid, cx, base_y, w, h):
    # 타원 실루엣 + 상/하 톤 밴드(무방향광: 위=열린 하늘 AO 밝음, 아래=접지 AO 어두움)
    out=[f'<g id="{gid}">']
    ry=h/2.0; rx=w/2.0
    for i in range(h):
        y=base_y-h+1+i
        dy=(i+0.5-ry)/ry
        hw=rx*math.sqrt(max(0.0,1-dy*dy))
        if i==h-1: hw=max(2.0,hw*0.72)   # 접지면 살짝 평평
        x0=round(cx-hw); x1=round(cx+hw)-1
        if x1<x0: continue
        f=i/(h-1)
        tone='--o4' if f<0.18 else ('--o3' if f<0.42 else ('--o2' if f<0.68 else ('--o1' if f<0.88 else '--o0')))
        out.append(f'<rect x="{x0}" y="{y}" width="{x1-x0+1}" height="1" fill="var({tone})"/>')
        lower={'--o4':'--o3','--o3':'--o2','--o2':'--o1','--o1':'--o0','--o0':'--o0'}[tone]
        if 0<i<h-1:  # 곡률 림(양끝 1px 어둡게)
            out.append(f'<rect x="{x0}" y="{y}" width="1" height="1" fill="var({lower})"/>')
            out.append(f'<rect x="{x1}" y="{y}" width="1" height="1" fill="var({lower})"/>')
        for xx in range(x0+1,x1):  # 질감 스펙클 (절제)
            if h2(xx,y,22)<4:
                out.append(f'<rect x="{xx}" y="{y}" width="1" height="1" fill="var({lower})"/>')
    out.append('</g>')
    return out

svg += ball('orb', 58, 35, 9, 7)       # 창턱: 원근 축소판
svg += ball('orb-rug', 47, 63, 14, 10) # 러그 위 방 한가운데: 원래 크기

with open(f'art_svg{SUF}.txt','w') as f: f.write('\n'.join(svg))

# ---------- 팔레트 CSS ----------
def transform(c, mode):
    r,gr,b=[v/255 for v in c]
    if mode=='day':
        # 쿨한 주광 블렌드 + 밝게
        tr,tg,tb=0.81,0.85,0.91; a=0.16
        r,gr,b=r*(1-a)+tr*a, gr*(1-a)+tg*a, b*(1-a)+tb*a
        h,l,s=colorsys.rgb_to_hls(r,gr,b)
        l=min(0.93,l*1.38+0.03); s*=0.8
        r,gr,b=colorsys.hls_to_rgb(h,l,s)
    else:  # night
        tr,tg,tb=0.10,0.12,0.30; a=0.30
        r,gr,b=r*(1-a)+tr*a, gr*(1-a)+tg*a, b*(1-a)+tb*a
        h,l,s=colorsys.rgb_to_hls(r,gr,b)
        l*=0.66
        r,gr,b=colorsys.hls_to_rgb(h,l,s)
    return [round(v*255) for v in (r,gr,b)]

lines_base, lines_day, lines_night = [],[],[]
THEMED={'static','orb','rug','props','plant','candle'}|{f'book{i}' for i in range(1,7)}  # 시간대 영향
for name,reg in regions.items():
    for i,c in enumerate(reg['C']):
        v=f"{var_for(name,i)}: {hx(c)};"
        lines_base.append(v)
        if name in THEMED:
            lines_day.append(f"{var_for(name,i)}: {hx(transform(c,'day'))};")
            lines_night.append(f"{var_for(name,i)}: {hx(transform(c,'night'))};")
with open(f'palette_css{SUF}.txt','w') as f:
    f.write("/* BASE(노을=원본) */\n"+"\n".join(lines_base))
    f.write("\n\n/* DAY */\n"+"\n".join(lines_day))
    f.write("\n\n/* NIGHT */\n"+"\n".join(lines_night))

# 요약
nrects=sum(1 for l in svg if l.startswith('<rect'))
print("rects:",nrects)
for name in ('sky','hill','rug','fire','static'):
    print(name, [hx(c) for c in regions[name]['C']])
