// 침실 씬 — 절차/동적 요소만. 정적 아트(벽·바닥·창틀·가구)는 레퍼런스 추출본
// geom-art.js(tools/extract.py 산출)가 담당한다. 여기엔 게임 상태로 바뀌는 것만:
//  · 돌(거실 생성 돌 ball/rim) 3자리 · 절차 러그 · 창광 poolTrap(+가구 차폐)
//  · 접지 그림자 · 책상 스탠드(아트+발광) · 모니터 발광

const R = (x, y, w, h, c, a) => (a == null ? [x, y, w, h, c] : [x, y, w, h, c, a]);

// ── 돌 — 거실에서 생성한 돌 그대로(ball/rim, 팔레트 슬롯 --o0..o4/--wl) ──
import { ball, rim, stoneRows, STONE_ASPECT, h2, emitRows } from '../livingroom/generate.js';

// ── 러그 — 거실 절차 러그와 **같은 방식**(무광원 팔레트 슬롯 + 무늬)으로 생성한다.
// 추출 러그(레퍼런스)는 창햇빛이 대각선으로 **구워져** 있어 디라이팅으로도 안 지워졌다.
// SCENE-RULES: 명암은 광원 레이어가 만든다 — 러그는 질감(무늬·테두리)만 갖는다.
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
// 3자리 — 작업=의자 / 누워있기+침대=침대 / 침대없음=러그.
// 원근: 뒷벽 깊이(의자·침대)는 w11 로 같고, 앞쪽 러그만 w14 로 크다.
// v3 손작화는 의자 시트가 두 줄 낮아(y43) 돌 밑변도 함께 내린다.
export const ORB_SPOTS = {
  chair: (st) => orbAt(34, st && st.variant === 'v3' ? 45 : 41, 11),   // v3: 책상 중심(x34)·시트 y45
  bed:   (st) => orbAt(93, st && st.variant === 'v3' ? 33 : 34, 11),   // v3 이불 윗면 y33
  rug:   () => orbAt(66, 62, 14),
};

// ── 창광 = 앞으로 퍼지는 사다리꼴 (거실 poolTrap 이식, SCENE-RULES §3.1) ──
// 침실 창은 **왼쪽**(유리 x22~54, 중심 38). 빛이 왼쪽 위에서 와 아래로 갈수록
// 오른쪽으로 흐르고(skew+) 넓어진다(spread). 멀리언(x37) 그림자로 분할.
// 셰이프 고정 — 색(--wl/--ml)·세기(--wl-a/--ml-a)만 시간이 정한다. screen 블렌드.
const WIN_CX = 38, WIN_L = 22, WIN_R = 54, WIN_MULL = 37, WIN_SILL = 32;
const WIN_SPREAD = 0.04, WIN_SKEW = 0.7;
// 바닥(y49+)에만 — 창 밑 벽(y34-48)은 빛 없음(그림자). 창턱은 없다(지적으로 제거).
// **앞으로 갈수록 감쇠**(거실 WIN_ZONES 방식).
const POOL_ZONES = [[49, 54, 1.0], [55, 61, 0.72], [62, 71, 0.46]];
const POOL_ZONES_PREV = [[33, 34, 0.85], [49, 71, 1]];   // 이전 버전(균일) — A/B 비교용
// 창빛 차폐(거실 OCCLUDERS 대응) — 바닥 풀에서 **가구 발치 그림자 구간을 뺀다**.
// [x0, x1, len]: len = 바닥에서 몇 줄까지. v3 는 가구 발이 y50~52 라 길게 잡는다.
const POOL_OCC = {
  'bd-desk': [13, 54, 6], 'bd-chair': [29, 44, 5], 'bd-nightstand': [66, 79, 5],
  'bd-bed': [80, 114, 6], 'bd-fan': [116, 127, 5],
};
// **창 앞(유리 면)에 선 물건들** — 창광을 길게 가로질러 그림자를 드리운다.
// 거실의 창턱 화분·돌·책 그림자 대응. **띠 목록 [y0,y1,x0,x1]** — 물건의 실루엣을
// 따라 그림자 폭이 바뀐다(램프 = 밑판 짧고 넓게 → 기둥 가늘게 → 갓 멀리서 넓게).
const POOL_OCC_TALL = {
  'bd-laptop': [[49, 52, 31, 45], [53, 60, 32, 43]],      // 노트북(받침 넓게→화면 좁게)
  'bd-deskplant': [[49, 58, 22, 23]],                     // 카페인 음료(가는 기둥)
  'bd-lamp': [[49, 51, 50, 53], [52, 57, 51, 52], [58, 62, 48, 54]], // 밑판·기둥·갓
};
// 의자에 앉은 돌 — 창광을 막는다(거실 창턱 돌 그림자 대응). orb==='chair'일 때만.
const ORB_CHAIR_OCC = [[49, 55, 30, 40]];
export function windowPool(slot, alphaSlot, prev = false, off = null, open = false, orb = null) {
  const out = [];
  for (const [zy0, zy1, op] of (prev ? POOL_ZONES_PREV : POOL_ZONES)) {
    for (let y = zy0; y <= zy1; y++) {
      const t = y <= 34 ? 0 : y - WIN_SILL;
      const s = 1 + WIN_SPREAD * t, sh = WIN_SKEW * t;
      const a = WIN_CX + (WIN_L - WIN_CX) * s + sh;
      const b = WIN_CX + (WIN_R - WIN_CX) * s + sh;
      // 열린 창엔 멀리언이 없다 — 그림자 분할 제거
      const m0 = open ? a - 2 : WIN_CX + (WIN_MULL - WIN_CX) * s + sh;
      // 이 행에 걸리는 그림자 구간(바닥 풀에만, prev 는 비교용이라 제외)
      const cuts = [];
      if (!prev && off && y >= 49) {
        const d = Math.round(WIN_SKEW * (y - 48));
        for (const [id, [ox0, ox1, len]] of Object.entries(POOL_OCC))
          if (!off.has(id) && y - 48 <= len) cuts.push([ox0 + d, ox1 + d]);
        for (const [id, bands] of Object.entries(POOL_OCC_TALL))
          if (!off.has(id))
            for (const [by0, by1, bx0, bx1] of bands)
              if (y >= by0 && y <= by1) cuts.push([bx0 + d, bx1 + d]);
        if (orb === 'chair')
          for (const [by0, by1, bx0, bx1] of ORB_CHAIR_OCC)
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

// ── 접지 그림자 — 소품 밑변에서 창광 반대쪽(오른쪽)으로 늘어진다 (multiply) ──
// SCENE-RULES §3.4. 소품 끄면 함께 꺼진다. 명암을 진하게(거실 수준).
const FLOOR_Y = 49;
function contact(x0, w, yBase, len, skew = 0.5) {
  const o = [];
  for (let k = 0; k <= len; k++) {
    const f = k / Math.max(1, len);
    const g = f < 0.35 ? 0.5 : f < 0.7 ? 0.32 : 0.16;    // 본영→반영 (강화)
    const sh = Math.round(skew * k);                       // 오른쪽으로
    const gw = Math.round(w * (1 + 0.06 * k));
    o.push([x0 + sh, yBase + 1 + k, gw, 1, '#0b0710', g]);
  }
  return o;
}
// v3 손작화는 가구 발이 바닥 안쪽(y50~52)까지 내려와 그늘 기준선도 낮다.
export function groundShadows(off, v3 = false) {
  const s = [];
  const add = (id, x, w, y, len) => { if (!off.has(id)) s.push(...contact(x, w, y, len)); };
  const B = v3 ? { desk: 50, chair: 52, night: 49, bed: 49, fan: 51 }
               : { desk: FLOOR_Y - 1, chair: FLOOR_Y - 1, night: FLOOR_Y - 1, bed: FLOOR_Y - 1, fan: FLOOR_Y - 1 };
  add('bd-desk', 12, 42, B.desk, 3);
  add('bd-chair', 28, 15, B.chair, 2);
  add('bd-nightstand', 66, 14, B.night, 2);
  add('bd-bed', 80, 38, B.bed, 3);
  add('bd-fan', 118, 9, B.fan, 2);
  // 측면 그늘(v3) — 빛이 왼쪽 창에서 오므로 가구 **오른쪽**에 그늘이 진다.
  // 협탁·침대의 형태 음영을 알베도에 굽지 않고 그림자 레이어로(지적 반영).
  if (v3) {
    if (!off.has('bd-nightstand')) s.push([80, 40, 2, 9, '#0b0710', 0.18]);   // 협탁→침대 사이
    if (!off.has('bd-bed')) {
      s.push([83, 47, 29, 2, '#0b0710', 0.28]);                               // 침대 밑 어둠
      s.push([120, 32, 2, 16, '#0b0710', 0.15]);                              // 헤드보드 오른쪽 벽
    }
    if (!off.has('bd-desk')) s.push([55, 38, 2, 10, '#0b0710', 0.15]);        // 책상 오른쪽 벽
  }
  return s;
}

// ── 책상 스탠드 — 밤 작업 조명. 갓 x48~53·y24~27, 기둥 x51 — 랩탑 오른쪽과
// 확실히 분리(기둥이 랩탑에 붙은 세로선처럼 보이던 것). 받침은 상판(y35~36).
// 지적 반영: 목을 늘리는 게 아니라 **몸통 전체를 위로** — 받침을 상판 뒷행(y33~34)에
// 올려 램프 전체가 두 칸 상승. 갓 y21~24, 기둥 y26~32.
export function lampArt() {
  return [
    R(50, 21, 5, 1, '#8a6a3a'), R(49, 22, 6, 2, '#6e5230'), R(49, 24, 6, 1, '#4e3a22'),
    R(51, 25, 3, 1, '#c9a86a'), R(52, 26, 1, 7, '#4a4150'),
    R(50, 33, 4, 1, '#3a3242'), R(50, 34, 4, 1, '#241f2e'),
  ];
}
export function lampGlowArt() {
  return [
    R(51, 24, 3, 2, '#fff1c0'),
    R(49, 23, 7, 5, '#ffd98a', 0.5),
    R(46, 21, 13, 9, '#ffcf80', 0.24),
    R(43, 19, 19, 13, '#ffc266', 0.1),
    // 상판에 떨어지는 빛 웅덩이 — 받침(y33~34) 둘레
    R(47, 33, 9, 1, '#ffd98a', 0.22),
    R(46, 34, 11, 1, '#ffcf80', 0.14),
    R(45, 35, 12, 1, '#ffc266', 0.08),
    // 바닥으로 새는 웜 스필(레퍼런스 night-lamp) — 램프가 자기 창광 그림자를
    // 되메우도록 4행: 램프를 켜면 창그림자 자리가 웜톤으로 밝아진다
    R(50, 49, 12, 1, '#ffcf80', 0.1), R(52, 50, 12, 1, '#ffc266', 0.07),
    R(53, 51, 11, 1, '#ffc266', 0.05), R(54, 52, 10, 1, '#ffb85c', 0.04),
  ];
}

// ── 모니터 발광 — 레퍼런스(night-lamp): 청백 화면 + 텍스트 줄 + 주변 번짐 ──
export function screenGlowArt() {
  return [
    R(33, 28, 10, 4, '#89b4e2', 0.85),                    // 화면 코어
    R(34, 28, 6, 1, '#cfe2f4'), R(35, 30, 7, 1, '#b6d2ec'),   // 텍스트 줄
    R(31, 26, 14, 9, '#5f88b8', 0.2),                     // 주변 번짐
    R(30, 34, 16, 2, '#6f9ac8', 0.14),                    // 데크에 비침
  ];
}

// ── 침실 창밖 풍경 — 레퍼런스(times/*): 하늘 그라디언트 + **나무 캐노피**.
// 거실 풍경(산 능선·해 x58)은 침실 창(유리 x22~54)과 안 맞아 따로 만든다.
// 하늘은 거실 슬롯(--k0..9), 나무는 거실 나무 슬롯(--t0..2) — 시간·계절 팔레트를 따라간다.
export function bedroomScenery() {
  const cells = [];
  // 나무 캐노피 — 레퍼런스처럼 **둥근 뭉게 수풀**(로브 원 합집합).
  // 능선(하늘과 맞닿는 줄)은 --t2 하이라이트, 몸통 --t1, 아래로 갈수록 --t0 그늘.
  // (밋밋한 노이즈 띠 1판은 예쁘지 않았다 — 지적 반영)
  const lobes = [];
  for (let i = 0; i < 17; i++) {
    lobes.push([i * 8 + (h2(i, 0, 310) % 5) - 2,
                23 + (h2(i, 1, 311) % 4),
                5 + (h2(i, 2, 312) % 3)]);
  }
  const solid = (x, y) => {
    if (y >= 29) return true;
    for (const [cx, cy, r] of lobes) {
      const dx = x - cx, dy = (y - cy) * 1.25;
      if (dx * dx + dy * dy <= r * r) return true;
    }
    return false;
  };
  for (let y = 0; y < 49; y++)
    for (let x = 0; x < 128; x++) {
      if (!solid(x, y)) {
        const s = Math.max(0, Math.min(9, Math.round((y - 3) / 2.2)));
        cells.push([y, x, `--k${s}`]);
      } else if (!solid(x, y - 1)) cells.push([y, x, '--t2']);
      else {
        const r = h2(x, y, 301);
        cells.push([y, x, y > 31 ? (r < 55 ? '--t0' : '--t1')
                                 : (r < 10 ? '--t0' : r > 88 ? '--t2' : '--t1')]);
      }
    }
  return emitRows(cells);
}
// 해·달 — **왼쪽 위 유리판**(중심 x29 y13, 유리 22..36×7..17). 렌더가 시간으로 가른다.
export const BD_SUN = [
  R(25, 10, 9, 7, '#ffdf8a', 0.12), R(27, 11, 5, 5, '#ffe9a8', 0.2),
  R(28, 11, 3, 1, '#ffd76a'), R(27, 12, 5, 3, '#ffd76a'), R(28, 15, 3, 1, '#ffd76a'),
  R(28, 12, 3, 2, '#ffedb0'),
];
export const BD_MOON = [
  R(25, 10, 9, 7, '#bcd0f0', 0.12), R(27, 11, 5, 5, '#dfe8f6', 0.18),
  R(28, 11, 3, 1, '#e9eef5'), R(27, 12, 5, 3, '#e9eef5'), R(28, 15, 3, 1, '#e9eef5'),
  R(28, 13, 1, 1, '#c9d3dd'), R(30, 12, 1, 1, '#c9d3dd'),
];
export const BD_STARS = (() => {
  const o = [];
  for (let y = 1; y < 19; y++)
    for (let x = 1; x < 127; x++)
      if (h2(x, y, 302) < 2) o.push(R(x, y, 1, 1, '#e8ecf6', 0.8));
  return o;
})();
