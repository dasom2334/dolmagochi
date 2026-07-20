// 광원·오버레이 — assemble_v2.py 의 포팅.
// 좌표는 **캔버스(128×72) 기준**. 아트(96 폭)에서 온 값은 +OX(16) 되어 있다.
// 광원은 "셰이프 1장 + 상태별 색·세기"다. 셰이프는 시간이 바뀌어도 변하지 않고,
// 팔레트의 --wl/--ml/--fl/--cl/--ll 과 그 -a(세기)만 바뀐다.

import { GX, GY } from './generate.js';

// ─────────────────── 색감 오버레이 (시간 / 날씨) ───────────────────
// 방 영역만 덮는 4조각 + 창유리 1조각. 창은 벽의 구멍이라 따로 다룬다.
// 유리 틴트는 일부러 약하다 — 하늘 팔레트가 이미 그 시간·계절의 색이라 이중 착색이 된다.
//
// zone 태그: 창 구멍 **앞뒤에 놓인 소품**은 이 잘린 영역 때문에 '유리' 취급을 받아
// 방보다 훨씬 옅게 착색됐다. 그 소품들에 방과 같은 세기를 다시 먹이려면
// 어느 값이 '방' 값인지 render.js 가 알아야 한다.
export const GLASS_RECT = [43, 4, 40, 30];
const strips = (fill, blend) => [
  { r: [0, 0, 128, 4], fill, blend, zone: 'room' },
  { r: [0, 34, 128, 38], fill, blend, zone: 'room' },
  { r: [0, 4, 43, 30], fill, blend, zone: 'room' },      // 창 왼쪽 벽 (창 x43~83)
  { r: [83, 4, 45, 30], fill, blend, zone: 'room' },     // 창 오른쪽 벽
];
const glass = (fill, blend) => [{ r: GLASS_RECT, fill, blend, zone: 'glass' }];

/** 색감 오버레이별 앰비언트 세기 — v3 패널 슬라이더가 여기를 직접 고친다(런타임 가변).
 *
 *  세 층이 하는 일이 서로 다르다:
 *    screen      밝히지만 R·G·B 를 같이 올려 **채도를 깎는다**(뿌예짐)
 *    overlay     밝은 곳은 더 밝게 어두운 곳은 더 어둡게 — **대비**를 벌린다
 *    saturation  명도는 그대로 두고 **채도만** 얹는다(세게 주면 벽이 자홍색이 된다)
 *
 *  낮·노을·밤은 패널에서 직접 맞춰 본 값이다. 셋 다 screen 을 거의 버리고
 *  overlay 로 대비를 세우는 쪽으로 수렴했다 — 밝히는 것보다 벌리는 게 낫다는 뜻.
 *  나머지(흐림·비·눈·꽃잎)는 예전 screen 세기를 그대로 옮겨 둔 출발점이라
 *  overlay·saturation 이 0 이고, 아직 손보지 않은 상태다. */
export const AMBIENT = {
  'light-day':      { screen: 0.11, overlay: 0.31, saturation: 0.10 },
  'light-sunset':   { screen: 0.04, overlay: 0.30, saturation: 0.18 },
  'light-night':    { screen: 0.03, overlay: 0.22, saturation: 0.08 },
  'light-cloud':    { screen: 0.10, overlay: 0,    saturation: 0 },
  'light-fog':      { screen: 0.16, overlay: 0,    saturation: 0 },
  'light-rain':     { screen: 0,    overlay: 0,    saturation: 0 },
  'light-downpour': { screen: 0,    overlay: 0,    saturation: 0 },
  'light-snow':     { screen: 0,    overlay: 0,    saturation: 0 },
  'light-petals':   { screen: 0,    overlay: 0,    saturation: 0 },
};

/** 층별 색. 세기가 0 이어도 색은 정해 둬야 슬라이더를 올렸을 때 말이 되는 그림이 나온다.
 *  screen 색만 오버레이마다 다르다(그 시간·날씨의 하늘빛). overlay·saturation 은
 *  방의 따뜻한 쪽으로 공통 — 대비와 채도는 색을 바꾸는 게 아니라 있는 색을 벌리는 일이라. */
const AMB_TINT = {
  'light-day':      '140,170,208',
  'light-sunset':   '255,120,40',
  'light-night':    '60,72,140',
  'light-cloud':    '200,214,236',
  'light-fog':      '150,158,172',
  'light-rain':     '120,132,160',
  'light-downpour': '92,104,134',
  'light-snow':     '200,208,226',
  'light-petals':   '255,224,236',
};
const tuned = (list, key) => list.map((o) => ({ ...o, tune: key }));
/** 오버레이 하나의 앰비언트 3층 — 아홉 오버레이가 전부 같은 구조를 갖는다.
 *  예전엔 낮에만 있었는데, 그러면 다른 시간·날씨는 슬라이더로 만질 대상이 아예 없다. */
const ambient = (oid) => [
  ...tuned(strips(`rgba(${AMB_TINT[oid]},1)`, 'screen'), 'screen'),
  ...tuned(strips('rgba(255,238,214,1)', 'overlay'), 'overlay'),
  ...tuned(strips('rgba(255,150,90,1)', 'saturation'), 'saturation'),
];

export const OVERLAYS = {
  // 낮은 multiply만으로는 실내가 밤과 구분이 안 된다 → 앰비언트로 방을 들어올린다.
  //
  // 예전엔 그 들어올림이 screen 30% 청회색 하나였는데, screen 은 **밝히면서 채도를
  // 깎는다**(R·G·B 를 다 같이 끌어올리므로 색끼리 벌어진 폭이 줄어든다).
  // 그래서 낮에는 방 전체가 뿌옜고, 창빛 웅덩이가 떨어지는 자리의 소품(담요)은
  // 아예 흰 몽우리가 됐다.
  // → 세 겹으로 나눈다:
  //   ① screen 은 방을 밤과 구분할 최소한(.14)만 — 어두운 구석을 들어올리는 몫
  //   ② overlay 로 대비를 준다 — 밝은 곳은 더 밝게, 어두운 곳은 더 어둡게.
  //      screen 과 달리 채도를 안 깎고 오히려 벌린다
  //   ③ saturation 은 **명도를 안 건드리고 채도만** 얹는다(합성 결과의 휘도는
  //      아래 레이어 것을 그대로 쓴다) — 밝기 예산을 안 쓰고 색만 살리는 유일한 수단
  // 세기는 AMBIENT 로 뺐다 — v3 패널에서 오버레이별로 슬라이더로 만져 볼 수 있게.
  // tune 이 붙은 층은 fill 의 알파를 1 로 두고 AMBIENT[oid][tune] 이 실제 세기가 된다.
  'light-day': [
    ...strips('rgba(255,246,230,.06)', 'multiply'),
    ...ambient('light-day'),
    ...glass('rgba(255,252,245,.05)', 'screen'),
  ],
  // 하늘 팔레트가 이미 그 시간의 색이라 유리 틴트는 약하게 (이중 착색 방지)
  'light-sunset': [
    ...strips('rgba(255,148,84,.30)', 'multiply'),
    ...ambient('light-sunset'),
    ...glass('rgba(255,140,80,.16)', 'multiply'),
  ],
  'light-night': [
    ...strips('rgba(72,82,150,.52)', 'multiply'),
    ...strips('rgba(25,30,70,.28)', 'multiply'),
    ...ambient('light-night'),
    ...glass('rgba(30,38,90,.09)', 'multiply'),
  ],
  // 흐림 2종 — 구름낀 흐림은 구름 사이로 해가 나므로 덜 누르고 살짝 들어올린다,
  // 안개낀 흐림은 해가 완전히 가려 평평하게 눌린다
  'light-cloud': [...strips('rgba(176,184,198,.18)', 'multiply'),
                  ...ambient('light-cloud'),
                  ...glass('rgba(190,200,216,.12)', 'multiply')],
  'light-fog': [...strips('rgba(158,165,180,.30)', 'multiply'),
                ...ambient('light-fog'),
                ...glass('rgba(170,178,192,.34)', 'screen')],
  'light-rain': [...strips('rgba(105,116,142,.36)', 'multiply'), ...ambient('light-rain'),
                 ...glass('rgba(95,105,132,.28)', 'multiply')],
  'light-snow': [...strips('rgba(182,190,208,.26)', 'multiply'), ...ambient('light-snow'),
                 ...glass('rgba(195,203,220,.20)', 'multiply')],
  // 게임 날씨 추가분 — 폭우는 비보다 더 눌러 어둡게, 꽃잎·낙엽은 맑음에 가깝게 살짝만
  'light-downpour': [...strips('rgba(78,88,116,.46)', 'multiply'), ...ambient('light-downpour'),
                     ...glass('rgba(70,80,108,.38)', 'multiply')],
  'light-petals': [...strips('rgba(255,224,236,.10)', 'multiply'), ...ambient('light-petals')],
};

// ─────────────────── 창문 빛: 앞으로 퍼지는 사다리꼴 ───────────────────
// 창(27..66, 멀리언 46..47)을 창턱 상단과 바닥에 투영한다. 창 밑 벽은 그림자.
// **셰이프는 낮·노을·밤 하나로 통일** — 바뀌는 건 색과 세기뿐(README §3.3).
const WIN_SPREAD = 0.035, WIN_SKEW = 0.55;
const WIN_ZONES = [[35, 36, 0.9], [49, 55, 1], [56, 62, 0.75], [63, 69, 0.5]];

function poolTrap(slot) {
  const CX = 62.5, out = [];        // 창 중심 (아트 46.5 + OX)
  for (const [zy0, zy1, op] of WIN_ZONES) {
    for (let y = zy0; y <= zy1; y++) {
      const t = y <= 36 ? 0 : y - 48;
      const s = 1 + WIN_SPREAD * t, sh = -WIN_SKEW * t;
      const a = CX + (43 - CX) * s + sh, b = CX + (83 - CX) * s + sh;
      const m0 = CX + (62 - CX) * s + sh, m1 = CX + (64 - CX) * s + sh;
      for (const [p0, q0] of [[a, m0 - 1], [m1, b - 1]]) {
        const p = Math.max(1, Math.round(p0)), q = Math.min(126, Math.round(q0));
        if (q >= p) out.push({ r: [p, y, q - p + 1, 1], slot, alpha: op, blend: 'screen' });
      }
    }
  }
  return out;
}

// ─────────────────── 점광원: 역제곱 감쇠 3단 링 ───────────────────
function rings(cx, cy, ysquash, bands, yr, xclamp, slot) {
  const out = [];
  for (let y = yr[0]; y <= yr[1]; y++) {
    const dy = (y - cy) * ysquash;
    for (const [rIn, rOut, op] of bands) {
      const w2o = rOut * rOut - dy * dy;
      if (w2o <= 0) continue;
      const xo = Math.sqrt(w2o);
      const w2i = rIn * rIn - dy * dy;
      const xi = w2i > 0 ? Math.sqrt(w2i) : 0;
      const segs = xi > 0 ? [[cx - xo, cx - xi], [cx + xi, cx + xo]] : [[cx - xo, cx + xo]];
      for (const [a0, b0] of segs) {
        const a = Math.max(xclamp[0], Math.round(a0)), b = Math.min(xclamp[1], Math.round(b0));
        if (b > a) out.push({ r: [a, y, b - a, 1], slot, alpha: op, blend: 'screen' });
      }
    }
  }
  return out;
}

export const LIGHTS = {
  'lp-sun':  { rects: poolTrap('--wl'), alphaSlot: '--wl-a', mask: 'm-win' },
  'lp-moon': { rects: poolTrap('--ml'), alphaSlot: '--ml-a', mask: 'm-win' },
  'lp-fire': {
    // 위쪽 글로우의 y범위를 링 반지름보다 좁게 잡으면 타원이 잘려 **윗변이 직선**이 된다.
    // 반지름이 닿는 y(43-20=23)까지 열어 타원이 스스로 닫히게 한다.
    // 벽난로가 앞으로 나오면서(generate.js BOX_FW) 아궁이도 왼쪽·아래로 옮겨졌다
    rects: [...rings(21.7, 48.4, 1.6, [[0, 11, 1], [11, 18, 0.55], [18, 25, 0.28]], [52, 68], [1, 126], '--fl'),
            ...rings(21.7, 46.1, 1.0, [[0, 9, 0.45], [9, 16, 0.28], [16, 23, 0.14]], [23, 52], [1, 36], '--fl')],
    alphaSlot: '--fl-a', mask: 'm-fire', anim: 'glow-flicker',
  },
  'lp-lamp': {
    rects: [...rings(90, 35, 1.0, [[0, 5, 0.55], [5, 9, 0.32], [9, 13, 0.16]], [26, 48], [78, 110], '--ll'),
            ...rings(90, 47, 1.5, [[0, 7, 0.8], [7, 12, 0.4], [12, 16, 0.2]], [49, 58], [78, 110], '--ll')],
    alphaSlot: '--ll-a',
  },
};

// ─────────────────── 그림자: Light Mask + 오클루더 ───────────────────
// 소품을 끄면 그 그림자도 사라지고 빛이 통과한다. 회색 단계 = 반그림자.
function occStrip(x0, w, y0, y1, skew, base, grow = 0.03, sill = null) {
  const r = [];
  if (sill) r.push({ r: [sill[0], 35, sill[1], 2], g: 0 });
  const n = Math.max(1, y1 - y0);
  for (let y = y0; y <= y1; y++) {
    const sh = -Math.round(skew * (y - base));
    const gw = Math.round(w * (1 + grow * (y - y0)));
    const f = (y - y0) / n;
    const g = f < 0.4 ? 0 : f < 0.75 ? 0.4 : 0.667;   // #000 / #666 / #aaa
    r.push({ r: [x0 + sh - Math.floor((gw - w) / 2), y, gw, 1], g });
  }
  return r;
}

/** 소품 bbox 하나로 **창광 오클루더**를 만든다.
 *  OCCLUDERS 도 손으로 적는 목록이었다 → 새로 그린 소품마다 그림자가 빠졌다.
 *  GROUNDED 와 똑같은 함정이라 같은 방식으로 뒤집는다: bbox 만 주면 여기서 만든다.
 *  render.js 가 접지 그림자를 받는 소품 전부에 대해 자동 등록한다 —
 *  **바닥에 놓인 물건이 창빛을 통과시킬 리 없다.** */
export function occForProp(x0, x1, yBottom) {
  const w = Math.max(2, x1 - x0 - 1);
  const sx = x0 + 1;
  // 창턱 선반(밑변 y35) 위의 것: 선반에도 자국을 남기고(sill) 바닥까지 늘어진다
  if (yBottom <= 40) {
    return occStrip(sx, w, 49, 49 + Math.max(4, Math.round(w * 0.8)), 0.55, 48, 0.03, [sx, w]);
  }
  return occStrip(sx, w, yBottom + 1, yBottom + 1 + Math.max(4, Math.round(w * 0.7)), 0.55, yBottom, 0.05);
}

export const OCCLUDERS = {
  'm-win': {
    'occ-orb':   occStrip(70, 9, 49, 56, 0.55, 48, 0.03, [70, 9]),
    // 화분을 새로 그리며 폭 5→8, 높이 5→9 로 커졌다 → 그림자도 넓고 길게
    'occ-plant': occStrip(44, 8, 49, 54, 0.55, 48, 0.03, [44, 8]),
    'occ-props': occStrip(37, 8, 49, 52, 0.55, 48, 0),
    // 러그 돌은 밑면(y61/x42-51)에서 시작해야 발밑에 붙는다
    'occ-orb2':  occStrip(58, 10, 62, 68, 0.55, 61, 0.05),
  },
  // 아궁이가 왼쪽·아래로 옮겨진 만큼 그림자도 함께 옮긴다
  'm-fire': {
    'occ-props': [{ r: [39, 46, 3, 5], g: 0.5 }, { r: [42, 47, 3, 4], g: 0.69 },
                  { r: [45, 48, 2, 3], g: 0.82 }, { r: [20, 63, 12, 3], g: 0.6 }],
    'occ-orb2':  [{ r: [63, 56, 5, 8], g: 0.53 }, { r: [68, 58, 4, 6], g: 0.73 }],
  },
};

// ─────────────────── 대비 강화 그림자 레이어 ───────────────────
// 이전 판은 화면 네 변에 1px 띠 5줄(비네트) + 큰 사각 5장(AO)이었다.
// 사각형으로 보였던 건 알파 단계가 얕아서가 아니라 **모양이 진짜 사각형**이었기 때문.
// → 거리장을 계산해 3~4단으로 양자화한다. 계단은 남기되(도트답게) 테두리는 없앤다.

/** 셀 [y,x,level] 을 가로 병합해 레벨별 rect 로. level 0 은 버린다 */
function bandRects(cells, steps, fill) {
  const byRow = new Map();
  for (const [y, x, lv] of cells) {
    if (!lv) continue;
    if (!byRow.has(y)) byRow.set(y, []);
    byRow.get(y).push([x, lv]);
  }
  const out = [];
  for (const y of [...byRow.keys()].sort((a, b) => a - b)) {
    const row = byRow.get(y).sort((a, b) => a[0] - b[0]);
    let i = 0;
    while (i < row.length) {
      let j = i;
      while (j + 1 < row.length && row[j + 1][0] === row[j][0] + 1 && row[j + 1][1] === row[i][1]) j++;
      out.push({ r: [row[i][0], y, row[j][0] - row[i][0] + 1, 1], fill,
                 alpha: steps[row[i][1] - 1], blend: 'multiply' });
      i = j + 1;
    }
  }
  return out;
}

/** 계단 경계에 해시 지터를 섞어 등고선이 매끈한 곡선으로 보이지 않게 (도트 질감) */
const jit = (x, y, s) => (((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) >>> 0) % 100 / 100;

// 비네트 — 화면 중심에서의 타원 거리.
// 순수한 타원이면 등고선이 너무 반듯해 "도형을 덧댄" 티가 난다.
// → 각도에 따라 반지름을 저주파로 흔들고(찌그러진 타원), 중심도 창 쪽으로 살짝 옮긴다.
//   빛이 창에서 들어오니 어둠의 중심이 화면 정중앙일 이유가 없다.
const VIG_CX = 60, VIG_CY = 40;
export const VIGNETTE = (() => {
  const cells = [];
  const CUTS = [0.60, 0.76, 0.90, 1.02];        // 4단
  for (let y = 0; y < GY; y++)
    for (let x = 0; x < GX; x++) {
      const dx = (x - VIG_CX) / (GX * 0.52), dy = (y - VIG_CY) / (GY * 0.56);
      const a = Math.atan2(dy, dx);
      // 각도 3·5·2주기를 겹쳐 어느 방향으로도 반복이 안 보이게 (±14%)
      const warp = 1 + 0.085 * Math.sin(a * 3 + 0.7)
                     + 0.05 * Math.sin(a * 5 - 1.9)
                     + 0.035 * Math.sin(a * 2 + 2.6);
      const d = Math.hypot(dx, dy) / warp + (jit(x, y, 7) - 0.5) * 0.05;
      let lv = 0;
      for (const c of CUTS) if (d > c) lv++;
      cells.push([y, x, lv]);
    }
  return bandRects(cells, [0.07, 0.14, 0.24, 0.36], '#0b0710');
})();

// 돌이 오래 앉아 있던 자국 — 러그 가운데 돌(캔버스 x56~70, 밑변 y61) 자리.
// 색면으로 그리면 파란 얼룩으로 보인다(실제로 그랬다). **눌린 그늘**이라
// 그림자 계열로 다뤄야 한다 — 타원 거리장 2단, multiply.
export const RUG_MARK = (() => {
  const cells = [];
  const CX = 63, CY = 60.5, RX = 8.5, RY = 2.6;
  for (let y = Math.floor(CY - RY) - 1; y <= Math.ceil(CY + RY) + 1; y++)
    for (let x = Math.floor(CX - RX) - 1; x <= Math.ceil(CX + RX) + 1; x++) {
      const d = Math.hypot((x - CX) / RX, (y - CY) / RY) + (jit(x, y, 23) - 0.5) * 0.16;
      const lv = d > 1 ? 0 : d > 0.72 ? 1 : 2;
      if (lv) cells.push([y, x, lv]);
    }
  return bandRects(cells, [0.13, 0.24], '#1a0f16');
})();

/** 접지 그림자 — 소품이 방에 **놓인** 것처럼 보이게 하는 결정적 한 겹.
 *  없으면 아무리 잘 그려도 배경에 붙인 스티커로 보인다("분위기를 모르겠다"의 정체).
 *  밑변 폭에서 시작해 한 줄마다 좁아지며 옅어진다. */
export function contactShadow(rects, rows = 2) {
  if (!rects || !rects.length) return [];
  let y0 = 1e9, y1 = -1e9;
  for (const [, y, , h] of rects) {
    y0 = Math.min(y0, y); y1 = Math.max(y1, y + (h || 1) - 1);
  }
  // 폭은 **바닥에 닿는 줄**의 실제 폭이어야 한다. 처음엔 전체 bbox 폭을 썼는데,
  // 스탠드처럼 위가 넓고(갓 8px) 발이 좁은(5px) 소품은 그림자가 갓 폭으로 깔려
  // 발과 아귀가 안 맞았다 — 발 뒤에 그림자가 "없어 보이던" 이유.
  //
  // 그런데 맨 아랫줄을 무조건 쓰면 이번엔 **꼬리 한두 칸짜리 소품**이 깨진다.
  // 펼친 책의 마지막 줄은 표지 모서리 2칸뿐이라(폭 16 중 2) 그림자가 그 2칸에만
  // 깔려 사실상 사라졌다. → 아랫줄부터 훑어 올라가며 **제 최대 폭의 40% 이상인
  // 첫 줄**을 접지선으로 삼는다. 스탠드 발(5/8=62%)은 그대로 남고, 책 꼬리(2/16=12%)는
  // 건너뛰어 그 위 줄(14/16=87%)이 잡힌다.
  const widthAt = (yy) => {
    let a = 1e9, b = -1e9;
    for (const [x, y, w, h] of rects)
      if (y + (h || 1) - 1 === yy) { a = Math.min(a, x); b = Math.max(b, x + w - 1); }
    return b < a ? null : [a, b];
  };
  let maxW = 0;
  for (let yy = y0; yy <= y1; yy++) { const e = widthAt(yy); if (e) maxW = Math.max(maxW, e[1] - e[0] + 1); }
  const yBase = y1;                    // **진짜 밑변** — 아래 바닥 그림자는 여기서 시작한다
  let x0, x1;
  for (let yy = y1; yy >= y0; yy--) {
    const e = widthAt(yy);
    if (!e || (e[1] - e[0] + 1) < maxW * 0.4) continue;
    [x0, x1] = e; y1 = yy; break;
  }
  if (x0 === undefined) return [];
  const out = [];
  for (let k = 0; k < rows; k++) {
    const inset = k + 1, a = x0 + inset, b = x1 - inset;
    if (b < a) break;
    out.push({ r: [a, y1 - k, b - a + 1, 1], fill: '#140c14',
               alpha: [0.30, 0.16, 0.08][k] ?? 0.06, blend: 'multiply' });
  }
  // 소품 **바깥**으로 번지는 바닥 그림자. 접지선만으론 소품이 바닥에 얹힌 게 아니라
  // 배경에 오려 붙인 것으로 보인다.
  //
  // 두 번 틀렸다:
  //   ① 시작 줄을 접지선(=제일 넓은 줄) 바로 아래로 잡았는데, 그 줄이 소품 **안쪽**일
  //      수 있다. 담요는 제일 넓은 줄이 y63 이고 실제 밑변은 y64 라, 그림자가 담요 위에만
  //      깔리고 러그에는 한 줄도 안 떨어졌다 — "담요와 러그 사이에 그림자가 없다"의 정체.
  //      → 시작은 항상 **진짜 밑변**(yBase) 아래로.
  //   ② 줄 수를 키/8 로 잡아 담요(높이 11)가 1줄뿐이었다. /6 으로 바꿔 최소 폭을 준다.
  const spread = Math.max(1, Math.min(3, Math.round((yBase - y0 + 1) / 6)));
  for (let k = 0; k < spread; k++) {
    const grow = k + 1;
    out.push({ r: [x0 - grow, yBase + 1 + k, (x1 - x0 + 1) + grow * 2, 1],
               fill: '#140c14', alpha: 0.38 / (k + 1), blend: 'multiply' });
  }
  // 바닥에 **넓게 닿는** 소품은 아래로만 번져선 부족하다 — 담요처럼 폭이 큰 것은
  // 옆구리에 붙은 러그까지 밝게 남아 천이 바닥에서 떠 보인다.
  // 밑변 폭이 8칸을 넘으면 **좌우로도** 한두 칸 그늘을 둘러 둘레를 닫는다.
  const wide = x1 - x0 + 1;
  if (wide >= 8) {
    const side = wide >= 16 ? 2 : 1;
    for (let k = 0; k < side; k++) {
      const a = 0.20 / (k + 1);
      for (let yy = Math.max(y0, yBase - 3); yy <= yBase; yy++) {
        out.push({ r: [x0 - 1 - k, yy, 1, 1], fill: '#140c14', alpha: a, blend: 'multiply' });
        out.push({ r: [x1 + 1 + k, yy, 1, 1], fill: '#140c14', alpha: a, blend: 'multiply' });
      }
    }
  }
  return out;
}

// 앰비언트 오클루전 — 빛이 닿지 않는 곳. 세 갈래를 합쳐 최대값을 쓴다:
//  ① 좌우 벽 구석  ② 천장·벽 접합  ③ 벽↔바닥 접합(가장 깊다)
// 벽 자체는 평평하게 두고 명암은 전부 여기서 준다 — 그래야 시간대에 따라 명암이 움직인다.
export const AO = (() => {
  const cells = [];
  const FLOOR_Y = 49;
  for (let y = 0; y < GY; y++)
    for (let x = 0; x < GX; x++) {
      // 폭이 일정한 세로 띠면 그것대로 직사각형이 된다 → 경계를 세로로 출렁이게
      const wob = 1 + 0.22 * Math.sin(y * 0.21) + 0.12 * Math.sin(y * 0.55 + 1.3);
      const side = Math.min(x, GX - 1 - x) / (30 * wob);      // 0=벽 끝 1=중앙쪽
      let a = Math.max(0, 1 - side);
      if (y < FLOOR_Y) {
        a = Math.max(a, Math.max(0, 1 - y / (7 * (1 + 0.30 * Math.sin(x * 0.09)))) * 0.75);
        a = Math.max(a, Math.max(0, 1 - (FLOOR_Y - y) / (6 * (1 + 0.25 * Math.sin(x * 0.13 + 2)))));
      } else {
        a = Math.max(a, Math.max(0, 1 - (y - FLOOR_Y) / 4));   // 바닥 안쪽 깊이
        a = Math.max(a, Math.max(0, (y - 62) / 12) * 0.6);     // 화면 앞쪽(가까운 바닥)
      }
      const v = a + (jit(x, y, 11) - 0.5) * 0.09;
      const lv = v > 0.72 ? 3 : v > 0.46 ? 2 : v > 0.22 ? 1 : 0;
      cells.push([y, x, lv]);
    }
  return bandRects(cells, [0.10, 0.20, 0.32], '#150c18');
})();
