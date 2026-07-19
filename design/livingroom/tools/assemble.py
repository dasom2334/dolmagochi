art = open('art_svg.txt').read()
pal = open('palette_css.txt').read()

# 팔레트 파싱
sections = {}
cur = None
for line in pal.splitlines():
    if line.startswith('/*'):
        cur = 'base' if 'BASE' in line else ('day' if 'DAY' in line else 'night')
        sections[cur] = []
    elif line.strip().startswith('--'):
        sections[cur].append('    ' + line.strip())
BASE, DAY, NIGHT = ('\n'.join(sections[k]) for k in ('base','day','night'))

# 트리 그룹 id 정리
art = art.replace('id="leaves-wrap"', 'id="leaves"')

# 파티클/달/별/겨울나무/틴트를 클립 안으로 삽입
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
<rect x="27" y="4" width="40" height="30" fill="var(--out-tint)"/>
<rect x="27" y="4" width="40" height="30" fill="var(--weather-tint)"/>
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
'''
art = art.replace('</g>\n<!--PARTICLES-->', overlay + '\n</g>')

html = open('template.html').read()
html = html.replace('/*__BASE__*/', BASE)
html = html.replace('/*__DAY__*/', DAY)
html = html.replace('/*__NIGHT__*/', NIGHT)
html = html.replace('<!--__ART__-->', art)
out = '/Users/cotton/Develope/dolmagochi/design/livingroom/index.html'
open(out, 'w').write(html)
print('written', out, len(html), 'bytes')
