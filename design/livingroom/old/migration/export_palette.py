"""template_v2.html 의 CSS 변수 선언을 파싱해 scene/palette.js 로 옮긴다.

**1회성 마이그레이션 스크립트다.** 실행 후에는 palette.js 가 진실의 원천이 되고
이 스크립트는 역할이 끝난다(참고용으로만 남긴다).

CSS 캐스케이드를 JS로 재현하기 위해 규칙마다 (특이도, 문서순서)를 기록한다.
`#t-night:checked ~ #s-winter:checked ~ .scene` 처럼 축이 겹친 규칙은 ID가 2개라
단일 축 규칙보다 특이도가 높다 → 순서와 무관하게 항상 이긴다.
"""
import re, os, json

HERE = os.path.dirname(os.path.abspath(__file__))
css = open(os.path.join(HERE, 'template_v2.html')).read()
css = css[css.index('<style>'):css.index('</style>')]

AXIS = {'t': 'time', 's': 'season', 'w': 'weather', 'op': 'orb', 'tv': 'tree'}
NAME = {'t-day': 'day', 't-sunset': 'sunset', 't-night': 'night',
        's-spring': 'spring', 's-summer': 'summer', 's-autumn': 'autumn', 's-winter': 'winter',
        'w-clear': 'clear', 'w-cloud': 'cloud', 'w-rain': 'rain', 'w-snow': 'snow'}

rules = []   # (spec, order, cond{axis:value}, vars{slot:color})
order = 0
for m in re.finditer(r'([^{}]+)\{([^{}]*)\}', css):
    sel, body = m.group(1).strip(), m.group(2)
    decls = dict(re.findall(r'(--[\w-]+)\s*:\s*([^;]+);', body))
    if not decls:
        continue
    # .scene 자체를 겨냥하는 규칙만 (요소를 겨냥한 건 표시/숨김이라 JS 로직으로 옮긴다)
    if not re.search(r'\.scene\s*$', sel):
        continue
    ids = re.findall(r'#([\w-]+):checked', sel)
    cond = {}
    ok = True
    for i in ids:
        if i not in NAME:
            ok = False
            break
        cond[AXIS[i.split('-')[0]]] = NAME[i]
    if not ok:
        continue
    order += 1
    rules.append((len(ids), order, cond, {k: v.strip() for k, v in decls.items()}))

base = next((r[3] for r in rules if not r[2]), {})
axis_rules = [r for r in rules if len(r[2]) == 1]
comp_rules = [r for r in rules if len(r[2]) >= 2]


def bucket(axis):
    out = {}
    for spec, o, cond, v in axis_rules:
        if axis in cond:
            out.setdefault(cond[axis], {}).update(v)
    return out


def js(obj, ind=2):
    pad = ' ' * ind
    items = ',\n'.join(f'{pad}  {json.dumps(k)}: {json.dumps(v)}' for k, v in obj.items())
    return '{\n' + items + f'\n{pad}}}' if items else '{}'


out = ['// 자동 생성(tools/export_palette.py) 후 **여기가 진실의 원천**이 된다. 직접 편집할 것.',
       '// 슬롯 이름 → 색. 지오메트리는 슬롯 이름만 알고 색은 모른다(팔레트 교체로 48조합 표현).',
       '',
       '/** 시간·계절·날씨와 무관한 기본값 */',
       f'export const BASE = {js(base)};',
       '']
for axis in ('time', 'season', 'weather'):
    b = bucket(axis)
    out.append(f'export const {axis.upper()} = {{')
    for k, v in b.items():
        out.append(f'  {json.dumps(k)}: {json.dumps(v)},')
    out.append('};')
    out.append('')

out.append('/** 축이 겹칠 때만 적용되는 예외 (CSS 특이도가 높아 단일 축 규칙을 이긴다) */')
out.append('export const COMPOUND = [')
for spec, o, cond, v in comp_rules:
    out.append(f'  {{ when: {json.dumps(cond)}, vars: {json.dumps(v)} }},')
out.append('];')
out.append('''
/** BASE → 축별 → 컴파운드 예외 순으로 덮어써 최종 팔레트를 만든다 */
export function resolve(state, roomPalette = {}) {
  const p = { ...roomPalette, ...BASE };
  Object.assign(p, SEASON[state.season] || {});
  Object.assign(p, TIME[state.time] || {});
  Object.assign(p, WEATHER[state.weather] || {});
  for (const { when, vars } of COMPOUND)
    if (Object.entries(when).every(([k, v]) => state[k] === v)) Object.assign(p, vars);
  return p;
}''')

dst = os.path.join(HERE, '..', 'scene', 'palette.js')
open(dst, 'w').write('\n'.join(out) + '\n')
print(f'palette.js 생성 — BASE {len(base)}개 / '
      f'time {len(bucket("time"))} season {len(bucket("season"))} weather {len(bucket("weather"))} '
      f'/ compound {len(comp_rules)}개')
for spec, o, cond, v in comp_rules:
    print('  예외:', cond, '→', list(v))
