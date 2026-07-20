"""assemble_layers.py 의 오버레이 블록 + assemble_v2.py 의 정적 소품을
scene/props.js 로 옮긴다. (달·별·구름·비·눈·꽃잎·낙엽·반딧불·빗방울·성에·눈쌓임·
앙상한 가지·스탠드·스탠드 전구)

**1회성 마이그레이션 스크립트다.** 실행 후에는 props.js 가 진실의 원천이 된다.
이걸 옮기면 assemble_layers.py 를 old/ 로 내릴 수 있다.
"""
import re, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
la = open(os.path.join(HERE, 'assemble_layers.py')).read()
overlay = la.split("overlay = '''")[1].split("'''")[0]

asm = open(os.path.join(HERE, 'assemble_v2.py')).read()


def parse(svg):
    """중첩 <g> 를 따라가며 그룹별 rect 를 뽑는다.
    반환: [(gid, {cls, animClass}, [[x,y,w,h,color,opacity?], ...])]"""
    groups, stack = [], []
    tok = re.compile(r'<g\b([^>]*)>|</g>|<rect\b([^>]*)/>|<use\b([^>]*)/>')
    for m in tok.finditer(svg):
        if m.group(0).startswith('<g'):
            a = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(1) or ''))
            stack.append({'id': a.get('id'), 'class': a.get('class'),
                          'fill': a.get('fill'), 'opacity': a.get('opacity'),
                          'rects': []})
        elif m.group(0) == '</g>':
            g = stack.pop()
            if stack:                       # 자식 rect 는 부모로 합류(그룹 속성 상속)
                stack[-1]['rects'] += g['rects']
                if g['id'] or g['class']:
                    groups.append(g)
            else:
                groups.append(g)
        elif m.group(0).startswith('<rect'):
            a = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(2) or ''))
            fill = a.get('fill') or next((s['fill'] for s in reversed(stack) if s['fill']), '#000')
            mv = re.match(r'var\((--[\w-]+)\)', fill)
            rec = [int(a['x']), int(a['y']), int(a.get('width', 1)), int(a.get('height', 1)),
                   mv.group(1) if mv else fill]
            if 'opacity' in a:
                rec.append(float(a['opacity']))
            if stack:
                stack[-1]['rects'].append(rec)
    return groups


out = {}
for g in parse(overlay):
    gid = g['id']
    if not gid or not g['rects']:
        continue
    e = {'rects': g['rects']}
    if g['opacity']:
        e['opacity'] = float(g['opacity'])
    if g['class']:
        e['anim'] = g['class']
    out[gid] = e

# assemble_v2.py 안에 파이썬 문자열로 박혀 있는 정적 소품들
for name, marker in (('lamp', "lamp_obj = ("), ('tree-bare', "TB = ("),
                     ('lamp-glow', "lamp_glow = (")):
    i = asm.index(marker)
    seg = asm[i:asm.index('\n\n', i)]
    frag = ''.join(re.findall(r"'([^']*)'", seg))
    for g in parse(frag):
        if g['rects']:
            out.setdefault(name, {'rects': []})['rects'] += g['rects']

# fx-snowcap 은 lights f-string 안에 있어 위 마커에 안 걸린다
m = re.search(r'<g id="fx-snowcap"[^>]*>.*?</g>', asm, re.S)
for g in parse(m.group(0)):
    if g['rects']:
        out['fx-snowcap'] = {'rects': g['rects']}

# rain-tile 등 내부 타일 그룹은 부모(rain/snow/pt-*)에 이미 합류했으므로 중복 제거
for k in [k for k in out if k.endswith('-tile') or re.search(r'-tile-[ab]$', k)]:
    del out[k]

dst = os.path.join(HERE, '..', 'scene', 'props.js')
with open(dst, 'w') as f:
    f.write('// 자동 생성(tools/export_props.py) 후 **여기가 진실의 원천**이 된다. 직접 편집할 것.\n')
    f.write('// 창밖 천체·파티클·창문효과·스탠드 등 손으로 좌표를 찍은 소품들.\n')
    f.write('// rect: [x,y,w,h,색또는슬롯(,opacity)]  /  anim: CSS 애니메이션 클래스\n')
    f.write('export const PROPS = ')
    json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    f.write(';\n')

print('props.js:', ', '.join(f'{k}({len(v["rects"])})' for k, v in out.items()))
print('bytes:', os.path.getsize(dst))
