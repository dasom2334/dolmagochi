import math

art = open('art_svg_v2.txt').read()
pal = open('palette_css_v2.txt').read()

base_lines = []
in_base = False
for line in pal.splitlines():
    if line.startswith('/*'):
        in_base = 'BASE' in line
    elif in_base and line.strip().startswith('--'):
        base_lines.append(line.strip())
out_lines=[]
for l in base_lines:
    name = l.split(':')[0].strip()
    if name.startswith('--sun'): continue
    if (name.startswith(('--k','--h')) and name[3:-0 or None][:].isdigit() if False else False): pass
    if name.startswith('--k') and name[3:].isdigit(): continue
    if name.startswith('--h') and name[3:].isdigit(): continue
    if name.startswith('--t') and name[3:].isdigit(): continue
    out_lines.append('    '+l)
BASE='\n'.join(out_lines)

art = art.replace('id="leaves-wrap"', 'id="leaves"')

# 클립 내부 오버레이는 layers와 동일 — assemble_layers.py에서 재사용
import re
la = open('assemble_layers.py').read()
overlay = la.split("overlay = '''")[1].split("'''")[0]
art = art.replace('</g>\n<!--PARTICLES-->', overlay + '\n</g>')

# base-room → 벽/바닥/창틀·창턱/벽난로/책장 분할
m0 = art.index('<g id="base-room">')
m1 = art.index('</g>', m0)
body = art[m0+len('<g id="base-room">'):m1]
groups = {'wall':[], 'floor':[], 'winframe':[], 'fireplace':[], 'shelf':[]}
for line in body.strip().splitlines():
    mm = re.search(r'x="(-?\d+)" y="(-?\d+)" width="(\d+)"', line)
    if not mm: continue
    x,y,w = int(mm.group(1)), int(mm.group(2)), int(mm.group(3))
    cx = x + w/2
    if y >= 49: k='floor'
    elif cx >= 77 and y >= 15: k='shelf'
    elif cx <= 23 and 26 <= y <= 48: k='fireplace'
    elif 23 < cx < 74 and 2 <= y <= 37: k='winframe'
    else: k='wall'
    groups[k].append(line)
split = ''.join('<g id="g-%s">' % k + '\n'.join(v) + '</g>' for k,v in groups.items())
art = art[:m0] + split + art[m1+4:]

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
def pool(gid, y0, y1, skew, holes, zones, fillvar='var(--wl)', opvar='var(--wl-a)'):  # y0,y1 미사용
    parts=[f'<g id="{gid}" style="opacity:{opvar}">']
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
lp_sun_low = pool('lp-sun-low', 0, 0, 0.45,
                  holes=[(35,36,51,64),(35,36,28,32),(49,60,51,64),(49,52,28,32)],
                  zones=[(35,36,.9),(49,55,1),(56,62,.75),(63,69,.5)])
# 낮: 고고도 — 짧고 가파른 빔
lp_sun_day = pool('lp-sun-day', 0, 0, 0.12,
                  holes=[(35,36,51,64),(35,36,28,32),(49,54,51,64),(49,51,28,32)],
                  zones=[(35,36,.9),(49,53,.9),(54,58,.6)])
lp_sun = '<g id="lp-sun">' + lp_sun_low + lp_sun_day + '</g>'
lp_moon = pool('lp-moon', 0, 0, 0.45,
               holes=[(35,36,51,64),(35,36,28,32),(49,60,51,64),(49,52,28,32)],
               zones=[(35,36,.9),(49,55,1),(56,62,.75),(63,69,.5)],
               fillvar='var(--ml)', opvar='var(--ml-a)')

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
fire_shadow = ('<rect x="29" y="44" width="3" height="5" fill="#140c20" opacity=".30" style="mix-blend-mode:multiply"/>'
               '<rect x="32" y="45" width="3" height="4" fill="#140c20" opacity=".18" style="mix-blend-mode:multiply"/>'
               '<rect x="35" y="46" width="2" height="3" fill="#140c20" opacity=".10" style="mix-blend-mode:multiply"/>')
lp_fire = ('<g id="lp-fire" style="opacity:var(--fl-a)"><g class="glow-flicker">'
           + ''.join(fire_parts) + fire_shadow + '</g></g>')

cd_parts = rings(5, 26, 1.0, [(0,3,.9),(3,5,.45),(5,7,.2)], (20,32), (1,13), 'var(--cl)')
lp_candle = ('<g id="lp-candle" style="opacity:var(--cl-a)"><g class="glow-flicker-slow">'
             + ''.join(cd_parts) + '</g></g>')

lamp_parts  = rings(74, 35, 1.0, [(0,5,.55),(5,9,.32),(9,13,.16)], (26,48), (62,94), 'var(--ll)')
lamp_parts += rings(74, 47, 1.5, [(0,7,.8),(7,12,.4),(12,16,.2)], (49,58), (62,94), 'var(--ll)')
lp_lamp = '<g id="lp-lamp" style="opacity:var(--ll-a)">' + ''.join(lamp_parts) + '</g>'

lights = lights + lp_sun + lp_moon + lp_fire + lp_candle + lp_lamp

html = open('template_v2.html').read()
html = html.replace(', sway 2.6s ease-in-out infinite','').replace(', sway 3.4s ease-in-out -1.2s infinite','')
html = html.replace('/*__BASE__*/', BASE)
html = html.replace('<!--__ART__-->', art)
html = html.replace('<!--__LIGHTS__-->', lights)
out='/Users/cotton/Develope/dolmagochi/design/livingroom/v2.html'
open(out,'w').write(html)
print('written', out, len(html))
