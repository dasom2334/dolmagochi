# 침실 창밖 배경 — reference/backgrounds/02-workroom-window-moon-hd.png
#
# **레퍼런스 한 장이 창 안에 걸린 그림**이 되도록 맞춘다. 창(x22~54, y7~31 = 33×25)에
# 레퍼런스 전체 구도(능선·구름·숲·오른쪽 침엽수)가 들어오고, 창 밖 캔버스는
# 좌우 미러 반복 + 위아래 연장으로 채운다(벽이 덮으므로 뷰어에서만 보인다).
#
# 달은 뺀다 — 해·달·별은 시간대에 따라 게임이 따로 그린다(BD_SUN/BD_MOON/BD_STARS).
# 레퍼런스의 달을 같이 구우면 낮에도 달이 뜨고 밤엔 달이 둘이 된다.
#
# 색은 팔레트 슬롯으로 바꾼다(SCENE-RULES: 조명·계절을 굽지 않는다):
#   하늘 → --k0..k9 (행 기울기). 구름 띠는 같은 기울기의 밝은 쪽 단계.
#   능선 → 밝기 순 --h3(먼 산) / --h2 / --h1        숲·나무 → --t0
from PIL import Image
import numpy as np, os, json

HERE = os.path.dirname(__file__)
REF = os.path.join(HERE, '..', '..', 'reference', 'backgrounds', '02-workroom-window-moon-hd.png')
GX, GY = 128, 49
WX0, WY0, WW, WH = 22, 7, 33, 25            # 창 개구부 (glass 바깥 테두리)

im = Image.open(REF).convert('RGB')
W, H = im.size
# 달을 지운다 — 위쪽 왼편. 그 자리를 오른쪽 하늘로 덮어 자연스럽게 메운다
a = np.array(im)
mx0, mx1, my0, my1 = int(W * 0.17), int(W * 0.34), 0, int(H * 0.34)
a[my0:my1, mx0:mx1] = a[my0:my1, mx0 + (mx1 - mx0):mx1 + (mx1 - mx0)]
im = Image.fromarray(a)

# 창은 33x25 뿐이라 넓은 원경을 통째로 넣으면 다 뭉개진다. 레퍼런스에서
# **침엽수와 봉우리가 살아나는 부분만** 확대해 잡는다 — 오른쪽 침엽수, 그 왼쪽
# 능선 봉우리들, 아래 숲, 위로 구름 띠. 창 비율(33:25)에 맞춘 사각형이다.
CH = int(H * 0.66)
CW = int(CH * (WW / WH))
cx0 = min(W - CW, int(W * 0.52))
cy0 = int(H * 0.28)
tile = im.crop((cx0, cy0, cx0 + CW, cy0 + CH)).resize((WW, WH), Image.BOX)

q = np.array(tile.quantize(colors=7, method=Image.MEDIANCUT).convert('RGB')).astype(int)
lum = q.sum(2)
LEV = sorted(set(map(int, lum.flatten())))
DARK, MOUNT = LEV[0], set(LEV[-2:])
TERRAIN = {DARK} | MOUNT | {LEV[-3]}

raw = []
for x in range(WW):
    col = lum[:, x]; top = WH
    for y in range(WH):
        if (col[y] in MOUNT or col[y] == DARK) and np.isin(col[y:], list(TERRAIN)).mean() > 0.7:
            top = y; break
    raw.append(top)
sky = [int(np.median([raw[min(WW - 1, max(0, x + d))] for d in (-2, -1, 0, 1, 2)])) for x in range(WW)]

MOUNT_SLOT = {LEV[-1]: '--h3', LEV[-2]: '--h2', LEV[-3]: '--h1'}
def slot_at(tx, ty, canvasY):
    base = max(0, min(9, round((canvasY - 2) / 2.4)))
    L = int(lum[ty, tx])
    if ty < sky[tx]:
        med = np.median([int(lum[yy, tx]) for yy in range(sky[tx])] or [L])
        return f'--k{min(9, base + 2)}' if L > med else f'--k{base}'
    return '--t0' if L == DARK else MOUNT_SLOT.get(L, '--h1')

# ── 캔버스로 펼치기: 창 밖은 좌우 **미러 반복**, 위아래는 가장자리 행을 잇는다
def tile_x(x):
    d = x - WX0
    p = d % (WW * 2)
    return p if p < WW else (WW * 2 - 1 - p)          # 0..WW-1 왕복
rows = []
for y in range(GY):
    ty = min(WH - 1, max(0, y - WY0))                 # 위아래는 가장자리 행 연장
    for x in range(GX):
        rows.append([y, x, slot_at(tile_x(x), ty, y)])

out = []
for y in range(GY):
    run = None
    for x in range(GX):
        c = rows[y * GX + x][2]
        if run and run[2] == c: run[3] += 1
        else:
            if run: out.append(run)
            run = [x, y, c, 1]
    if run: out.append(run)
rects = [[r[0], r[1], r[3], 1, r[2]] for r in out]

with open(os.path.join(HERE, '..', 'scenery-art.js'), 'w') as f:
    f.write('// 침실 창밖 배경 — reference/backgrounds/02-workroom-window-moon-hd.png 추출.\n')
    f.write('// tools/scenery.py 산출물. 손편집 금지 — 재추출로 갱신.\n')
    f.write('// 레퍼런스 한 장이 창(x22~54,y7~31) 안에 꽉 차게 들어가고, 창 밖은 미러 반복.\n')
    f.write('// 색은 팔레트 슬롯이라 사계절·시간대가 따라온다. 달은 게임이 따로 그린다.\n')
    f.write('export const BD_SCENERY = ' + json.dumps(rects, separators=(',', ':')) + ';\n')
tile.resize((WW * 12, WH * 12), Image.NEAREST).save(os.path.join(HERE, 'scenery_tile.png'))
print('rect', len(rects), '| crop', (cx0, cy0, cx0+CW, cy0+CH))
