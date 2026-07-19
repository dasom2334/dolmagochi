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
def emit_rows(pairs):
    """[(y,x,var)] -> 가로 run-merge 후 **색상별 <g fill>로 묶어** 방출.
    rect마다 fill="var(--xx)"를 반복하면 파일이 수십 KB 불어난다(브라우저 스냅샷 한계에 걸림).
    셀 맵에서 온 입력이라 셀이 겹치지 않으므로 그룹 내 순서는 결과에 영향이 없다."""
    runs={}                                   # var -> [rect, ...]
    by_row={}
    for (y,x,v) in pairs: by_row.setdefault(y,[]).append((x,v))
    for y in sorted(by_row):
        row=sorted(by_row[y]); i=0
        while i<len(row):
            x0,v=row[i]; j=i
            while j+1<len(row) and row[j+1][0]==row[j][0]+1 and row[j+1][1]==v: j+=1
            runs.setdefault(v,[]).append(f'<rect x="{x0}" y="{y}" width="{row[j][0]-x0+1}" height="1"/>')
            i=j+1
    out=[]
    for v in sorted(runs):
        out.append(f'<g fill="var({v})">'); out += runs[v]; out.append('</g>')
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

def vnoise(x, y, salt, cw=8, ch=3):
    """셀 격자 해시 = 큰 덩어리 변화. per-pixel 해시(=얼룩)와 달리 지형 기복으로 읽힌다."""
    return h2(x//cw, y//ch, salt)

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
    # 디테일은 per-pixel 디더가 아니라 **큰 덩어리 기복(vnoise)** 으로 — 디더는 얼룩이 된다.
    if y >= rn:
        if y == rn: return '--h1'                            # 근산 마루 림
        if y > 36: return '--h0'                             # 벽 뒤(항상 가려짐) — 평평하게, 용량 절약
        return '--h1' if vnoise(x,y,80,9,4) < 26 else '--h0' # 산허리 기복
    if y >= rm:
        if y == rm: return '--h2'                            # 중산 마루 림
        # 근산 능선 위로 솟은 침엽수림 실루엣 (원경 숲 가장자리)
        if y == rn-1 and h2(x,0,70) < 34: return '--h0'
        if y == rn-2 and h2(x,0,71) < 13: return '--h0'
        return '--h2' if vnoise(x,y,81,8,3) < 22 else '--h1'
    if y >= rf:
        if y <= rf+1: return '--h3'                          # 원산 2px 마루 림
        if y == rm-1 and h2(x,0,72) < 30: return '--h1'      # 중산 위 나무선
        if y == rm-2 and h2(x,0,73) < 11: return '--h1'
        return '--h3' if vnoise(x,y,82,10,4) < 24 else '--h2'
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
# 바닥 평면의 소실점 — 러그 사다리꼴에서 역산(VP 50.1, 22.4). 러그·바닥이 같은 평면이므로
# 두 오브젝트의 투시가 자동으로 일치한다.
FLOOR_VPX, FLOOR_VPY = 50.1, 22.4
FLOOR_REF_Y = 71.0                     # 기준 행(가장 앞줄)
PLANK_W_REF = 30                       # 기준 행에서의 판자 길이

def persp_s(y):                        # 기준 행 대비 가로 축척
    return (y - FLOOR_VPY) / (FLOOR_REF_Y - FLOOR_VPY)
def persp_x(x_ref, y):                 # 깊이 방향 선은 소실점으로 수렴
    return FLOOR_VPX + (x_ref - FLOOR_VPX) * persp_s(y)

# 밴드 경계도 등비(y-VP)로 — 뒤로 갈수록 판자가 얇아지는 원근
_b=[]; _yy=72.0
while _yy > 49.5:
    _b.append(int(round(_yy))); _yy = FLOOR_VPY + (_yy-FLOOR_VPY)*0.895
_b.append(49); _b=sorted(set(_b))
FLOOR_BANDS=[(_b[i], _b[i+1]-1) for i in range(len(_b)-1)]

# 셀 맵으로 먼저 칠하고 마지막에 run-merge → 겹치는 rect를 방출하지 않는다.
floor_cell = {}
for bi,(y0,y1) in enumerate(FLOOR_BANDS):
    # 맞댐 이음매를 **기준 행 좌표**로 정의하고 행마다 투영 → 세로줄이 소실점으로 수렴한다.
    off = h2(bi,1,31) % PLANK_W_REF
    xrefs = [off + k*PLANK_W_REF for k in range(-4, 8)]   # 뒷줄까지 덮도록 넉넉히
    for y in range(y0, y1+1):
        s = persp_s(y)
        for k in range(len(xrefs)-1):
            x0 = max(0, int(round(persp_x(xrefs[k], y))))
            x1 = min(96, int(round(persp_x(xrefs[k+1], y))))
            if x1 <= x0: continue
            r = h2(k,bi,32) % 12                     # 판자별 기본 톤 (행이 바뀌어도 동일)
            tone = '--fb0' if r<3 else ('--fb2' if r<6 else '--fb1')
            for xx in range(x0,x1): floor_cell[(y,xx)] = tone
            # 결: 길이 방향 대시. 대시 길이·간격도 축척 s를 따라 뒤로 갈수록 촘촘해진다.
            gx = x0
            while gx < x1:
                if h2(gx,y,34) < 26:
                    ln = min(max(1, int(round((2 + h2(gx,y,35) % 3) * s))), x1-gx)
                    sh = '--fbl' if h2(gx,y,36) < 62 else '--fbh'
                    for xx in range(gx, gx+ln): floor_cell[(y,xx)] = sh
                gx += max(2, int(round((3 + h2(gx,y,33) % 6) * s)))
            if h2(k,y,37) < 4 and x1-x0 > 7:         # 옹이
                kx = x0 + 3 + h2(k,y,38) % (x1-x0-6)
                for xx in range(kx, min(x1, kx+max(1,int(round(2*s))))): floor_cell[(y,xx)] = '--fbk'
        # 판자 위/아래 모따기 (가로선은 화면과 평행하므로 그대로 수평)
        if y == y0 and bi > 0:
            for xx in range(96): floor_cell[(y,xx)] = '--fbh'
        if y == y1:
            for xx in range(96): floor_cell[(y,xx)] = '--fbk'
        # 맞댐 이음매 1px — 행마다 x가 이동하므로 결과적으로 기울어진 선이 된다
        for xr in xrefs:
            jx = int(round(persp_x(xr, y)))
            if 0 < jx < 96: floor_cell[(y,jx)] = '--fbk'
svg.append('<g id="g-floor">')
svg += emit_rows([(y,x,v) for (y,x),v in floor_cell.items()])
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
# 실루엣은 **정규화 프로파일 하나**를 두 크기로 래스터라이즈 — 창턱/러그 돌의 모양이 통일된다.
# 위쪽은 둥글고(ry .60) 아래쪽은 완만해(ry .55) 밑면이 살짝 납작한 냇돌 형태.
def stone_profile(t):          # t: 0=꼭대기, 1=바닥 → 반폭 비율 0..1
    c = 0.60
    r = c if t <= c else 0.55
    return math.sqrt(max(0.0, 1.0 - ((t-c)/r)**2))

STONE_ASPECT = 1.40            # w:h 고정 → 두 돌의 비례도 동일

def stone_rows(cx, base_y, w, h):
    """행별 (y, x0, x1, t) — 본체·림라이트·그림자가 같은 실루엣을 공유하도록 분리"""
    rows=[]
    for i in range(h):
        y = base_y - h + 1 + i
        t = (i+0.5)/h
        hw = (w/2.0) * stone_profile(t)
        x0 = round(cx-hw); x1 = round(cx+hw)-1
        if x1 >= x0: rows.append((y, x0, x1, t))
    return rows

def ball(gid, rows):
    # 무방향광: 위=열린 하늘 AO로 밝고, 아래=접지 AO로 어둡다.
    out=[f'<g id="{gid}">']
    for (y,x0,x1,t) in rows:
        tone=('--o4' if t<0.20 else '--o3' if t<0.42 else '--o2' if t<0.66 else
              '--o1' if t<0.86 else '--o0')
        out.append(f'<rect x="{x0}" y="{y}" width="{x1-x0+1}" height="1" fill="var({tone})"/>')
        lower={'--o4':'--o3','--o3':'--o2','--o2':'--o1','--o1':'--o0','--o0':'--o0'}[tone]
        if t>0.06 and t<0.94:   # 곡률 림(양끝 1px 어둡게)
            out.append(f'<rect x="{x0}" y="{y}" width="1" height="1" fill="var({lower})"/>')
            out.append(f'<rect x="{x1}" y="{y}" width="1" height="1" fill="var({lower})"/>')
        for xx in range(x0+1,x1):   # 질감 스펙클 (절제)
            if h2(xx,y,22)<4:
                out.append(f'<rect x="{xx}" y="{y}" width="1" height="1" fill="var({lower})"/>')
    out.append('</g>')
    return out

def rim(gid, rows):
    """역광 림라이트: 실루엣의 위쪽 + 광원(창) 쪽 가장자리 1px.
       base에 굽지 않고 **광원 레이어**에 얹어 시간대 색을 따라가게 한다."""
    out=[f'<g id="{gid}">']
    seen_top=set()
    for (y,x0,x1,t) in rows:
        if t < 0.55:                      # 위쪽 절반: 윗면 전체가 역광을 받음
            out.append(f'<rect x="{x0}" y="{y}" width="{x1-x0+1}" height="1" fill="var(--wl)" opacity="{0.85-t:.2f}"/>')
        if t < 0.80:                      # 창(우상단) 쪽 측면 가장자리
            out.append(f'<rect x="{x1}" y="{y}" width="1" height="1" fill="var(--wl)" opacity="{0.7-t*0.5:.2f}"/>')
    out.append('</g>')
    return out

# 창턱: 원근 축소판 / 러그: 러그 한가운데(y52~66의 중앙 ≈ y61)에 원래 크기
SILL_ROWS = stone_rows(58, 35, 10, round(10/STONE_ASPECT))
RUG_ROWS  = stone_rows(47, 61, 14, round(14/STONE_ASPECT))
svg += ball('orb', SILL_ROWS)
svg += ball('orb-rug', RUG_ROWS)
svg += rim('rim-orb', SILL_ROWS)
svg += rim('rim-orb-rug', RUG_ROWS)

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
