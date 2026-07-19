"""레퍼런스에서 '측정으로 추출한' 그룹만 JSON으로 내보낸다.
절차 생성(하늘·산·바닥·러그·돌·나무·광원)은 scene/scene.mjs가 런타임에 만든다."""
import re, json

EXTRACTED = ['g-wall','g-winframe','g-fireplace','g-shelf',
             'bk-1','bk-2','bk-3','bk-4','bk-5','bk-6',
             'candle','sill-plant','floor-props','sun','fire']

art = open('art_svg_v2.txt').read()

def group(gid):
    """<g id="gid"> ... </g> 안의 rect를 [x,y,w,slot]으로. <g fill> 중첩 처리."""
    i = art.index('<g id="%s"' % gid)
    depth, j = 0, i
    while True:
        no, nc = art.find('<g', j), art.find('</g>', j)
        if no != -1 and no < nc: depth += 1; j = no + 2
        else:
            depth -= 1; j = nc + 4
            if depth == 0: break
    seg = art[i:j]
    out, cur = [], None
    for m in re.finditer(r'<g\b[^>]*fill="var\((--\w+)\)"|<rect[^>]*/>', seg):
        t = m.group(0)
        if t.startswith('<g'): cur = m.group(1); continue
        a = dict(re.findall(r'(\w+)="([^"]*)"', t))
        f = a.get('fill', '')
        slot = re.match(r'var\((--\w+)\)', f)
        slot = slot.group(1) if slot else (cur if f == '' else f)
        rec = [int(a['x']), int(a['y']), int(a.get('width', 1)), int(a.get('height', 1)), slot]
        if 'opacity' in a: rec.append(float(a['opacity']))
        out.append(rec)
    return out

data = {gid: group(gid) for gid in EXTRACTED}

# 팔레트: BASE 블록에서 추출 그룹이 쓰는 슬롯만
pal = {}
for line in open('palette_css_v2.txt').read().split('/* DAY */')[0].splitlines():
    m = re.match(r'\s*(--\w+):\s*(#[0-9a-f]{6});', line)
    if m: pal[m.group(1)] = m.group(2)

json.dump({'palette': pal, 'groups': data},
          open('../scene/room-data.json', 'w'), separators=(',', ':'))
n = sum(len(v) for v in data.values())
print(f"groups={len(data)} rects={n} bytes={len(open('../scene/room-data.json').read())}")
