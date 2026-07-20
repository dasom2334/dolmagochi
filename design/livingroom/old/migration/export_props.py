"""assemble_layers.py 의 오버레이 블록 + assemble_v2.py 의 정적 소품을
scene/props.js 로 옮긴다. (달·별·구름·비·눈·꽃잎·낙엽·반딧불·빗방울·성에·눈쌓임·
앙상한 가지·스탠드·스탠드 전구)

출력 형태 — 애니메이션이 붙는 하위 레이어를 분리해 둔다:
  { rects: [...],                       // 정적 부분
    opacity: 0.6,                       // 그룹 투명도
    layers: [ {rects, anim:'snow-fall-a'}, ... ] }   // 각자 다른 주기로 움직인다

**1회성 마이그레이션 스크립트다.** 실행 후에는 props.js 가 진실의 원천이 된다.
"""
import re, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
la = open(os.path.join(HERE, 'assemble_layers.py')).read()
overlay = la.split("overlay = '''")[1].split("'''")[0]
asm = open(os.path.join(HERE, 'assemble_v2.py')).read()

ANIM_CLS = {'rain-fall', 'snow-fall-a', 'snow-fall-b', 'drift-a', 'drift-b',
            'cloud-drift', 'twinkle-a', 'twinkle-b', 'firefly-a', 'firefly-b'}


def parse_tree(svg):
    """<g>/<rect> 를 트리로. 반환: 최상위 노드 목록"""
    root, stack = [], []
    tok = re.compile(r'<g\b([^>]*)>|</g>|<rect\b([^>]*)/>|<use\b[^>]*/>')
    for m in tok.finditer(svg):
        s = m.group(0)
        if s.startswith('<g'):
            a = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(1) or ''))
            node = {'id': a.get('id'), 'cls': a.get('class'), 'fill': a.get('fill'),
                    'op': a.get('opacity'), 'rects': [], 'kids': []}
            (stack[-1]['kids'] if stack else root).append(node)
            stack.append(node)
        elif s == '</g>':
            stack.pop()
        elif s.startswith('<rect'):
            a = dict(re.findall(r'([\w-]+)="([^"]*)"', m.group(2) or ''))
            fill = a.get('fill') or next((n['fill'] for n in reversed(stack) if n['fill']), '#000')
            mv = re.match(r'var\((--[\w-]+)\)', fill)
            rec = [int(a['x']), int(a['y']), int(a.get('width', 1)), int(a.get('height', 1)),
                   mv.group(1) if mv else fill]
            if 'opacity' in a:
                rec.append(float(a['opacity']))
            if stack:
                # rect 자신에게 애니메이션 클래스가 붙는 경우가 있다(별·반딧불)
                stack[-1]['rects'].append((rec, a.get('class')))
    return root


def flatten(node):
    """애니메이션 클래스가 없는 rect·자식만 부모로 흡수"""
    out = [r for r, c in node['rects'] if c not in ANIM_CLS]
    for k in node['kids']:
        if k['cls'] in ANIM_CLS:
            continue
        out += flatten(k)
    return out


def collect(node):
    """애니메이션 하위 레이어를 (rects, anim) 목록으로. rect 단위 클래스도 모은다"""
    layers, byc = [], {}
    for r, c in node['rects']:
        if c in ANIM_CLS:
            byc.setdefault(c, []).append(r)
    for c, rs in byc.items():
        layers.append({'rects': rs, 'anim': c})
    for k in node['kids']:
        if k['cls'] in ANIM_CLS:
            layers.append({'rects': flatten(k), 'anim': k['cls']})
        else:
            layers += collect(k)
    return layers


out = {}
for node in parse_tree(overlay):
    gid = node['id']
    if not gid:
        continue
    e = {}
    static = flatten(node)
    if static:
        e['rects'] = static
    layers = collect(node)
    if layers:
        e['layers'] = layers
    if node['op']:
        e['opacity'] = float(node['op'])
    # 그룹 자신에게 애니메이션이 걸린 경우 (예: clouds)
    if node['cls'] in ANIM_CLS:
        e['anim'] = node['cls']
    if e:
        out[gid] = e

# assemble_v2.py 안에 파이썬 문자열로 박혀 있는 정적 소품들
for name, marker in (('lamp', "lamp_obj = ("), ('tree-bare', "TB = ("),
                     ('lamp-glow', "lamp_glow = (")):
    i = asm.index(marker)
    frag = ''.join(re.findall(r"'([^']*)'", asm[i:asm.index('\n\n', i)]))
    rects = []
    for n in parse_tree(frag):
        rects += flatten(n)
    if rects:
        out[name] = {'rects': rects}

# fx-snowcap 은 lights f-string 안에 있어 위 마커에 안 걸린다
m = re.search(r'<g id="fx-snowcap"[^>]*>.*?</g>', asm, re.S)
out['fx-snowcap'] = {'rects': sum((flatten(n) for n in parse_tree(m.group(0))), [])}

dst = os.path.join(HERE, '..', 'scene', 'props.js')
with open(dst, 'w') as f:
    f.write('// 자동 생성(tools/export_props.py) 후 **여기가 진실의 원천**이 된다. 직접 편집할 것.\n')
    f.write('// 창밖 천체·파티클·창문효과·스탠드 등 손으로 좌표를 찍은 소품들.\n')
    f.write('// rects=정적 / layers=각자 다른 주기로 움직이는 하위 레이어 / anim=애니메이션 종류\n')
    f.write('export const PROPS = ')
    json.dump(out, f, separators=(',', ':'), ensure_ascii=False)
    f.write(';\n')

for k, v in out.items():
    bits = [f"정적{len(v['rects'])}" if v.get('rects') else '']
    bits += [f"{l['anim']}({len(l['rects'])})" for l in v.get('layers', [])]
    if v.get('anim'):
        bits.append('@' + v['anim'])
    print(f'  {k:14s} ' + ' '.join(b for b in bits if b))
print('bytes:', os.path.getsize(dst))
