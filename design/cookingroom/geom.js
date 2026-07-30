// 주방 씬 — 절차/동적 요소만. 정적 아트(벽·바닥·창틀·가구)는 시안별 파일이 담당한다:
//   시안 A geom-art.js(추출) / 시안 B geom-art-hand.js(손작화) / 시안 C geom-art-touch.js
// 여기엔 세 시안이 **공유**하는 것만 둔다 — 창밖 풍경·돌·창광·접지그림자·화구 발광.
// 시안이 달라도 방의 구조(창 위치·바닥선)는 같으니 광원·그림자를 나눌 이유가 없다.
//
// 거실·침실과 결정적으로 다른 점: **창이 오른쪽**(유리 x95~117, 중심 106)이다.
// 빛이 오른쪽 위에서 오므로 창광은 아래로 갈수록 **왼쪽으로** 흐르고(skew 음수),
// 접지 그림자도 **왼쪽으로** 늘어진다. 돌의 역광도 rimSide 가 창 쪽으로 잡는다.
import { ball, rim, rimSide, stoneRows, STONE_ASPECT, h2, emitRows } from '../livingroom/scene/generate.js';

const R = (x, y, w, h, c, a) => (a == null ? [x, y, w, h, c] : [x, y, w, h, c, a]);

export const FLOOR_Y = 51;
// 창(유리 2판 + 가운데 멀리언). 추출본 KT_GLASS 와 같은 값 — 광원 계산에도 쓴다.
export const WIN = { L: 95, R: 117, CX: 106, MULL: 106, TOP: 10, BOT: 25, SILL: 27 };

// ── 돌 3자리 ────────────────────────────────────────────────────────────
// 바닥(기본, 레퍼런스의 그 자리) / 작업대 위 / 문 앞(들어오는 중).
// 원근: 앞쪽 바닥이 크고(w14), 작업대 위는 한 깊이 뒤라 작다(w10).
const orbAt = (cx, baseY, w) => {
  const rows = stoneRows(cx, baseY, w, Math.round(w / STONE_ASPECT));
  return { base: ball(rows), rim: rim(rows, rimSide(WIN.CX, cx)) };
};
export const ORB_SPOTS = {
  floor: () => orbAt(63, 63, 14),
  table: () => orbAt(66, 39, 10),
  door:  () => orbAt(17, 58, 12),
};

// ── 창광 = 앞으로 퍼지는 사다리꼴 (SCENE-RULES §3.1) ──────────────────────
// 셰이프 고정 — 색(--wl/--ml)·세기(--wl-a/--ml-a)만 시간이 정한다. screen 블렌드.
// **수평면에만** 투영한다(§3.1). 주방에는 수평면이 셋이다:
//   싱크 상판(y34~37) · 작업대 상판(y38~43) · 바닥(y51~).
//
// [왜 바닥 웅덩이가 거의 없나]
// 처음엔 거실·침실처럼 바닥에만 투영했는데 화면에 빛이 하나도 안 떴다. 계산해 보니
// 당연했다 — 주방 창은 **높고 오른쪽**이라 빔이 가파르게 왼쪽 아래로 내려오는데,
// 그 경로에 싱크대(x88~126)와 작업대(x45~87)가 벽을 따라 통째로 서 있다.
// 바닥에 닿을 몫이 물리적으로 남지 않는다. 억지로 띄우면 가구를 통과한 빛이 된다.
// 그래서 빛은 **상판 둘**에 얹고, 바닥엔 하드 셰이프 대신 아주 옅은 **반사광(bounce)**
// 만 깐다 — 바닥이 죽지 않으면서 물리도 안 어긴다.
const SPREAD = 0.045, SKEW = -0.75;                 // 음수 = 왼쪽으로 흐른다(창이 오른쪽)
// [y0, y1, 세기, x를 자를 범위(그 수평면이 실제로 있는 구간)]
const SURFACES = [
  [34, 37, 1.00, [88, 126]],                        // 싱크 상판 — 창 바로 밑, 제일 밝다
  [38, 43, 0.80, [45, 87]],                         // 작업대 상판 — 오른쪽 끝만 걸린다
];
// 상판 앞으로 넘어간 빛이 바닥에 흩어지는 몫 — 셰이프 없이 옅게(모서리 안 보이게)
const BOUNCE = [[52, 0.10], [53, 0.09], [54, 0.075], [55, 0.06], [56, 0.045], [57, 0.03]];
const BOUNCE_X = [58, 124];
// 상판 위에 놓인 물건은 빛을 막는다 — [소품, x0, x1]
const SURF_OCC = {
  'kt-pot': [53, 74], 'kt-sink': [98, 114],          // 냄비(귀까지) / 개수통(움푹)
  'kt-board': [46, 53], 'kt-ingredients': [75, 86],  // 작업대 위 상품
  'kt-cleaner': [89, 96], 'kt-brush': [117, 123],    // 싱크 상판 위 상품
};
// 상판에 앉은 돌도 막는다
const ORB_OCC = { table: [[38, 43, 57, 76]] };

export function windowPool(slot, alphaSlot, off = null, orb = null) {
  const out = [];
  for (const [y0, y1, op, [sx0, sx1]] of SURFACES) {
    for (let y = y0; y <= y1; y++) {
      const t = y - WIN.SILL;
      const s = 1 + SPREAD * t, sh = SKEW * t;
      const a = WIN.CX + (WIN.L - WIN.CX) * s + sh;
      const b = WIN.CX + (WIN.R - WIN.CX) * s + sh;
      const m0 = WIN.CX + (WIN.MULL - WIN.CX) * s + sh;   // 멀리언(창살) 그림자
      const cuts = [];
      if (off) for (const [id, [ox0, ox1]] of Object.entries(SURF_OCC))
        if (!off.has(id)) cuts.push([ox0, ox1]);
      if (orb && ORB_OCC[orb])
        for (const [by0, by1, bx0, bx1] of ORB_OCC[orb])
          if (y >= by0 && y <= by1) cuts.push([bx0, bx1]);
      for (const [p0, q0] of [[a, m0 - 1], [m0 + 1, b - 1]]) {
        let segs = [[Math.max(sx0, Math.round(p0)), Math.min(sx1, Math.round(q0))]];
        for (const [c0, c1] of cuts) {
          const next = [];
          for (const [sa, sb] of segs) {
            if (c1 < sa || c0 > sb) { next.push([sa, sb]); continue; }
            if (c0 > sa) next.push([sa, c0 - 1]);
            if (c1 < sb) next.push([c1 + 1, sb]);
          }
          segs = next;
        }
        for (const [sa, sb] of segs) if (sb >= sa) out.push([sa, y, sb - sa + 1, 1, slot, op]);
      }
    }
  }
  // 바닥 반사광 — 가장자리가 안 보이게 좌우로 한 칸씩 줄여 나간다
  BOUNCE.forEach(([y, op], i) => out.push([BOUNCE_X[0] + i, y, BOUNCE_X[1] - BOUNCE_X[0] - i * 2, 1, slot, op]));
  return { rects: out, alphaSlot };
}

// ── 접지 그림자 — 밑변에서 창 반대쪽(왼쪽)으로 늘어진다 (multiply, §3.4) ──
//
// [1차 시안의 실패] 가구마다 bbox 전폭으로 그림자를 깔았더니, 가구가 벽을 따라
// 줄지어 서 있는 방이라 **바닥 전폭에 검은 띠 한 줄**이 생겼다. 그림자가 아니라
// 굽도리로 읽힌다. → 실제로 바닥에 닿는 **발자국(다리·몸통 밑변)만** 그리고,
// 사이를 비운다. 열린 선반 밑처럼 빛이 통하는 자리는 비어 있어야 한다.
//
// 빛이 오른쪽에서 오므로 그림자는 **왼쪽으로** 눕는다(skew 음수).
function contact(x0, w, yBase, len, k = 1) {
  const o = [];
  for (let j = 0; j <= len; j++) {
    const f = j / Math.max(1, len);
    const g = (f < 0.35 ? 0.46 : f < 0.7 ? 0.28 : 0.13) * k;   // 본영 → 반영
    o.push([x0 - Math.round(0.6 * j), yBase + 1 + j,
      Math.round(w * (1 + 0.05 * j)), 1, '#0b0710', g]);
  }
  return o;
}
// 발자국 — [x0, 폭, 길이, 세기, (밑변 y — 없으면 벽·바닥 접점)]. 여러 개면 다리마다 하나씩.
// 앞으로 나와 놓인 물건(신발·찻상)은 제 밑변에서 그림자가 시작해야 한다.
const FEET = {
  'kt-door':  [[8, 18, 2, 0.7]],                       // 문은 벽에 붙어 있어 얕게
  'kt-shelf': [[24, 3, 3, 1], [37, 3, 3, 1], [27, 10, 2, 0.45]],  // 다리 둘 + 밑 그늘
  'kt-broom': [[39, 6, 2, 0.8]],
  'kt-table': [[46, 4, 3, 1], [53, 3, 3, 0.8], [78, 3, 3, 0.8], [83, 4, 3, 1],
    [49, 30, 2, 0.4]],                                  // 다리 넷 + 상판 밑 넓은 그늘
  'kt-sink':  [[89, 36, 3, 1]],                        // 붙박이 몸통 — 전폭이 맞다
  // 바닥에 놓이는 상품 — 제 밑변에서 시작한다
  'kt-shoes': [[12, 6, 2, 0.8, 57], [19, 6, 2, 0.8, 57]],
  'kt-umbrella': [[5, 5, 2, 0.7, 52]],
  'kt-teaset': [[89, 4, 3, 1, 64], [103, 4, 3, 1, 64], [88, 20, 2, 0.35, 64]],
};
// 벽에 지는 그림자 — 빛이 오른쪽에서 오니 가구 **왼쪽** 벽이 어둡다.
// 알베도에 굽지 않고 여기서 낸다(§2: 방향 명암은 광원 레이어 몫).
const WALL_AO = {
  'kt-sink':  [[86, 34, 3, 17, 0.16]],
  'kt-table': [[43, 38, 2, 13, 0.14]],
  'kt-shelf': [[22, 37, 2, 13, 0.12]],
  'kt-rack':  [[45, 12, 2, 4, 0.12]],
};
export function groundShadows(off) {
  const s = [];
  for (const [id, feet] of Object.entries(FEET))
    if (!off.has(id))
      for (const [x, w, len, k, base] of feet) s.push(...contact(x, w, base ?? FLOOR_Y - 1, len, k));
  for (const [id, bands] of Object.entries(WALL_AO))
    if (!off.has(id)) for (const [x, y, w, h, a] of bands) s.push([x, y, w, h, '#0b0710', a]);
  return s;
}

// ── 화구(냄비) 발광 — 점광원 3단 감쇠 (§3.2) ─────────────────────────
// 벽난로와 같은 방식: 중심에서 밝고 밖으로 역제곱 감쇠, 상판·벽 양쪽에 링.
// 불이라 flicker(숨쉼)를 준다 — 전기등과 달리 세기가 미세하게 흔들린다.
// 사각 색면을 겹치면 네모난 빛이 된다 → **거리장을 4단 양자화**해 둥글게 뽑는다.
// 1차 시안은 alpha .42 코어에 반경 15×7 이라 상판이 통째로 하얗게 떴다 — 전구로 읽힌다.
// 화구는 **냄비 밑이 달아오르는 것**이라 좁고 낮게. 낮엔 거의 안 보이는 게 맞다.
const STOVE = { CX: 63.5, CY: 39.2, RX: 12, RY: 4.6 };
const STOVE_RINGS = (() => {
  const { CX, CY, RX, RY } = STOVE;
  const CUTS = [0.30, 0.55, 0.78, 1.0];
  const ALPHA = [0.20, 0.11, 0.055, 0.022];
  const rows = [];
  for (let y = Math.floor(CY - RY); y <= Math.ceil(CY + RY); y++)
    for (let x = Math.floor(CX - RX); x <= Math.ceil(CX + RX); x++) {
      if (x < 0 || x > 127 || y < 0 || y > 71) continue;
      // 지터 없이 자르면 등고선이 매끈한 타원으로 보인다 — 해시로 흔든다(§4)
      const d = Math.hypot((x - CX) / RX, (y - CY) / RY) + (h2(x, y, 91) % 100 / 100 - 0.5) * 0.07;
      let lv = -1;
      for (let i = 0; i < CUTS.length; i++) if (d <= CUTS[i]) { lv = i; break; }
      if (lv >= 0) rows.push([y, x, lv]);
    }
  // 레벨별로 한 벌씩 — emitRows 가 가로 런을 묶는다
  return ALPHA.map((a, i) => emitRows(rows.filter((r) => r[2] === i)
    .map(([y, x]) => [y, x, i === 0 ? '#ffcf8c' : i === 1 ? '#ffb45c' : '#ff9440']))
    .map((r) => [r[0], r[1], r[2], r[3], r[4], a]));
})();
const flicker = (t) => (t == null ? 1
  : 1 + 0.07 * Math.sin(t / 210) + 0.04 * Math.sin(t / 97 + 1.3));     // 숨쉼

/** k = 세기 배율(뷰어 슬라이더), t = ms (flicker). 애니 끄면 t 를 안 넘긴다. */
export function stoveGlowArt(k = 1, t = null) {
  const g = k * flicker(t);
  return STOVE_RINGS.flat().map((r) => [r[0], r[1], r[2], r[3], r[4], r[5] * g]);
}

// ── 냄비 아랫배 반사광 ──────────────────────────────────────────────────
// 화구 링만 깔았더니 **밤에 냄비가 평평했다** — 방 안 유일한 광원이 바로 밑에
// 있는데 몸통이 안 달아오르면 냄비가 빛 위에 오려 붙인 것으로 보인다.
// 불은 아래에서 달구므로 밑변이 제일 밝고 위로 갈수록 죽는다(§3.2 역제곱).
// 알베도에 굽지 않고 여기서 낸다(§2) — 화구를 끄면 같이 사라져야 하기 때문이다.
// ※ 셰이프는 손작화 냄비(몸통 x56~71, 귀까지 x53~74, 밑변 y38) 기준.
//   시안 A 추출본은 레퍼런스가 주전자라 밑변이 한 칸 낮지만 링에 묻히는 정도다.
// 1차는 줄마다 폭이 같아 **곧은 밝은 띠**가 됐다 — 냄비가 형광등 위에 앉은 꼴이다.
// 배가 둥그니 가운데가 밝고 옆구리로 갈수록 죽어야 한다 → 줄마다 중심/옆구리를 나눈다.
const POT_GLOW = [
  [60, 38, 8, '#ffcf8c', 0.30], [58, 38, 2, '#ffb45c', 0.18], [68, 38, 2, '#ffb45c', 0.18],
  [59, 37, 10, '#ffb45c', 0.22], [57, 37, 2, '#ff9440', 0.12], [69, 37, 2, '#ff9440', 0.12],
  [59, 36, 10, '#ff9440', 0.12], [57, 36, 2, '#ff9440', 0.06], [69, 36, 2, '#ff9440', 0.06],
  [60, 35, 8, '#ff9440', 0.05],     // 여기서 끊긴다 — 몸통 위까지 올리면 등불이 된다
  [53, 34, 3, '#ff9440', 0.10],     // 왼쪽 귀 밑
  [72, 34, 3, '#ff9440', 0.08],     // 오른쪽 귀 밑
];
export function potUnderglow(k = 1, t = null) {
  const g = k * flicker(t);
  return POT_GLOW.map(([x, y, w, c, a]) => [x, y, w, 1, c, a * g]);
}

// ── 비네트 — **주방 전용**(§4) ───────────────────────────────────────────
// 거실 VIGNETTE 는 중심이 (60,40)이다. 거실 창이 가운데라 그 자리가 맞았지만
// 주방 창은 오른쪽(x106)이라 그대로 쓰면 **빛이 오는 쪽이 더 어두워진다**.
// 중심을 창 쪽으로 옮기고(§4 "중심을 광원 쪽으로"), 거리장 4단 + 각도 워프로 뽑는다.
const VIG = { CX: 88, CY: 38 };
export const VIGNETTE_KT = (() => {
  const CUTS = [0.58, 0.75, 0.90, 1.02];
  const ALPHA = [0.07, 0.14, 0.24, 0.36];
  const rows = [];
  for (let y = 0; y < 72; y++)
    for (let x = 0; x < 128; x++) {
      const dx = (x - VIG.CX) / (128 * 0.56), dy = (y - VIG.CY) / (72 * 0.56);
      const a = Math.atan2(dy, dx);
      const warp = 1 + 0.085 * Math.sin(a * 3 + 0.7) + 0.05 * Math.sin(a * 5 - 1.9)
        + 0.035 * Math.sin(a * 2 + 2.6);
      const d = Math.hypot(dx, dy) / warp + (h2(x, y, 7) % 100 / 100 - 0.5) * 0.05;
      let lv = 0;
      for (const c of CUTS) if (d > c) lv++;
      if (lv) rows.push([y, x, lv - 1]);
    }
  return ALPHA.map((al, i) => emitRows(rows.filter((r) => r[2] === i)
    .map(([y, x]) => [y, x, '#0b0710']))
    .map((r) => [r[0], r[1], r[2], r[3], r[4], al])).flat();
})();

// ── 김 — 냄비 뚜껑 틈에서 3프레임 (애니 끄면 0프레임 고정) ──
// 뚜껑 한가운데(x63)에서 올리면 걸이선반의 국자(x62~67)를 뚫고 지나간다.
// 뚜껑 왼쪽 어깨(x58~59)로 옮겼다 — 마늘 타래(~x56)와 국자 사이 빈 통로다.
export function steamArt(f) {
  const P = [
    [[58, 27], [58, 25], [59, 23], [59, 21]],
    [[58, 26], [59, 24], [58, 22], [58, 20]],
    [[59, 27], [58, 24], [59, 22], [59, 20]],
  ][f % 3];
  return P.map(([x, y], i) => R(x, y, 1, 1, '#d8cfc4', 0.5 - i * 0.1));
}

// ── 주방 창밖 풍경 ────────────────────────────────────────────────────────
// 침실 bedroomScenery() 와 **같은 알고리즘**(하늘 그라디언트 + 뭉게구름 + --h 능선).
// 구름 자리만 주방 창(x95~117)에 걸리도록 다시 잡았다.
// 능선·능선 위 침엽수림은 전부 --h 슬롯이다 — --t(나무 슬롯)는 심은 나무 전용이라
// 여기 쓰면 창밖 땅이 계절 잎 색으로 물든다(침실에서 겪은 그 문제).
// ※ 앱 이식 때는 이 함수와 침실 것을 공용 모듈로 합칠 것.
export function kitchenScenery() {
  const W = 128, H = FLOOR_Y;
  const cell = new Map();
  const put = (x, y, c) => { if (x >= 0 && x < W && y >= 0 && y < H) cell.set(y * 1000 + x, c); };
  const disc = (cx, cy, r, f) => {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx, dy = (y - cy) * 1.35;
        if (dx * dx + dy * dy <= r * r) f(x, y);
      }
  };

  for (let y = 0; y < H; y++) {
    const s = Math.max(0, Math.min(9, Math.round((y - 1) / 2.6)));
    for (let x = 0; x < W; x++) put(x, y, `--k${s}`);
  }

  const CLOUDS = [
    [[100, 14, 4], [104, 13, 3], [97, 15, 3]],          // 왼쪽 유리판 — 주인공
    [[113, 12, 3], [116, 12, 2]],                        // 오른쪽 유리판 — 작게
    [[36, 13, 4], [40, 12, 3]], [[68, 10, 3], [71, 11, 2]], [[10, 16, 3], [13, 15, 2]],
  ];
  for (const lobes of CLOUDS) {
    for (const [cx, cy, r] of lobes) disc(cx, cy, r, (x, y) => put(x, y, '--k9'));
    for (const [cx, cy, r] of lobes) {
      const yb = Math.round(cy + r / 1.35);
      for (let x = Math.round(cx - r); x <= Math.round(cx + r); x++)
        if (cell.get(yb * 1000 + x) === '--k9') put(x, yb, '--k7');
    }
  }

  const ramp = (pts, x) => {
    for (let i = 1; i < pts.length; i++)
      if (x <= pts[i][0]) {
        const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
        return y0 + (y1 - y0) * ((x - x0) / (x1 - x0));
      }
    return pts[pts.length - 1][1];
  };
  const vn = (x, y, salt) => h2(x, y, salt) % 100;
  const FAR  = [[-16, 22], [10, 20], [26, 23], [40, 21], [56, 23], [72, 21], [90, 23], [110, 21], [128, 22]];
  const MID  = [[-16, 26], [14, 24], [30, 27], [46, 25], [62, 27], [78, 25], [96, 27], [112, 25], [128, 26]];
  const NEAR = [[-16, 30], [12, 29], [28, 31], [44, 29], [60, 31], [76, 29], [94, 31], [110, 29], [128, 30]];
  for (let x = 0; x < W; x++) {
    const rf = Math.round(ramp(FAR, x)), rm = Math.round(ramp(MID, x)), rn = Math.round(ramp(NEAR, x));
    for (let y = rf; y < H; y++) {
      let s;
      if (y >= rn) {
        s = y === rn ? '--h1' : (y > 36 ? '--h0' : (vn(x, y, 80) < 26 ? '--h1' : '--h0'));
      } else if (y >= rm) {
        if (y === rm) s = '--h2';
        else if (y === rn - 1 && vn(x, 0, 70) < 34) s = '--h0';
        else if (y === rn - 2 && vn(x, 0, 71) < 13) s = '--h0';
        else s = vn(x, y, 81) < 22 ? '--h2' : '--h1';
      } else {
        if (y <= rf + 1) s = '--h3';
        else if (y === rm - 1 && vn(x, 0, 72) < 30) s = '--h1';
        else if (y === rm - 2 && vn(x, 0, 73) < 11) s = '--h1';
        else s = vn(x, y, 82) < 24 ? '--h3' : '--h2';
      }
      put(x, y, s);
    }
  }
  return emitRows([...cell].map(([k, c]) => [Math.floor(k / 1000), k % 1000, c]));
}

// 해·달 — **왼쪽 유리판**(중심 x100 y15). 렌더가 시간으로 가른다.
export const KT_SUN = [
  R(96, 12, 9, 7, '#ffdf8a', 0.12), R(98, 13, 5, 5, '#ffe9a8', 0.2),
  R(99, 13, 3, 1, '#ffd76a'), R(98, 14, 5, 3, '#ffd76a'), R(99, 17, 3, 1, '#ffd76a'),
  R(99, 14, 3, 2, '#ffedb0'),
];
export const KT_MOON = [
  R(96, 12, 9, 7, '#bcd0f0', 0.12), R(98, 13, 5, 5, '#dfe8f6', 0.18),
  R(99, 13, 3, 1, '#e9eef5'), R(98, 14, 5, 3, '#e9eef5'), R(99, 17, 3, 1, '#e9eef5'),
  R(99, 15, 1, 1, '#c9d3dd'), R(101, 14, 1, 1, '#c9d3dd'),
];
export const KT_STARS = (() => {
  const o = [];
  for (let y = 1; y < 19; y++)
    for (let x = 1; x < 127; x++)
      if (h2(x, y, 302) < 2) o.push(R(x, y, 1, 1, '#e8ecf6', 0.8));
  return o;
})();
