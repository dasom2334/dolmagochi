import math, colorsys

art = open('art_svg_v2.txt').read()
pal = open('palette_css_v2.txt').read()

base_lines = []
in_base = False
for line in pal.splitlines():
    if line.startswith('/*'):
        in_base = 'BASE' in line
    elif in_base and line.strip().startswith('--'):
        base_lines.append(line.strip())
def punch(hexv):
    r,g,b = (int(hexv[i:i+2],16)/255 for i in (1,3,5))
    h,l,s = colorsys.rgb_to_hls(r,g,b)
    l = min(.96, max(.03, 0.5 + (l-0.5)*1.22))
    s = min(1, s*1.2)
    r,g,b = colorsys.hls_to_rgb(h,l,s)
    return '#%02x%02x%02x' % (round(r*255), round(g*255), round(b*255))

out_lines=[]
for l in base_lines:
    name = l.split(':')[0].strip()
    if name.startswith('--sun'): continue
    if (name.startswith(('--k','--h')) and name[3:-0 or None][:].isdigit() if False else False): pass
    if name.startswith('--k') and name[3:].isdigit(): continue
    if name.startswith('--h') and name[3:].isdigit(): continue
    if name.startswith('--t') and name[3:].isdigit(): continue
    name2, val2 = l.split(':'); name2=name2.strip(); val2=val2.strip().rstrip(';')
    if name2.startswith('--f') and name2[3:].isdigit():
        out_lines.append('    '+l)          # 발광체(불꽃)는 원색 유지
    elif val2.startswith('#'):
        out_lines.append(f'    {name2}: {punch(val2)};')
    else:
        out_lines.append('    '+l)
BASE='\n'.join(out_lines)

art = art.replace('id="leaves-wrap"', 'id="leaves"')

# 클립 내부 오버레이는 layers와 동일 — assemble_layers.py에서 재사용
import re
la = open('assemble_layers.py').read()
overlay = la.split("overlay = '''")[1].split("'''")[0]
art = art.replace('<!--PARTICLES-->', overlay)

# (배경 분리는 gen.py 셀 규칙으로 이동)

# 스탠드 조명기구 (중립 색) — 창과 책장 사이
lamp_obj = ('<g id="lamp">'
  '<rect x="72" y="33" width="4" height="1" fill="#b9a084"/>'
  '<rect x="71" y="34" width="6" height="1" fill="#c7b193"/>'
  '<rect x="70" y="35" width="8" height="1" fill="#b9a084"/>'
  '<rect x="70" y="36" width="8" height="1" fill="#7d6c5e"/>'
  '<rect x="73" y="37" width="2" height="1" fill="#e8d8b0"/>'
  '<rect x="74" y="38" width="1" height="12" fill="#57484f"/>'
  '<rect x="72" y="50" width="5" height="1" fill="#57484f"/>'
  '<rect x="73" y="49" width="3" height="1" fill="#463a42"/>'
  '<g class="p-shadow" style="mix-blend-mode:multiply">'
  '<rect x="71" y="51" width="7" height="1" fill="#000" opacity=".3"/></g>'
  '</g>')
art = art + lamp_obj

# ---- 앰비언트 오버레이 (방 전체 광원) ----
def strips(fill, blend):
    s=f' style="mix-blend-mode:{blend}"'
    return (f'<rect x="0" y="0" width="96" height="4" fill="{fill}"{s}/>'
            f'<rect x="0" y="34" width="96" height="38" fill="{fill}"{s}/>'
            f'<rect x="0" y="4" width="27" height="30" fill="{fill}"{s}/>'
            f'<rect x="67" y="4" width="29" height="30" fill="{fill}"{s}/>')
def glass(fill, blend):
    return f'<rect x="27" y="4" width="40" height="30" fill="{fill}" style="mix-blend-mode:{blend}"/>'

lights = f'''
<g id="fx-snowcap" fill="#eef3fa">
  <rect x="26" y="2"  width="10" height="1"/><rect x="40" y="2"  width="8" height="1"/><rect x="56" y="2" width="9" height="1"/>
  <rect x="30" y="20" width="5"  height="1"/><rect x="48" y="20" width="6" height="1"/><rect x="60" y="20" width="4" height="1"/>
  <rect x="46" y="20" width="2"  height="1"/>
  <rect x="28" y="33" width="7"  height="1"/><rect x="40" y="33" width="6" height="1"/><rect x="52" y="33" width="8" height="1"/><rect x="63" y="33" width="3" height="1"/>
</g>
<g id="light-day">{strips("rgba(255,244,224,.10)","multiply")}</g>
<g id="light-sunset">
  {strips("rgba(255,148,84,.30)","multiply")}
  {strips("rgba(255,120,40,.10)","screen")}
  {glass("rgba(255,140,80,.30)","multiply")}
</g>
<g id="light-night">
  {strips("rgba(72,82,150,.52)","multiply")}
  {strips("rgba(25,30,70,.28)","multiply")}
  {glass("rgba(30,38,90,.20)","multiply")}
</g>
<g id="light-cloud">
  {strips("rgba(158,165,180,.28)","multiply")}
  {glass("rgba(165,172,188,.22)","multiply")}
</g>
<g id="light-rain">
  {strips("rgba(105,116,142,.36)","multiply")}
  {glass("rgba(95,105,132,.28)","multiply")}
</g>
<g id="light-snow">
  {strips("rgba(182,190,208,.26)","multiply")}
  {glass("rgba(195,203,220,.20)","multiply")}
</g>
'''

# ---- 물리 광원 ----
def pool(gid, y0, y1, skew, holes, zones, fillvar='var(--wl)', opvar='var(--wl-a)', maskref=None):  # y0,y1 미사용
    mk = f' mask="url(#{maskref})"' if maskref else ''
    parts=[f'<g id="{gid}"{mk} style="opacity:{opvar}">']
    for (zy0,zy1,op) in zones:
        parts.append(f'<g opacity="{op}">')
        for y in range(zy0, zy1+1):
            sh = 0 if y<=36 else -round((y-35)*skew)
            ivs=[(27+sh, 66+sh)]
            cuts=[(46+sh, 47+sh)]
            for (hy0,hy1,hx0,hx1) in holes:
                if hy0<=y<=hy1: cuts.append((hx0+sh, hx1+sh))
            for c0,c1 in cuts:
                niv=[]
                for a,b in ivs:
                    if c1<a or c0>b: niv.append((a,b)); continue
                    if a<c0: niv.append((a,c0-1))
                    if b>c1: niv.append((c1+1,b))
                ivs=niv
            for a,b in ivs:
                a=max(1,a); b=min(94,b)
                if b>=a:
                    parts.append(f'<rect x="{a}" y="{y}" width="{b-a+1}" height="1" fill="{fillvar}" style="mix-blend-mode:screen"/>')
        parts.append('</g>')
    parts.append('</g>')
    return ''.join(parts)

# 빔은 수평면에만 떨어진다: 창턱 상단(y35~36) + 바닥(y49~). 창 밑 벽은 그림자.
# 노을/밤: 저고도 광원 — 길고 왼쪽 스큐, 돌·화분 그림자 구멍이 바닥까지 이어짐
lp_sun_low = pool('lp-sun-low', 0, 0, 0.45, holes=[],
                  zones=[(35,36,.9),(49,55,1),(56,62,.75),(63,69,.5)], maskref='m-low')
# 낮: 고고도 — 짧고 가파른 빔
lp_sun_day = pool('lp-sun-day', 0, 0, 0.12, holes=[],
                  zones=[(35,36,.9),(49,53,.9),(54,58,.6)], maskref='m-day')
lp_sun = '<g id="lp-sun">' + lp_sun_low + lp_sun_day + '</g>'
lp_moon = pool('lp-moon', 0, 0, 0.45, holes=[],
               zones=[(35,36,.9),(49,55,1),(56,62,.75),(63,69,.5)],
               fillvar='var(--ml)', opvar='var(--ml-a)', maskref='m-low')

def rings(cx, cy, ysquash, bands, yr, xclamp, fillvar):
    parts=[]
    for y in range(yr[0], yr[1]+1):
        dy=(y-cy)*ysquash
        for (r_in, r_out, op) in bands:
            w2o = r_out*r_out - dy*dy
            if w2o<=0: continue
            xo=math.sqrt(w2o)
            w2i = r_in*r_in - dy*dy
            xi=math.sqrt(w2i) if w2i>0 else 0
            segs=[(cx-xo,cx-xi),(cx+xi,cx+xo)] if xi>0 else [(cx-xo,cx+xo)]
            for a,b in segs:
                a=max(xclamp[0],round(a)); b=min(xclamp[1],round(b))
                if b>a:
                    parts.append(f'<rect x="{a}" y="{y}" width="{b-a}" height="1" fill="{fillvar}" opacity="{op}" style="mix-blend-mode:screen"/>')
    return parts

fire_parts  = rings(11.5, 45, 1.6, [(0,10,1),(10,16,.55),(16,22,.28)], (49,62), (1,94), 'var(--fl)')
fire_parts += rings(11.5, 43, 1.0, [(0,8,.45),(8,14,.28),(14,20,.14)], (28,48), (1,24), 'var(--fl)')
lp_fire = ('<g id="lp-fire" mask="url(#m-fire)" style="opacity:var(--fl-a)"><g class="glow-flicker">'
           + ''.join(fire_parts) + '</g></g>')

cd_parts = rings(5, 26, 1.0, [(0,3,.9),(3,5,.45),(5,7,.2)], (20,32), (1,13), 'var(--cl)')
lp_candle = ('<g id="lp-candle" style="opacity:var(--cl-a)"><g class="glow-flicker-slow">'
             + ''.join(cd_parts) + '</g></g>')

lamp_parts  = rings(74, 35, 1.0, [(0,5,.55),(5,9,.32),(9,13,.16)], (26,48), (62,94), 'var(--ll)')
lamp_parts += rings(74, 47, 1.5, [(0,7,.8),(7,12,.4),(12,16,.2)], (49,58), (62,94), 'var(--ll)')
lp_lamp = '<g id="lp-lamp" style="opacity:var(--ll-a)">' + ''.join(lamp_parts) + '</g>'

def occ_orb(skew, ymax):
    r=['<rect x="51" y="35" width="14" height="2" fill="#000"/>']
    for y in range(49, ymax+1):
        sh=-round((y-35)*skew)
        col='#000' if y<=53 else ('#666' if y<=57 else '#aaa')
        r.append('<rect x="%d" y="%d" width="14" height="1" fill="%s"/>' % (51+sh, y, col))
    return '<g class="occ-orb">'+''.join(r)+'</g>'

def occ_plant(skew, ymax):
    r=['<rect x="28" y="35" width="5" height="2" fill="#000"/>']
    for y in range(49, ymax+1):
        sh=-round((y-35)*skew)
        col='#000' if y<=50 else '#888'
        r.append('<rect x="%d" y="%d" width="5" height="1" fill="%s"/>' % (28+sh, y, col))
    return '<g class="occ-plant">'+''.join(r)+'</g>'

def occ_box_beam(low):
    r=[]
    ymax = 53 if low else 50
    for y in range(49, ymax+1):
        d = y-48 if low else 0
        col='#333' if y<=50 else '#999'
        r.append('<rect x="%d" y="%d" width="8" height="1" fill="%s"/>' % (21-d, y, col))
    return '<g class="occ-props">'+''.join(r)+'</g>'

masks = (
 '<mask id="m-day" maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="72">'
 '<rect width="96" height="72" fill="#fff"/>'
 + occ_orb(0.12, 54) + occ_plant(0.12, 51) + occ_box_beam(False) + '</mask>'
 '<mask id="m-low" maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="72">'
 '<rect width="96" height="72" fill="#fff"/>'
 + occ_orb(0.45, 60) + occ_plant(0.45, 52) + occ_box_beam(True) + '</mask>'
 '<mask id="m-fire" maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="72">'
 '<rect width="96" height="72" fill="#fff"/>'
 '<g class="occ-props">'
 '<rect x="29" y="44" width="3" height="5" fill="#808080"/>'
 '<rect x="32" y="45" width="3" height="4" fill="#b0b0b0"/>'
 '<rect x="35" y="46" width="2" height="3" fill="#d0d0d0"/>'
 '<rect x="10" y="61" width="12" height="3" fill="#999"/>'
 '</g></mask>')

lights = masks + lights + lp_sun + lp_moon + lp_fire + lp_candle + lp_lamp

# --- 소품별 4레이어: p-shadow 주입 (base와 같은 그룹 안, multiply) ---
def inject(gid, html_frag):
    global art
    i = art.index('<g id="%s">' % gid)
    j = art.index('</g>', i)
    art = art[:j] + html_frag + art[j:]

SH = '<g class="p-shadow" style="mix-blend-mode:multiply">%s</g>'
inject('orb', SH % ('<rect x="52" y="36" width="12" height="1" fill="#000" opacity=".25"/>'
                    '<rect x="53" y="37" width="10" height="1" fill="#000" opacity=".12"/>'))
inject('sill-plant', SH % '<rect x="28" y="36" width="5" height="1" fill="#000" opacity=".25"/>')
inject('g-floor', SH % ('<rect x="0" y="49" width="96" height="1" fill="#000" opacity=".25"/>'
                        '<rect x="0" y="50" width="96" height="1" fill="#000" opacity=".1"/>'))
inject('g-fireplace', SH % ('<rect x="2" y="49" width="20" height="1" fill="#000" opacity=".2"/>'
                            '<rect x="3" y="50" width="17" height="1" fill="#000" opacity=".1"/>'))
inject('g-shelf', SH % ('<rect x="78" y="49" width="16" height="1" fill="#000" opacity=".2"/>'
                        '<rect x="79" y="50" width="14" height="1" fill="#000" opacity=".1"/>'))
inject('floor-props', SH % ('<rect x="10" y="61" width="12" height="1" fill="#000" opacity=".25"/>'
                            '<rect x="24" y="63" width="6" height="1" fill="#000" opacity=".25"/>'
                            '<rect x="21" y="48" width="8" height="1" fill="#000" opacity=".3"/>'))

# --- emission 분리: 균형 잡힌 그룹 추출 유틸 ---
def extract_group(src, start_idx):
    depth = 0; i = start_idx
    while True:
        no = src.find('<g', i)
        nc = src.find('</g>', i)
        if nc == -1: raise ValueError('unbalanced')
        if no != -1 and no < nc:
            depth += 1; i = no + 2
        else:
            depth -= 1; i = nc + 4
            if depth == 0: return src[start_idx:i]

# 벽난로 불꽃 전체를 emission으로 이동
fi = art.index('<g id="fire">')
fire_g = extract_group(art, fi)
art = art[:fi] + art[fi+len(fire_g):]

# 촛불 flame 서브그룹 추출 → emission
ci = art.index('<g class="c-flame">')
cf = extract_group(art, ci)
art = art[:ci] + art[ci+len(cf):]
candle_flame = '<g id="candle-flame">' + cf + '</g>'

# 촛대 접지 그림자
inject('candle', SH % '<rect x="3" y="31" width="5" height="1" fill="#000" opacity=".25"/>')

lamp_glow = ('<g id="lamp-glow">'
  '<rect x="73" y="37" width="2" height="1" fill="#ffe9b0"/>'
  '<rect x="72" y="36" width="4" height="2" fill="#ffd98a" opacity=".5" style="mix-blend-mode:screen"/>'
  '<rect x="70" y="34" width="8" height="3" fill="#ffcf80" opacity=".3" style="mix-blend-mode:screen"/>'
  '</g>')

emission = '<g id="emission">' + fire_g + candle_flame + lamp_glow + '</g>'

# ---------- z-순서 정렬 ----------
def pull(gid):
    global art
    i = art.index('<g id="%s"' % gid)
    seg = extract_group(art, i)
    art = art[:i] + art[i+len(seg):]
    return seg

# [2] 창밖: 달·별·구름은 하늘 요소 → 나무보다 뒤로
celestial = ''.join(pull(g) for g in ('moon','stars','clouds'))
li = art.index('<g id="leaves">')
art = art[:li] + celestial + art[li:]

# [3] 소품: 책장 책 → 촛대 → 창턱 화분 → 돌멩이 → 러그 → 스탠드 → 바닥 소품
PROP_ORDER = ['bk-1','bk-2','bk-3','bk-4','bk-5','bk-6',
              'candle','sill-plant','orb','rug','lamp','floor-props']
props = {g: pull(g) for g in PROP_ORDER}
art = art + ''.join(props[g] for g in PROP_ORDER)

art = ('<!-- z-order(뒤→앞): [1]방구조(벽→바닥→창틀→벽난로→책장) '
       '[2]창밖(하늘→해→달→별→구름→나무→파티클→유리효과) '
       '[3]소품(책→촛대→화분→돌멩이→러그→스탠드→바닥소품) '
       '[3.5]창틀눈 [4]색감오버레이(시간→날씨) [5]광원(mask) [6]emission -->') + art
lights = lights + emission

html = open('template_v2.html').read()
html = html.replace(', sway 2.6s ease-in-out infinite','').replace(', sway 3.4s ease-in-out -1.2s infinite','')
html = html.replace('/*__BASE__*/', BASE)
html = html.replace('<!--__ART__-->', art)
html = html.replace('<!--__LIGHTS__-->', lights)
out='/Users/cotton/Develope/dolmagochi/design/livingroom/v2.html'
open(out,'w').write(html)
print('written', out, len(html))
