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

# 나무 (창밖): 올리브/줄기, y31+는 줄기만
for y in range(4,34):
    for x in range(27,46):
        if layer[y,x]!='scene': continue
        r,gr,b = g[y,x]
        folia = (gr>=b and r<200 and gr>50) or (abs(int(gr)-int(b))<18 and r<180 and gr>55)
        trunk = r>gr>b and r-b>35 and r<200 and 31<=x<=38
        if y>=31 and not (33<=x<=38): folia=False
        if folia or trunk: layer[y,x]='tree'

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
SPRITES={'tree','sun','orb','fire','candle','plant','rug','props','cabinet'}|{f'book{i}' for i in range(1,7)}
base_of={}  # (y,x) -> 배경 소스 셀
for y in range(GY):
    for x in range(GX):
        if layer[y,x] in SPRITES:
            if layer[y,x]=='cabinet':
                src_pool=[xx for xx in range(GX) if layer[y,xx]=='static' and (xx>70 or xx<25) and y<49]
            elif layer[y,x] in ('tree','sun') or (layer[y,x]=='orb' and y<=33):
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
tree_cells=cells_of('tree')
quant('tree',tree_cells,5,'t')
quant('sun',cells_of('sun'),2,'sun',srcg=g0)
quant('orb',cells_of('orb'),7,'o')
quant('rug',cells_of('rug'),5,'rg')
quant('fire',cells_of('fire'),4,'f',srcg=g0)
quant('candle',cells_of('candle'),3,'cd',srcg=g0)
quant('plant',cells_of('plant'),3,'pl')
quant('props',cells_of('props'),5,'pp')
for i in range(1,7):
    quant(f'book{i}',cells_of(f'book{i}'),2,f'b{i}x')
static_cells=cells_of('static')
quant('static',static_cells,26,'s')

if SUF:
    C=regions['orb']['C']; lum=C.mean(1,keepdims=True)
    regions['orb']['C']=lum+(C-lum)*0.45

# 돌 눈 제거: 어두운 돌 셀 → 이웃 톤
oreg=regions['orb']; oc=oreg['cells']; oa=oreg['a']; oC=oreg['C']
for i,(y,x) in enumerate(oc):
    if oC[oa[i]].sum()<180:  # 극단적으로 어두운 눈 클러스터
        nb=[oa[j] for j,(yy,xx) in enumerate(oc) if abs(yy-y)<=1 and abs(xx-x)<=1 and j!=i and oC[oa[j]].sum()>=180]
        if nb and y<=31 and 55<=x<=61:
            oa[i]=max(set(nb),key=nb.count)

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
bg_in=[(y,x,cell_var[(y,x)]) for y in range(GY) for x in range(GX)
       if 27<=x<=66 and 4<=y<=33 and not(46<=x<=47 or y==21)]

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

# 창밖 배경: 풀캔버스 — 행별 최빈 클러스터로 창 밖 영역 확장
from collections import Counter
rowvar={}
for y in range(4,34):
    vs=[v for yy,x,v in bg_in if yy==y]
    if vs: rowvar[y]=Counter(vs).most_common(1)[0][0]
for y in range(4,34):
    if y not in rowvar: rowvar[y]=rowvar.get(y-1, rowvar.get(y+1))
ext=[]
for y in range(0,4):
    ext.append(f'<rect x="0" y="{y}" width="96" height="1" fill="var({rowvar[4]})"/>')
for y in range(4,34):
    ext.append(f'<rect x="0" y="{y}" width="27" height="1" fill="var({rowvar[y]})"/>')
    ext.append(f'<rect x="67" y="{y}" width="29" height="1" fill="var({rowvar[y]})"/>')
ext.append(f'<rect x="0" y="34" width="96" height="38" fill="var({rowvar[33]})"/>')

svg.append('<g id="base-scenery">')
svg += emit_rows(bg_in)
svg += ext
svg.append('</g>')

def sprite(name,gid,extra=''):
    reg=regions[name]
    pairs=[(y,x,var_for(name,reg['a'][i])) for i,(y,x) in enumerate(reg['cells'])]
    return [f'<g id="{gid}"{extra}>']+emit_rows(pairs)+['</g>']

svg += sprite('sun','sun')
svg += sprite('tree','leaves-wrap')   # 후처리로 잎/줄기 분리 어려우니 통째
svg.append('<!--PARTICLES-->')
for sub in ('wall','floor','winframe','fireplace','shelf'):
    svg.append(f'<g id="g-{sub}">')
    svg += emit_rows(bg_sub[sub])
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
svg += sprite('orb','orb')

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
for name in ('sky','hill','tree','orb','rug','fire','static'):
    print(name, [hx(c) for c in regions[name]['C']])
