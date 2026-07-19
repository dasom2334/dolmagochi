import colorsys, re

art = open('art_svg.txt').read()
pal = open('palette_css.txt').read()

# ---- BASE 팔레트 파싱 → 방은 '중립 주광' 고정 팔레트로 변환 ----
base_lines = []
in_base = False
for line in pal.splitlines():
    if line.startswith('/*'):
        in_base = 'BASE' in line
    elif in_base and line.strip().startswith('--'):
        base_lines.append(line.strip())

NEUTRAL_PREFIXES = ('--s','--o','--rg','--pp','--pl','--cd','--b1x','--b2x','--b3x','--b4x','--b5x','--b6x')
SKIP = ('--sun',)  # --sun0/1은 template이 재정의

def neutral(hexc):
    r,g,b = (int(hexc[i:i+2],16)/255 for i in (1,3,5))
    a=0.08; tr,tg,tb=0.85,0.87,0.92
    r,g,b = r*(1-a)+tr*a, g*(1-a)+tg*a, b*(1-a)+tb*a
    h,l,s = colorsys.rgb_to_hls(r,g,b)
    l=min(0.9,l*1.16+0.01); s*=0.9
    r,g,b = colorsys.hls_to_rgb(h,l,s)
    return f"#{round(r*255):02x}{round(g*255):02x}{round(b*255):02x}"

out_lines=[]
for l in base_lines:
    name, val = l.split(':')
    name=name.strip(); val=val.strip().rstrip(';')
    if name.startswith(SKIP): continue
    if any(name.startswith(p) and name[len(p):].isdigit() for p in NEUTRAL_PREFIXES):
        out_lines.append(f"    {name}: {neutral(val)};")
    elif name.startswith(('--k','--h','--t')) and name[3:].isdigit() or name in ('--t0','--t1','--t2','--t3','--t4'):
        continue  # 하늘/언덕/나무는 template이 정의
    else:
        out_lines.append(f"    {name}: {val};")
BASE = '\n'.join(out_lines)

art = art.replace('id="leaves-wrap"', 'id="leaves"')

# ---- 클립 내부 오버레이 (풍경 위): 겨울나무·달·별·구름·파티클·유리 효과 ----
overlay = '''
<g id="tree-bare">
  <rect x="34" y="14" width="2" height="20" fill="var(--t3)"/>
  <rect x="33" y="32" width="4" height="1" fill="var(--t3)"/>
  <rect x="32" y="33" width="6" height="1" fill="var(--t3)"/>
  <rect x="31" y="16" width="3" height="1" fill="var(--t3)"/>
  <rect x="30" y="13" width="1" height="4" fill="var(--t3)"/>
  <rect x="37" y="15" width="3" height="1" fill="var(--t3)"/>
  <rect x="40" y="12" width="1" height="4" fill="var(--t3)"/>
  <rect x="34" y="10" width="1" height="4" fill="var(--t3)"/>
  <rect x="33" y="8"  width="1" height="3" fill="var(--t3)"/>
  <rect x="35" y="7"  width="1" height="2" fill="var(--t3)"/>
  <rect x="33" y="7"  width="2" height="1" fill="#e8edf4"/>
  <rect x="29" y="12" width="2" height="1" fill="#e8edf4"/>
  <rect x="40" y="11" width="2" height="1" fill="#e8edf4"/>
  <rect x="33" y="13" width="2" height="1" fill="#e8edf4"/>
  <rect x="30" y="15" width="2" height="1" fill="#e8edf4"/>
  <rect x="37" y="14" width="2" height="1" fill="#e8edf4"/>
</g>
<g id="moon">
  <rect x="55" y="13" width="3" height="1" fill="var(--moon)"/>
  <rect x="54" y="14" width="5" height="1" fill="var(--moon)"/>
  <rect x="53" y="15" width="7" height="3" fill="var(--moon)"/>
  <rect x="54" y="18" width="5" height="1" fill="var(--moon)"/>
  <rect x="55" y="19" width="3" height="1" fill="var(--moon)"/>
  <rect x="55" y="15" width="1" height="1" fill="var(--moon-cr)"/>
  <rect x="57" y="17" width="2" height="1" fill="var(--moon-cr)"/>
  <rect x="54" y="18" width="1" height="1" fill="var(--moon-cr)"/>
</g>
<g id="stars" fill="var(--star)">
  <rect class="twinkle-a" x="30" y="6"  width="1" height="1"/>
  <rect x="36" y="10" width="1" height="1"/>
  <rect class="twinkle-b" x="42" y="5"  width="1" height="1"/>
  <rect x="50" y="8"  width="1" height="1"/>
  <rect x="62" y="6"  width="1" height="1"/>
  <rect class="twinkle-a" x="64" y="14" width="1" height="1"/>
  <rect x="33" y="13" width="1" height="1"/>
  <rect x="45" y="12" width="1" height="1"/>
  <rect x="60" y="9"  width="1" height="3"/>
  <rect x="59" y="10" width="3" height="1"/>
</g>
<g id="clouds" class="cloud-drift">
  <rect x="30" y="6"  width="8"  height="2" fill="var(--cloud-1)"/>
  <rect x="29" y="7"  width="11" height="2" fill="var(--cloud-1)"/>
  <rect x="30" y="9"  width="9"  height="1" fill="var(--cloud-2)"/>
  <rect x="50" y="9"  width="10" height="2" fill="var(--cloud-1)"/>
  <rect x="48" y="10" width="13" height="2" fill="var(--cloud-1)"/>
  <rect x="50" y="12" width="10" height="1" fill="var(--cloud-2)"/>
  <rect x="40" y="14" width="6"  height="1" fill="var(--cloud-2)"/>
  <rect x="39" y="15" width="7"  height="1" fill="var(--cloud-2)"/>
  <rect x="62" y="16" width="5"  height="1" fill="var(--cloud-2)"/>
</g>
<g id="rain" opacity=".6">
  <g class="rain-fall">
    <g id="rain-tile" fill="var(--rain)">
      <rect x="29" y="6"  width="1" height="3"/><rect x="34" y="15" width="1" height="3"/>
      <rect x="39" y="9"  width="1" height="3"/><rect x="44" y="21" width="1" height="3"/>
      <rect x="49" y="5"  width="1" height="3"/><rect x="54" y="13" width="1" height="3"/>
      <rect x="59" y="24" width="1" height="3"/><rect x="63" y="8"  width="1" height="3"/>
      <rect x="31" y="28" width="1" height="3"/><rect x="36" y="26" width="1" height="3"/>
      <rect x="42" y="30" width="1" height="3"/><rect x="47" y="17" width="1" height="3"/>
      <rect x="52" y="32" width="1" height="3"/><rect x="57" y="20" width="1" height="3"/>
      <rect x="62" y="29" width="1" height="3"/><rect x="65" y="11" width="1" height="3"/>
    </g>
    <use href="#rain-tile" y="-30"/>
  </g>
</g>
<g id="snow" opacity=".9">
  <g class="snow-fall-a">
    <g id="snow-tile-a" fill="var(--snow-p)">
      <rect x="30" y="8"  width="1" height="1"/><rect x="35" y="18" width="1" height="1"/>
      <rect x="41" y="6"  width="1" height="1"/><rect x="46" y="24" width="1" height="1"/>
      <rect x="51" y="12" width="1" height="1"/><rect x="56" y="28" width="1" height="1"/>
      <rect x="60" y="7"  width="1" height="1"/><rect x="64" y="20" width="1" height="1"/>
      <rect x="33" y="30" width="1" height="1"/><rect x="44" y="14" width="1" height="1"/>
    </g>
    <use href="#snow-tile-a" y="-30"/>
  </g>
  <g class="snow-fall-b">
    <g id="snow-tile-b" fill="var(--snow-p)">
      <rect x="28" y="16" width="1" height="1"/><rect x="38" y="25" width="1" height="1"/>
      <rect x="43" y="10" width="1" height="1"/><rect x="49" y="31" width="1" height="1"/>
      <rect x="54" y="6"  width="1" height="1"/><rect x="58" y="15" width="1" height="1"/>
      <rect x="63" y="27" width="1" height="1"/><rect x="66" y="22" width="1" height="1"/>
    </g>
    <use href="#snow-tile-b" y="-30"/>
  </g>
</g>
<g id="pt-leaves">
  <g class="drift-a">
    <g id="leaf-tile" fill="#c07838">
      <rect x="31" y="7"  width="1" height="1"/><rect x="43" y="16" width="1" height="1" fill="#a05828"/>
      <rect x="55" y="5"  width="1" height="1" fill="#d08a3a"/><rect x="62" y="22" width="1" height="1"/>
      <rect x="37" y="27" width="1" height="1" fill="#a05828"/><rect x="49" y="30" width="1" height="1"/>
    </g>
    <use href="#leaf-tile" y="-30"/>
  </g>
  <g class="drift-b">
    <g id="leaf-tile-b" fill="#d08a3a">
      <rect x="34" y="12" width="1" height="1"/><rect x="58" y="9"  width="1" height="1" fill="#c07838"/>
      <rect x="46" y="23" width="1" height="1"/><rect x="64" y="31" width="1" height="1" fill="#a05828"/>
    </g>
    <use href="#leaf-tile-b" y="-30"/>
  </g>
</g>
<g id="pt-petals">
  <g class="drift-a">
    <g id="petal-tile" fill="#f0b8d0">
      <rect x="31" y="7"  width="1" height="1"/><rect x="43" y="16" width="1" height="1" fill="#e095b8"/>
      <rect x="55" y="5"  width="1" height="1"/><rect x="62" y="22" width="1" height="1" fill="#e095b8"/>
      <rect x="37" y="27" width="1" height="1"/><rect x="49" y="30" width="1" height="1" fill="#e095b8"/>
    </g>
    <use href="#petal-tile" y="-30"/>
  </g>
  <g class="drift-b">
    <g id="petal-tile-b" fill="#e8a8c6">
      <rect x="34" y="12" width="1" height="1"/><rect x="58" y="9"  width="1" height="1" fill="#f0b8d0"/>
      <rect x="46" y="23" width="1" height="1"/><rect x="64" y="31" width="1" height="1"/>
    </g>
    <use href="#petal-tile-b" y="-30"/>
  </g>
</g>
<g id="pt-fireflies" fill="#d8f090">
  <rect class="firefly-a" x="35" y="26" width="1" height="1"/>
  <rect class="firefly-b" x="52" y="24" width="1" height="1"/>
  <rect class="firefly-a" x="44" y="29" width="1" height="1"/>
  <rect class="firefly-b" x="60" y="27" width="1" height="1"/>
</g>
<g id="fx-drops" fill="#cfe0f5">
  <rect x="31" y="10" width="1" height="1" opacity=".55"/>
  <rect x="45" y="7"  width="1" height="1" opacity=".55"/>
  <rect x="58" y="12" width="1" height="1" opacity=".55"/>
  <rect x="37" y="20" width="1" height="1" opacity=".55"/>
  <rect x="63" y="18" width="1" height="1" opacity=".55"/>
  <rect x="50" y="26" width="1" height="1" opacity=".55"/>
  <rect x="29" y="28" width="1" height="1" opacity=".55"/>
  <rect x="41" y="14" width="1" height="3" opacity=".35"/>
  <rect x="55" y="21" width="1" height="3" opacity=".35"/>
</g>
<g id="fx-frost" fill="#dce8f8" opacity=".6">
  <rect x="27" y="4"  width="3" height="1"/><rect x="27" y="5"  width="2" height="1"/><rect x="27" y="6" width="1" height="1"/>
  <rect x="64" y="4"  width="3" height="1"/><rect x="65" y="5"  width="2" height="1"/><rect x="66" y="6" width="1" height="1"/>
  <rect x="27" y="33" width="3" height="1"/><rect x="27" y="32" width="2" height="1"/><rect x="27" y="31" width="1" height="1"/>
  <rect x="64" y="33" width="3" height="1"/><rect x="65" y="32" width="2" height="1"/><rect x="66" y="31" width="1" height="1"/>
</g>
'''
art = art.replace('</g>\n<!--PARTICLES-->', overlay + '\n</g>')

# ---- 조명 오버레이 + 창틀 눈쌓임 (씬 최상단 레이어) ----
def strips(fill, blend):
    s=f' style="mix-blend-mode:{blend}"'
    return (f'<rect x="0" y="0" width="96" height="4" fill="{fill}"{s}/>'
            f'<rect x="0" y="34" width="96" height="38" fill="{fill}"{s}/>'
            f'<rect x="0" y="4" width="27" height="30" fill="{fill}"{s}/>'
            f'<rect x="67" y="4" width="29" height="30" fill="{fill}"{s}/>')
def glass(fill, blend):
    return f'<rect x="27" y="4" width="40" height="30" fill="{fill}" style="mix-blend-mode:{blend}"/>'
def emissive(fire_a, candle_a):
    return (f'<rect x="5" y="38" width="14" height="10" fill="rgba(255,158,60,{fire_a})" style="mix-blend-mode:screen"/>'
            f'<rect x="3" y="23" width="5" height="8" fill="rgba(255,190,100,{candle_a})" style="mix-blend-mode:screen"/>')

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
  {emissive(".22",".08")}
</g>
<g id="light-night">
  {strips("rgba(72,82,150,.52)","multiply")}
  {strips("rgba(25,30,70,.28)","multiply")}
  {glass("rgba(30,38,90,.20)","multiply")}
  {emissive(".35",".15")}
</g>
<g id="light-cloud">
  {strips("rgba(158,165,180,.28)","multiply")}
  {glass("rgba(165,172,188,.22)","multiply")}
  {emissive(".10",".05")}
</g>
<g id="light-rain">
  {strips("rgba(105,116,142,.36)","multiply")}
  {glass("rgba(95,105,132,.28)","multiply")}
  {emissive(".14",".06")}
</g>
<g id="light-snow">
  {strips("rgba(182,190,208,.26)","multiply")}
  {glass("rgba(195,203,220,.20)","multiply")}
  {emissive(".10",".05")}
</g>
'''

html = open('template_layers.html').read()
# 낙엽/꽃잎 흔들림: margin 기반 sway 제거(SVG 미적용) → 단순 낙하 유지
html = html.replace(', sway 2.6s ease-in-out infinite','').replace(', sway 3.4s ease-in-out -1.2s infinite','')
html = html.replace('/*__BASE__*/', BASE)
html = html.replace('<!--__ART__-->', art)
html = html.replace('<!--__LIGHTS__-->', lights)
out='/Users/cotton/Develope/dolmagochi/design/livingroom/layers.html'
open(out,'w').write(html)
print('written', out, len(html))
