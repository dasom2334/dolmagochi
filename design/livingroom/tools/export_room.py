"""art_svg_v2.txt 를 그룹별 rect 데이터로 파싱해 두 가지를 내보낸다.

../scene/room-data.js — 레퍼런스 측정 결과(추출 그룹). 절차 생성은 scene/generate.js 담당.

file:// 에서 fetch 가 막히므로 1)은 JSON이 아니라 JS 리터럴로 쓴다.
"""
import re, json, os, colorsys

HERE = os.path.dirname(os.path.abspath(__file__))

# 레퍼런스에서 측정으로 뽑은 것 — 절차 생성으로 대체할 수 없다
EXTRACTED = ['g-wall', 'g-winframe', 'g-fireplace', 'g-shelf',
             'bk-1', 'bk-2', 'bk-3', 'bk-4', 'bk-5', 'bk-6',
             'candle', 'sill-plant', 'floor-props', 'sun', 'fire']
art = open(os.path.join(HERE, 'art_svg_v2.txt')).read()


def group(gid):
    """<g id="gid">…</g> 안의 rect를 [x,y,w,h,slot(,opacity)]로. <g fill> 중첩 처리."""
    i = art.index('<g id="%s"' % gid)
    depth, j = 0, i
    while True:
        no, nc = art.find('<g', j), art.find('</g>', j)
        if no != -1 and no < nc:
            depth += 1; j = no + 2
        else:
            depth -= 1; j = nc + 4
            if depth == 0:
                break
    seg = art[i:j]
    out, cur = [], None
    for m in re.finditer(r'<g\b[^>]*fill="var\((--\w+)\)"[^>]*>|<g\b[^>]*>|<rect[^>]*/>', seg):
        t = m.group(0)
        if t.startswith('<g'):
            if m.group(1):
                cur = m.group(1)
            continue
        a = dict(re.findall(r'(\w+)="([^"]*)"', t))
        f = a.get('fill', '')
        mv = re.match(r'var\((--\w+)\)', f)
        slot = mv.group(1) if mv else (cur if f == '' else f)
        rec = [int(a['x']), int(a['y']), int(a.get('width', 1)), int(a.get('height', 1)), slot]
        if 'opacity' in a:
            rec.append(float(a['opacity']))
        out.append(rec)
    return out


# ---- 팔레트: BASE 블록. 하늘/산/나무/해는 template이 소유하므로 제외 ----
pal = {}
for line in open(os.path.join(HERE, 'palette_css_v2.txt')).read().split('/* DAY */')[0].splitlines():
    m = re.match(r'\s*(--\w+):\s*(#[0-9a-f]{6});', line)
    if m:
        pal[m.group(1)] = m.group(2)


def punch(hexv):
    """assemble_v2.py 와 동일한 대비 보정. 여기서 미리 적용해 JS는 색을 그대로 쓴다."""
    r, g, b = (int(hexv[i:i + 2], 16) / 255 for i in (1, 3, 5))
    h, l, s = colorsys.rgb_to_hls(r, g, b)
    l = min(.96, max(.04, 0.5 + (l - 0.5) * 1.38))
    s = min(1, s * 1.72)
    r, g, b = colorsys.hls_to_rgb(h, l, s)
    return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))


SKIP = re.compile(r'^--(k|h|t|sun)\d+$')   # template 소유 (하늘·산·나무·해)
EMISSIVE = re.compile(r'^--f\d+$')          # 불꽃은 광원이라 원색 유지
palette = {k: (v if EMISSIVE.match(k) else punch(v))
           for k, v in pal.items() if not SKIP.match(k)}

# ---- 출력 ----
groups = {g: group(g) for g in EXTRACTED}

# 촛불 화염은 발광체 → emission 레이어로 가야 밤에도 어두워지지 않는다.
# 원본에서 <g class="c-flame"> 로 감싸여 있으므로 그 범위만 떼어낸다.
ci = art.index('<g id="candle">')
fi = art.index('<g class="c-flame">', ci)
fe = art.index('</g>', fi)
flame = set()
for m in re.finditer(r'<rect[^>]*/>', art[fi:fe]):
    a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(0)))
    flame.add((int(a['x']), int(a['y'])))
groups['candle-flame'] = [r for r in groups['candle'] if (r[0], r[1]) in flame]
groups['candle'] = [r for r in groups['candle'] if (r[0], r[1]) not in flame]

# 벽난로 불꽃은 f-out/f-mid/f-core 3단이 서로 다른 주기로 흔들린다 → 분리해 둬야 애니메이션이 된다
fi2 = art.index('<g id="fire">')
for cls in ('f-out', 'f-mid', 'f-core'):
    try:
        s = art.index('<g class="%s">' % cls, fi2)
    except ValueError:
        continue
    e = art.index('</g>', s)
    cells = set()
    for m in re.finditer(r'<rect[^>]*/>', art[s:e]):
        a = dict(re.findall(r'(\w+)="([^"]*)"', m.group(0)))
        cells.add((int(a['x']), int(a['y'])))
    groups['fire-' + cls.split('-')[1]] = [r for r in groups['fire'] if (r[0], r[1]) in cells]
del groups['fire']

shipped = {'palette': palette, 'groups': groups}
out_js = os.path.join(HERE, '..', 'scene', 'room-data.js')
os.makedirs(os.path.dirname(out_js), exist_ok=True)
with open(out_js, 'w') as f:
    f.write('// 자동 생성 — tools/export_room.py. 손으로 고치지 말 것.\n')
    f.write('// 레퍼런스 측정 결과(추출 그룹). 재측정 전엔 고정.\n')
    f.write('export const ROOM_DATA = ')
    json.dump(shipped, f, separators=(',', ':'))
    f.write(';\n')

print('room-data.js: %d groups, %d rects, %dB'
      % (len(groups), sum(len(v) for v in groups.values()), os.path.getsize(out_js)))
