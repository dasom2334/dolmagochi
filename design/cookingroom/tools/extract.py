# 주방 정적 아트 추출 — SCENE-RULES.md 준수.
# reference/cookingroom/01-kitchen.png (이미 128×72·16색, 다운샘플 불필요)
#   → 디라이팅(무광원 알베도) → punch → 양자화 → 디스페클 → 셸 인페인팅 → 레이어 rect.
#
# 침실과 다른 점: 레퍼런스가 **네이티브 해상도**라 리사이즈 손실이 없다. 대신 노을·화덕빛이
# 아주 강하게 구워져 있어(전체가 붉은 단색에 가깝다) 디라이팅을 더 세게 건다.
from PIL import Image
import numpy as np, json, os

HERE = os.path.dirname(__file__)
REF = os.path.join(HERE, '..', '..', 'reference', 'cookingroom', '01-kitchen.png')
small = np.array(Image.open(REF).convert('RGB')).astype(float)
H, W, _ = small.shape
assert (H, W) == (72, 128), (H, W)


def box_blur(a, r):
    for ax in (0, 1):
        pad = [(r, r) if i == ax else (0, 0) for i in range(2)]
        if a.ndim == 3:
            pad += [(0, 0)]
        ap = np.pad(a, pad, mode='edge')
        c = np.cumsum(ap, axis=ax)
        n = 2 * r + 1
        s0 = [slice(None)] * a.ndim
        s1 = [slice(None)] * a.ndim
        s0[ax] = slice(n - 1, None)
        s1[ax] = slice(None, -n)
        z = list(c.shape)
        z[ax] = 1
        a = (c[tuple(s0)] - np.concatenate([np.zeros(z), c[tuple(s1)]], axis=ax)) / n
    return a


# 창 유리 = 발광체(노을). 디라이팅 대상이 아니고 어차피 절차 하늘로 뚫린다 →
# 플랫필드 계산에서 빼야 한다(창이 밝아서 주변 벽을 과하게 눌러 버린다).
GLASS = [(95, 10, 105, 25), (108, 10, 117, 25)]
emit = np.zeros((H, W), bool)
for (x0, y0, x1, y1) in GLASS:
    emit[y0:y1 + 1, x0:x1 + 1] = True

# 1) 휘도 플랫필드 — 광 웅덩이·글로우·비네트 제거, 색조 보존
lum = small.mean(2)
fill = np.median(lum[~emit])
lum_f = np.where(emit, fill, lum)
L = lum_f.copy()
for _ in range(3):
    L = box_blur(L, 12)
L = np.maximum(L, 12)
albedo = small * (L.mean() * 1.55 / L)[:, :, None]

# 2) 웜캐스트 중화 — 화덕·노을이 전부에 구워져 있어 침실(0.5)보다 세게 (0.62).
#    단 **원래부터 붉은 물건**(법랑 주전자)은 예외다. 전역 중화를 그대로 걸면 갈색이 되어
#    씬에서 유일한 색 앵커가 사라진다(§7 "어느 것"이 안 읽힌다) → 그 박스만 약하게.
FLOOR_Y = 51

# 소품 bbox. 돌(ORB)은 절차 생성이라 **지운다** — 셸로 메워 배경만 남긴다.
BOX = {
    'kt-door':   (7, 12, 25, 53),
    'kt-shelf':  (23, 31, 40, 50),
    'kt-broom':  (38, 27, 45, 50),
    'kt-rack':   (46, 11, 80, 26),
    'kt-pot':    (54, 20, 72, 40),
    'kt-table':  (43, 38, 88, 52),
    'kt-sink':   (87, 31, 127, 52),
}
ORB = (51, 45, 75, 69)
BOX_Q = list(BOX.values())

CHROMA_KEEP = [(54, 26, 72, 40)]                    # 주전자
Wc = albedo[~emit].reshape(-1, 3).mean(0)
Wc = Wc / Wc.mean()
expo = np.full((H, W), 0.62)
for (x0, y0, x1, y1) in CHROMA_KEEP:
    expo[y0:y1 + 1, x0:x1 + 1] = 0.40
albedo = albedo / (Wc[None, None, :] ** expo[:, :, None])

# 3) 채도 소폭 감소
l2 = albedo.mean(2, keepdims=True)
albedo = l2 + (albedo - l2) * 0.86

# 4) punch — 디라이팅으로 눌린 대비·채도 복원. 창(발광)은 제외.
alb = albedo / 255.0
lm = alb.mean(2, keepdims=True)
lm2 = np.clip(0.5 + (lm - 0.5) * 1.30, 0, 1)
lm2 = lm2 ** 0.80                                   # 어두운 구석 들어올림(원본이 매우 어둡다)
alb2 = alb * (lm2 / np.maximum(lm, 1e-4))
l3 = alb2.mean(2, keepdims=True)
# 채도 부스트도 **이미 붉은 물건은 예외**다. 주전자는 원본이 2톤(어두운 붉은 몸통 +
# 밝은 붉은 띠)뿐이라 ×1.42 를 걸면 둘 다 상한에 붙어 한 색으로 뭉개진다 — 형태가 사라진다.
sat = np.full((H, W), 1.42)
for (x0, y0, x1, y1) in CHROMA_KEEP:
    sat[y0:y1 + 1, x0:x1 + 1] = 1.05
alb2 = l3 + (alb2 - l3) * sat[:, :, None]
alb2 = np.where(emit[:, :, None], alb, alb2)        # 발광체는 원본 유지
albedo = np.clip(alb2 * 255, 0, 255)


# 4.5) 디셰이드 — 휘도 플랫필드(1단계)는 밝기만 펴서 **색조** 그라디언트가 남고,
#   punch 가 그걸 키운다. 바닥·벽은 화덕 쪽이 붉고 구석이 푸른 채로 남아 광 웅덩이로
#   읽힌다 → 영역마다 **채널별** 저주파 플랫필드로 나눈다.
#   저주파(웅덩이·색조) → 평탄화 / 고주파(석재 결·외곽선) → 반경보다 작아 보존.
def deshade(a, box, rad=10):
    x0, y0, x1, y1 = box
    reg = a[y0:y1 + 1, x0:x1 + 1].astype(float)
    bl = reg.copy()
    for _ in range(3):
        bl = box_blur(bl, rad)
    m = reg.reshape(-1, 3).mean(0)
    a[y0:y1 + 1, x0:x1 + 1] = np.clip(reg * (m[None, None, :] / np.maximum(bl, 1.0)), 0, 255)
    return a


#   ※ 벽에는 걸지 않는다 — 벽 전체를 덮으면 반경 안에 든 소품(문·주전자)까지 지역 평균으로
#     끌려가 색이 빠진다. 벽의 완만한 방사 그라디언트는 오버레이·비네트가 어차피 덮는다.
albedo = deshade(albedo, (0, 51, 127, 71), 14)      # 바닥 광 웅덩이
albedo = albedo.astype('uint8')
Image.fromarray(albedo).resize((W * 6, H * 6), Image.NEAREST).save(
    os.path.join(HERE, 'albedo_x6.png'))

# 5) **리전별** 양자화 (§6.2). 전역 k-means/medianCut 은 소수색을 먹는다 —
#    실제로 전역 36색에서 빨간 법랑 주전자가 통째로 나무 갈색에 흡수됐다.
#    소품마다 제 팔레트를 주면 그 안에서 붉은색이 살아남는다.
def quant(img, n):
    return np.array(Image.fromarray(img).quantize(
        colors=n, method=Image.MEDIANCUT).convert('RGB')).astype(int)


b = quant(albedo, 22)                                # 배경(벽·바닥·창틀)
for (x0, y0, x1, y1) in BOX_Q:
    b[y0:y1 + 1, x0:x1 + 1] = quant(albedo[y0:y1 + 1, x0:x1 + 1], 12)


# 6) 엣지보존 디테일 감소 — 외곽선은 두고 면 속 스펙클만 흡수
def despeckle(a, passes=2, thr=5):
    h, w, _ = a.shape
    for _ in range(passes):
        out = a.copy()
        for y in range(h):
            for x in range(w):
                cnt = {}
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        if dx == 0 and dy == 0:
                            continue
                        ny, nx = y + dy, x + dx
                        if 0 <= ny < h and 0 <= nx < w:
                            k = (a[ny, nx, 0], a[ny, nx, 1], a[ny, nx, 2])
                            cnt[k] = cnt.get(k, 0) + 1
                if not cnt:
                    continue
                mk = max(cnt, key=cnt.get)
                if cnt[mk] >= thr and mk != (a[y, x, 0], a[y, x, 1], a[y, x, 2]):
                    out[y, x] = mk
        a = out
    return a


b = despeckle(b)
Image.fromarray(b.astype('uint8')).save(os.path.join(HERE, 'base128.png'))

sprite = np.zeros((H, W), bool)
for (x0, y0, x1, y1) in BOX.values():
    sprite[y0:y1 + 1, x0:x1 + 1] = True
sprite[ORB[1]:ORB[3] + 1, ORB[0]:ORB[2] + 1] = True

# 7) 셸 인페인팅 — 소품·돌·유리를 뺀 배경(벽·바닥)을 같은 행 최근접 clean 셀로 메운다
shell = b.copy()
for y in range(H):
    cx = [x for x in range(W) if not sprite[y, x] and not emit[y, x]]
    if not cx:
        continue
    for x in range(W):
        if sprite[y, x] or emit[y, x]:
            shell[y, x] = b[y, min(cx, key=lambda c: abs(c - x))]


def hexc(c):
    return '#%02x%02x%02x' % (int(c[0]), int(c[1]), int(c[2]))


def rects(get, x0, y0, x1, y1):
    o = []
    for y in range(y0, y1 + 1):
        run = None
        for x in range(x0, x1 + 1):
            col = get(x, y)
            if col is None:
                if run:
                    o.append(run)
                    run = None
                continue
            hc = hexc(col)
            if run and run[2] == hc:
                run[1] += 1
            else:
                if run:
                    o.append(run)
                run = [x, 1, hc, y]
        if run:
            o.append(run)
    return [[r[0], r[3], r[1], 1, r[2]] for r in o]


groups = {}
for gid, (x0, y0, x1, y1) in BOX.items():
    groups[gid] = rects(
        lambda x, y: (b[y, x] if ((b[y, x] - shell[y, x]) ** 2).sum() > 26 * 26 else None),
        x0, y0, x1, y1)
groups['kt-wall'] = rects(lambda x, y: (None if emit[y, x] else shell[y, x]),
                          0, 0, W - 1, FLOOR_Y - 1)
groups['kt-floor'] = rects(lambda x, y: shell[y, x], 0, FLOOR_Y, W - 1, H - 1)

Z = ['kt-wall', 'kt-floor', 'kt-door', 'kt-sink', 'kt-rack', 'kt-shelf', 'kt-broom',
     'kt-table', 'kt-pot']
PROPS = ['kt-door', 'kt-shelf', 'kt-broom', 'kt-rack', 'kt-pot', 'kt-table', 'kt-sink']

with open(os.path.join(HERE, '..', 'geom-art.js'), 'w') as f:
    f.write('// 시안 A — 레퍼런스(reference/cookingroom/01-kitchen.png) 추출.\n')
    f.write('// 128×72 네이티브 → 디라이팅 → punch → 양자화 → 디스페클 → 셸 인페인팅.\n')
    f.write('// tools/extract.py 산출물. 손편집 금지 — 재추출로 갱신. SCENE-RULES.md 준수.\n')
    f.write('export const KT_ART = ' + json.dumps(groups, separators=(',', ':')) + ';\n')
    f.write('export const KT_ART_Z = ' + json.dumps(Z) + ';\n')
    f.write('export const KT_ART_PROPS = ' + json.dumps(PROPS) + ';\n')
    f.write('export const KT_GLASS = ' + json.dumps(GLASS) + ';\n')
    f.write('export const KT_FLOOR_Y = %d;\n' % FLOOR_Y)

print('wall', albedo[14, 60], 'floor', albedo[60, 20], 'table', albedo[44, 60])
print('done', {k: len(v) for k, v in groups.items()})
