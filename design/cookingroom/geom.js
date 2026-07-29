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
// 바닥(y51+)에만 투영한다. 창 밑 벽(y28~50)은 빛이 아니라 그림자다.
const SPREAD = 0.045, SKEW = -0.75;                 // 음수 = 왼쪽으로 흐른다(창이 오른쪽)
const POOL_ZONES = [[51, 56, 1.0], [57, 63, 0.72], [64, 71, 0.46]];
// 창빛 차폐 — 바닥 풀에서 **가구 발치 구간을 뺀다**. [x0, x1, len] (len = 바닥 몇 줄까지)
const POOL_OCC = {
  'kt-sink': [88, 127, 6], 'kt-table': [45, 88, 6], 'kt-shelf': [24, 40, 5],
  'kt-broom': [39, 45, 4], 'kt-door': [8, 25, 4],
};
// 바닥에 선 돌 — 창광을 막는다(자리마다 다른 띠 [y0,y1,x0,x1])
const ORB_OCC = { floor: [[51, 60, 55, 71]], door: [[51, 58, 11, 23]] };

export function windowPool(slot, alphaSlot, off = null, orb = null) {
  const out = [];
  for (const [zy0, zy1, op] of POOL_ZONES) {
    for (let y = zy0; y <= zy1; y++) {
      const t = y - WIN.SILL;
      const s = 1 + SPREAD * t, sh = SKEW * t;
      const a = WIN.CX + (WIN.L - WIN.CX) * s + sh;
      const b = WIN.CX + (WIN.R - WIN.CX) * s + sh;
      const m0 = WIN.CX + (WIN.MULL - WIN.CX) * s + sh;
      const cuts = [];
      if (off) {
        const d = Math.round(SKEW * (y - (FLOOR_Y - 1)));
        for (const [id, [ox0, ox1, len]] of Object.entries(POOL_OCC))
          if (!off.has(id) && y - (FLOOR_Y - 1) <= len) cuts.push([ox0 + d, ox1 + d]);
        if (orb && ORB_OCC[orb])
          for (const [by0, by1, bx0, bx1] of ORB_OCC[orb])
            if (y >= by0 && y <= by1) cuts.push([bx0 + d, bx1 + d]);
      }
      for (const [p0, q0] of [[a, m0 - 1], [m0 + 1, b - 1]]) {
        let segs = [[Math.max(1, Math.round(p0)), Math.min(126, Math.round(q0))]];
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
  return { rects: out, alphaSlot };
}

// ── 접지 그림자 — 밑변에서 창 반대쪽(왼쪽)으로 늘어진다 (multiply, §3.4) ──
function contact(x0, w, yBase, len, skew = -0.5) {
  const o = [];
  for (let k = 0; k <= len; k++) {
    const f = k / Math.max(1, len);
    const g = f < 0.35 ? 0.5 : f < 0.7 ? 0.32 : 0.16;   // 본영 → 반영
    const sh = Math.round(skew * k);
    o.push([x0 + sh, yBase + 1 + k, Math.round(w * (1 + 0.06 * k)), 1, '#0b0710', g]);
  }
  return o;
}
export function groundShadows(off) {
  const s = [];
  const add = (id, x, w, y, len) => { if (!off.has(id)) s.push(...contact(x, w, y, len)); };
  add('kt-door', 8, 18, FLOOR_Y - 1, 3);
  add('kt-shelf', 24, 17, FLOOR_Y - 1, 3);
  add('kt-broom', 39, 6, FLOOR_Y - 1, 2);
  add('kt-table', 45, 42, FLOOR_Y - 1, 3);
  add('kt-sink', 88, 38, FLOOR_Y - 1, 3);
  return s;
}

// ── 화구(주전자) 발광 — 끓는 동안 주전자 밑이 달아오른다. lighter 블렌드 ──
// 벽난로와 같은 점광원(§3.2) 축소판. 주전자를 끄면 함께 꺼진다.
export function stoveGlowArt() {
  return [
    R(59, 39, 9, 1, '#ffb45c', 0.55),
    R(57, 38, 13, 3, '#ff9840', 0.22),
    R(54, 36, 19, 6, '#ff8c38', 0.1),
    R(51, 41, 25, 3, '#ff8c38', 0.06),                  // 상판에 번짐
  ];
}

// ── 김 — 주전자 주둥이에서 3프레임 (애니 끄면 0프레임 고정) ──
export function steamArt(f) {
  const P = [
    [[63, 26], [63, 24], [64, 22], [64, 20]],
    [[63, 25], [64, 23], [63, 21], [63, 19]],
    [[64, 26], [63, 23], [64, 21], [64, 19]],
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
