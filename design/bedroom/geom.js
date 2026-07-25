// 침실 씬 — 절차/동적 요소만. 정적 아트(벽·바닥·창틀·가구)는 레퍼런스 추출본
// geom-art.js(tools/extract.py 산출)가 담당한다. 여기엔 게임 상태로 바뀌는 것만:
//  · 돌(거실 생성 돌 ball/rim) 3자리
//  · 책상 스탠드(추출 낮 레퍼런스엔 꺼져 있어 별도로 얹는 밤 작업 조명) + 발광

const R = (x, y, w, h, c, a) => (a == null ? [x, y, w, h, c] : [x, y, w, h, c, a]);

// ── 돌 — 거실에서 생성한 돌 그대로(ball/rim, 팔레트 슬롯 --o0..o4/--wl) ──
import { ball, rim, stoneRows, STONE_ASPECT, h2, emitRows } from '../livingroom/scene/generate.js';

// ── 러그 — 거실 절차 러그와 **같은 방식**(무광원 팔레트 슬롯 + 무늬)으로 생성한다.
// 추출 러그(레퍼런스)는 창햇빛이 대각선으로 **구워져** 있어 디라이팅으로도 안 지워졌다.
// SCENE-RULES: 명암은 광원 레이어가 만든다 — 러그는 질감(무늬·테두리)만 갖는다.
// 거실 rugCells 와 동일 구조: 외곽 어두운 단 → 밝은 테두리 줄 → 무늬 필드.
// 침실 자리(가구 사이 앞쪽 중앙)에 맞춘 사다리꼴. 색은 거실 러그 슬롯(--rg0..4) 공유.
const RUG_Y0 = 53, RUG_Y1 = 68, RUG_CX = 66, RUG_HW_BACK = 22, RUG_HW_FRONT = 32;
// opts 로 위치·크기 조절 (v4 편집 Phase 2). 기본값이면 원본과 동일.
export function bedroomRug(opts = {}) {
  const dy = opts.dy ?? 0;                      // 앞뒤 통이동
  const cx = opts.cx ?? RUG_CX, y0 = (opts.y0 ?? RUG_Y0) + dy, y1 = (opts.y1 ?? RUG_Y1) + dy;
  const hwB = opts.hwBack ?? RUG_HW_BACK, hwF = opts.hwFront ?? RUG_HW_FRONT;
  const rugSpan = (y) => {
    const t = (y - y0) / (y1 - y0);
    const hw = hwB + (hwF - hwB) * t;          // 뒤(위) 좁고 앞(아래) 넓게 = 원근
    return [Math.round(cx - hw), Math.round(cx + hw)];
  };
  const out = [];
  for (let y = y0; y <= y1; y++) {
    const [x0, x1] = rugSpan(y);
    for (let x = x0; x <= x1; x++) {
      const din = Math.min(x - x0, x1 - x, y - y0, y1 - y);
      let tone;
      if (din === 0) tone = '--rg0';
      else if (din === 1) tone = '--rg1';
      else if (din === 2) tone = '--rg4';       // 밝은 테두리 줄
      else if (din === 3) tone = '--rg3';
      else {
        tone = '--rg2';
        const r = h2(x, y, 40);
        if (r < 7) tone = '--rg3';
        else if (r < 12) tone = '--rg1';
        if (din === 4 && h2(x, y, 41) < 45) tone = '--rg3';
      }
      out.push([y, x, tone]);
    }
  }
  return emitRows(out);
}
const orbAt = (cx, baseY, w) => {
  const rows = stoneRows(cx, baseY, w, Math.round(w / STONE_ASPECT));
  return { base: ball(rows), rim: rim(rows) };
};
// 3자리 — 작업=의자 / 누워있기+침대=침대 / 침대없음=러그. 추출 가구에 맞춘 좌표.
export const ORB_SPOTS = {
  chair: () => orbAt(34, 41, 11),
  bed:   () => orbAt(93, 34, 12),
  rug:   () => orbAt(66, 62, 14),
};

// ── 창광 = 앞으로 퍼지는 사다리꼴 (거실 poolTrap 이식, SCENE-RULES §3.1) ──
// 침실 창은 **왼쪽**(유리 x22~54, 중심 38). 빛이 왼쪽 위에서 와 아래로 갈수록
// 오른쪽으로 흐르고(skew+) 넓어진다(spread). 멀리언(x37) 그림자로 분할.
// 셰이프 고정 — 색(--wl/--ml)·세기(--wl-a/--ml-a)만 시간이 정한다. screen 블렌드.
const WIN_CX = 38, WIN_L = 22, WIN_R = 54, WIN_MULL = 37, WIN_SILL = 32;
const WIN_SPREAD = 0.04, WIN_SKEW = 0.7;
// 창턱 상단(y33-34)과 바닥(y49+)에만 — 창 밑 벽(y35-48)은 빛 없음(그림자).
// **앞으로 갈수록 감쇠**(거실 WIN_ZONES 방식) — 창턱 근처가 가장 밝고 전방으로 사그라든다.
// 균일 1.0 으로 바닥 끝까지 깔면 창빛이 방 전체를 덮어 물리적으로 어색했다(#3).
const POOL_ZONES = [[33, 34, 0.8], [49, 54, 1.0], [55, 61, 0.72], [62, 71, 0.46]];
const POOL_ZONES_PREV = [[33, 34, 0.85], [49, 71, 1]];   // 이전 버전(균일) — A/B 비교용
// 창빛 차폐(거실 OCCLUDERS 대응) — 바닥 풀에서 **가구 발치 그림자 구간을 뺀다**.
// 빼지 않으면 screen 창빛이 접지그림자를 씻어내 가구가 빛 위에 떠 보인다.
// [x0, x1, len]: len = 바닥에서 몇 줄까지 그늘이 늘어지나(높은 가구일수록 길게).
// 그림자도 빛의 skew 를 따라 앞으로 갈수록 오른쪽으로 민다.
const POOL_OCC = {
  'bd-desk': [15, 52, 4], 'bd-chair': [28, 43, 2], 'bd-nightstand': [67, 79, 3],
  'bd-bed': [80, 114, 4], 'bd-fan': [117, 126, 2],
};
export function windowPool(slot, alphaSlot, prev = false, off = null) {
  const out = [];
  for (const [zy0, zy1, op] of (prev ? POOL_ZONES_PREV : POOL_ZONES)) {
    for (let y = zy0; y <= zy1; y++) {
      const t = y <= 34 ? 0 : y - WIN_SILL;
      const s = 1 + WIN_SPREAD * t, sh = WIN_SKEW * t;
      const a = WIN_CX + (WIN_L - WIN_CX) * s + sh;
      const b = WIN_CX + (WIN_R - WIN_CX) * s + sh;
      const m0 = WIN_CX + (WIN_MULL - WIN_CX) * s + sh;
      // 이 행에 걸리는 가구 그림자 구간(바닥 풀에만, prev 는 비교용이라 제외)
      const cuts = [];
      if (!prev && off && y >= 49)
        for (const [id, [ox0, ox1, len]] of Object.entries(POOL_OCC))
          if (!off.has(id) && y - 48 <= len) {
            const d = Math.round(WIN_SKEW * (y - 48));
            cuts.push([ox0 + d, ox1 + d]);
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

// ── 접지 그림자 — 소품 밑변에서 창광 반대쪽(오른쪽)으로 늘어진다 (multiply) ──
// SCENE-RULES §3.4: 바닥에 놓인 물건은 창빛을 통과 못 시킨다. 소품 끄면 함께 꺼진다.
const FLOOR_Y = 49;
function contact(x0, w, yBase, len, skew = 0.5) {
  const o = [];
  for (let k = 0; k <= len; k++) {
    const f = k / Math.max(1, len);
    const g = f < 0.35 ? 0.42 : f < 0.7 ? 0.26 : 0.12;   // 본영→반영
    const sh = Math.round(skew * k);                       // 오른쪽으로
    const gw = Math.round(w * (1 + 0.06 * k));
    o.push([x0 + sh, yBase + 1 + k, gw, 1, '#0b0710', g]);
  }
  return o;
}
export function groundShadows(off) {
  const s = [];
  const add = (id, x, w, y, len) => { if (!off.has(id)) s.push(...contact(x, w, y, len)); };
  add('bd-desk', 12, 38, FLOOR_Y - 1, 3);        // 키 큰 가구는 그늘이 길다
  add('bd-chair', 30, 12, FLOOR_Y - 1, 2);
  add('bd-nightstand', 66, 14, FLOOR_Y - 1, 2);
  add('bd-bed', 80, 38, FLOOR_Y - 1, 3);
  add('bd-fan', 118, 9, FLOOR_Y - 1, 2);
  return s;
}

// ── 책상 스탠드 — 밤 작업 조명. 낮 추출본엔 꺼져 있어 별도로 얹는다.
// 위치: 책상 **오른끝**(x47~52) — 노트북·창 격자와 겹치면 "모니터 위 떠 있는 선"으로
// 읽혀서 오른쪽으로 옮겼다. 받침은 상판 윗면(y35~36)에 닿는다.
export function lampArt() {
  return [
    R(48, 27, 5, 1, '#8a6a3a'), R(47, 28, 6, 2, '#6e5230'), R(47, 30, 6, 1, '#4e3a22'),
    R(49, 30, 3, 1, '#c9a86a'), R(50, 31, 1, 4, '#4a4150'),
    R(48, 35, 4, 1, '#3a3242'), R(48, 36, 4, 1, '#241f2e'),
  ];
}
export function lampGlowArt() {
  return [
    R(49, 30, 3, 2, '#fff1c0'),
    R(47, 29, 7, 5, '#ffd98a', 0.5),
    R(44, 27, 13, 9, '#ffcf80', 0.24),
    R(41, 25, 19, 13, '#ffc266', 0.1),
    // 상판에 떨어지는 빛 웅덩이 — 거실 점광(rings)처럼 표면에 닿아야 켜진 걸로 읽힌다
    R(45, 35, 9, 1, '#ffd98a', 0.22),
    R(44, 36, 11, 1, '#ffcf80', 0.14),
    R(43, 37, 12, 1, '#ffc266', 0.08),
  ];
}
