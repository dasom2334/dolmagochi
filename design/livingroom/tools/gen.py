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

def hill_top(x):
    # 창 내부는 측정대로 평평(y26), 창 밖에서만 능선이 완만하게 굽이침
    if 26 <= x <= 67: return 26
    d = min(abs(x-26), abs(x-67))
    amp = min(1.0, d/6)
    return 26 + round(amp*(1.6*math.sin(x*0.33+1.1) + 1.1*math.sin(x*0.11+4.2)))

# 하늘 행 프로파일: y -> (기본 클러스터 A, 디더 클러스터 B, B 비율 %)
SKY_PROF = {0:(0,0,0),1:(0,0,0),2:(0,0,0),3:(0,0,0),4:(0,0,0),5:(0,5,8),
            6:(5,0,10),7:(5,5,0),8:(5,3,30),9:(3,3,0),10:(3,2,50),11:(2,3,12),
            12:(2,2,0),13:(2,2,0),14:(2,1,50),15:(1,1,0),16:(1,1,0),
            17:(1,4,20),18:(1,4,40),19:(4,1,35),20:(4,4,0),21:(4,1,50),
            22:(1,4,8),23:(4,4,0),24:(4,4,0),25:(4,4,0),
            26:(4,3,15),27:(4,3,30),28:(3,4,30),29:(3,3,0)}  # 창밖 능선이 낮아진 열의 지평선 글로우

def synth(y,x):
    H = hill_top(x)
    if y >= H:  # 언덕/지면: 능선 마루가 해 쪽(우측)일수록 밝음, 깊어질수록 어두움
        depth = y - H
        crest = 3 if x >= 50 else (2 if x >= 34 else 1)
        if depth == 0: c = crest
        elif depth == 1: c = crest if h2(x//2,y) < 40 else max(1,crest-1)
        elif depth <= 3: c = max(1,crest-1) if h2(x//2,y,1) < 45 else 1
        elif y <= 33: c = 1 if h2(x//2,y,2) < 70 else 0
        elif y <= 45: c = 1 if h2(x//3,y,3) < 12 else 0
        else: c = 0
        return f'--h{c}'
    A,B,f = SKY_PROF[y]
    c = B if h2(x//2,y,4) < f else A
    if 6 <= y <= 8 and (46 - h2(0,y,5)%3) <= x <= (60 + h2(1,y,5)%4):
        c = 3                      # 상층 구름 슬랩 (중앙 우측)
    d = math.hypot((x-56.5)*1.0, (y-17)*1.6)
    if y >= 11 and d < 4.5: c = max(c,6)          # 해 주변 광휘 (안쪽일수록 밝게)
    elif y >= 11 and d < 6.5: c = max(c,5)
    elif y >= 11 and d < 8.5 and h2(x//2,y,6) < 55: c = max(c,4)
    if y in (24,25) and x >= 58 and h2(x//2,y,7) < 55: c = 3   # 우측 하단 어두운 띠
    if 16 <= y <= 19 and h2(x//2,y,8) < 4: c = 6  # 수평선 위 반짝임
    return f'--k{c}'

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

# ---------- 나무: 완전형 수작화 (클럼프 소나무) ----------
# 창에 가려진 부분(캔버스 상단·좌측 오버플로, 창살 뒤, 벽 뒤 지면까지의 줄기)도 전부 그린다.
# 줄기: x34-35 (레퍼런스 하부 창 실측), 지면(y40)까지. 잎: t0(암부)/t1(본체)/t2(명부).
tree_svg=['<g id="tree-trunk">']
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
svg += tree_svg
svg.append('<!--PARTICLES-->')
for sub in ('wall','winframe','fireplace','shelf'):
    svg.append(f'<g id="g-{sub}">')
    svg += emit_rows(bg_sub[sub])
    svg.append('</g>')

# ---------- 마룻바닥: 절차 재작화 (무광원 중립, 원근 판자) ----------
# 레퍼런스의 판자 구조(가로 보드 + 어긋난 세로 조인트 + 나뭇결)만 전사하고 광 웅덩이는 배제.
# 원근: 앞(아래)으로 올수록 판자가 두꺼워짐. 색은 전부 --fb* 변수(테마 오버레이가 착색).
FLOOR_BANDS=[(49,51),(52,54),(55,58),(59,63),(64,67),(68,71)]  # 뒤→앞 (판자 점점 두꺼움)
svg.append('<g id="g-floor">')
for bi,(y0,y1) in enumerate(FLOOR_BANDS):
    # 긴 판자 + 드문 세로 조인트 (벽돌처럼 보이지 않게)
    plank_w = 26 + (bi%3)*7
    off = (bi*11) % plank_w
    joints = [x for x in range(-off, 97, plank_w) if 0 < x < 96]
    for y in range(y0, y1+1):
        if bi>0 and y==y0:  # 판자 사이 이음매
            svg.append(f'<rect x="0" y="{y}" width="96" height="1" fill="var(--fbk)"/>')
            continue
        edges=[0]+joints+[96]
        for si in range(len(edges)-1):  # 판자 톤: 대부분 fb1, 가끔 fb0/fb2
            x0,x1=edges[si],edges[si+1]
            r=h2(si,bi,20)%10
            tone='--fb0' if r<2 else ('--fb2' if r<4 else '--fb1')
            svg.append(f'<rect x="{x0}" y="{y}" width="{x1-x0}" height="1" fill="var({tone})"/>')
        for jx in joints:
            svg.append(f'<rect x="{jx}" y="{y}" width="1" height="1" fill="var(--fbk)"/>')
        for x in range(0,96,4):  # 나뭇결: 가는 1px 대시, 드문드문
            r=h2(x//4,y,21)
            if r<5:  svg.append(f'<rect x="{x+h2(x,y,23)%3}" y="{y}" width="1" height="1" fill="var(--fbl)"/>')
            elif r<7: svg.append(f'<rect x="{x+h2(x,y,24)%3}" y="{y}" width="1" height="1" fill="var(--fbh)"/>')
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
svg += sprite('rug','rug')

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
