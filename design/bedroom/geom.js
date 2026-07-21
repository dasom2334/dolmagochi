// 침실 가구 지오메트리 — 손으로 그린 무광원 중립(albedo)+AO. 캔버스 128×72 좌표.
// 시간·날씨 색은 렌더러 오버레이가 얹으므로 여기선 중립 톤만.
// 레퍼런스: design/reference/bedroom/times/*.png 를 128×72 로 내려 위치·비례를 맞췄다.
//
// 입체감 규칙(거실 방식):
//  · 수평면(상판)은 **투시 상판**을 따로 얹는다 — 밝은 윗면 1~2줄이 안으로 물러난다.
//  · 면마다 3~4톤(윗면 밝음 → 앞면 중간 → 옆·밑 어둠) + 모서리 1px 하이라이트/AO.
//  · 소실점 ≈ x50. 왼쪽 가구는 오른쪽 옆면, 오른쪽 가구는 왼쪽 옆면이 보인다.
//  · 접지 그림자는 groundShadows() 가 따로 — 렌더러가 multiply 로 바닥에 깐다.

const FLOOR_Y = 49;
const R = (x, y, w, h, c, a) => (a == null ? [x, y, w, h, c] : [x, y, w, h, c, a]);

// ── 중립 팔레트 ──
// 원목 5톤: 윗면하이 → 윗면 → 앞면 → 옆면 → AO
const WD = { th: '#a07a4a', t: '#8a6740', f: '#6b4d2e', s: '#503820', d: '#37260f' };
// 침구: 남색 이불 5톤 + 베개
const CL = { hi: '#7286be', t: '#5566a0', f: '#41508a', s: '#2f3c6b', d: '#222d52' };
const PIL = { hi: '#e2e4ee', m: '#c2c6d6', s: '#9aa0b4' };
const MET = { hi: '#7b8498', m: '#565d70', f: '#3d4356', d: '#282c3a' };  // 선풍기·노트북
const LEAF = { d: '#3f5a34', m: '#5f7e42', l: '#86a65c' };
const POT = { d: '#5e3828', m: '#7c4c34', l: '#96613f' };
const SHADOW = '#0c0710';   // 접지 그림자 색(multiply)

// 상자: 앞면 + 투시 윗면 + 보이는 옆면 + 모서리. side: 'L'|'R' 보이는 옆면.
// 소실점(x50)을 향해 윗면 뒤 모서리가 물러난다.
function box(x0, y0, x1, y1, side = 'R', topDepth = 2) {
  const o = [];
  // 앞면(중간톤) — 세로 그라디언트 약하게(위 밝고 아래 어둠)
  for (let y = y0; y <= y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    o.push(R(x0, y, x1 - x0 + 1, 1, t < 0.5 ? WD.f : WD.s));
  }
  // 보이는 옆면(어둠) — 오른쪽 가구면 왼쪽, 왼쪽 가구면 오른쪽
  if (side === 'R') for (let y = y0; y <= y1; y++) o.push(R(x1, y, 1, 1, WD.s));
  else for (let y = y0; y <= y1; y++) o.push(R(x0, y, 1, 1, WD.s));
  // 투시 윗면(밝음) — 뒤로 갈수록 소실점 쪽으로 좁아진다
  const dir = x0 + (x1 - x0) / 2 < 50 ? 1 : -1;   // 왼쪽 가구=오른쪽으로 물러남
  for (let k = 0; k < topDepth; k++) {
    const inset = k;
    const sx = dir > 0 ? x0 + inset : x0;
    const ex = dir > 0 ? x1 : x1 - inset;
    o.push(R(sx, y0 - 1 - k, ex - sx + 1, 1, k === 0 ? WD.th : WD.t));
  }
  o.push(R(x0, y0, x1 - x0 + 1, 1, WD.th));         // 앞-윗 모서리 하이라이트
  o.push(R(x0, y1, x1 - x0 + 1, 1, WD.d));          // 밑변 AO
  return o;
}

// 다리 — 앞면 + 안쪽 그림자면
function leg(x, y0, y1, w = 2) {
  const o = [];
  o.push(R(x, y0, w, y1 - y0 + 1, WD.f));
  o.push(R(x, y0, 1, y1 - y0 + 1, WD.t));           // 바깥 밝은 모서리
  o.push(R(x + w - 1, y0, 1, y1 - y0 + 1, WD.d));   // 안쪽 그늘
  return o;
}

// ── 책상 (창 아래) — 두꺼운 상판(투시) + 앞치마 + 다리 4 ──
function desk() {
  const x0 = 14, x1 = 51, top = 33;
  const o = [];
  o.push(...leg(x0 + 2, top + 3, FLOOR_Y - 1, 3));       // 앞왼
  o.push(...leg(x1 - 4, top + 3, FLOOR_Y - 1, 3));       // 앞오른
  o.push(...leg(x1 - 8, top + 2, FLOOR_Y - 3, 2));       // 뒤(살짝 안쪽·짧게)
  // 상판: 앞면 2줄 + 투시 윗면 2줄
  o.push(R(x0, top + 1, x1 - x0 + 1, 1, WD.f));          // 상판 앞면
  o.push(R(x0, top + 2, x1 - x0 + 1, 1, WD.d));          // 상판 밑 AO
  o.push(R(x0 + 1, top, x1 - x0, 1, WD.t));              // 윗면
  o.push(R(x0 + 2, top - 1, x1 - x0 - 3, 1, WD.th));     // 윗면 뒤(밝음, 물러남)
  return o;
}

// ── 의자 (책상 앞) — 돌 작업자리. 등받이 슬랫 + 좌판(투시) + 다리 ──
function chair() {
  const x0 = 28, x1 = 40, seat = 42;
  const o = [];
  o.push(...leg(x0 + 1, seat + 1, FLOOR_Y - 1, 2));      // 앞왼다리
  o.push(...leg(x1 - 2, seat + 1, FLOOR_Y - 1, 2));      // 앞오른다리
  // 좌판
  o.push(R(x0, seat, x1 - x0 + 1, 1, WD.f));             // 앞면
  o.push(R(x0, seat + 1, x1 - x0 + 1, 1, WD.d));         // 밑 AO
  o.push(R(x0 + 1, seat - 1, x1 - x0 - 1, 1, WD.t));     // 윗면
  o.push(R(x0 + 2, seat - 2, x1 - x0 - 3, 1, WD.th));    // 윗면 뒤
  // 등받이 — 세로 슬랫 2 + 위 가로대
  o.push(R(x0 + 1, seat - 9, 2, 8, WD.f)); o.push(R(x0 + 1, seat - 9, 1, 8, WD.t));
  o.push(R(x1 - 2, seat - 9, 2, 8, WD.f)); o.push(R(x1 - 1, seat - 9, 1, 8, WD.d));
  o.push(R(x0 + 1, seat - 9, x1 - x0 - 1, 1, WD.th));    // 가로대 윗면
  o.push(R(x0 + 1, seat - 8, x1 - x0 - 1, 1, WD.s));
  return o;
}

function laptop() {
  const o = [];
  o.push(R(31, 27, 10, 7, MET.d));                       // 화면 뒤판
  o.push(R(31, 27, 10, 1, MET.f));                       // 윗 모서리
  o.push(R(32, 28, 8, 5, MET.m));                        // 화면
  o.push(R(32, 28, 8, 1, MET.hi));                       // 화면 상단 반사
  o.push(R(30, 33, 12, 1, MET.f));                       // 키보드 판 앞
  o.push(R(30, 34, 12, 1, MET.d));                       // 밑 AO
  return o;
}

function deskPlant() {
  const o = [];
  o.push(R(16, 30, 5, 3, POT.m));                        // 화분
  o.push(R(16, 30, 5, 1, POT.l)); o.push(R(16, 30, 1, 3, POT.l));
  o.push(R(20, 30, 1, 3, POT.d));
  o.push(R(15, 27, 6, 3, LEAF.m));                       // 잎 덤불
  o.push(R(16, 26, 2, 1, LEAF.l)); o.push(R(18, 27, 2, 1, LEAF.l));
  o.push(R(15, 29, 2, 1, LEAF.d)); o.push(R(19, 28, 2, 1, LEAF.d));
  return o;
}

// ── 책상 스탠드 — 추출 레퍼런스(낮)엔 꺼져 있어 별도로 얹는다. 밤 작업 조명. ──
export function lampArt() {
  const o = [];
  o.push(R(43, 28, 6, 1, '#8a6a3a'));            // 갓 윗면
  o.push(R(42, 29, 7, 2, '#6e5230'));            // 갓
  o.push(R(42, 31, 7, 1, '#4e3a22'));            // 갓 밑 AO
  o.push(R(44, 31, 3, 1, '#c9a86a'));            // 전구 자리
  o.push(R(45, 32, 1, 4, '#4a4150'));            // 목
  o.push(R(43, 36, 5, 1, '#3a3242')); o.push(R(43, 37, 5, 1, '#241f2e'));  // 받침+AO
  return o;
}
export function lampGlowArt() {
  return [
    R(44, 31, 3, 2, '#fff1c0'),
    R(42, 30, 7, 5, '#ffd98a', 0.5),
    R(39, 28, 13, 9, '#ffcf80', 0.24),
    R(36, 26, 19, 13, '#ffc266', 0.1),
  ];
}

// ── 책상 스탠드 — 유일한 따뜻한 광원. 갓 + 목 + 받침 ──
function lamp() {
  const o = [];
  o.push(R(43, 28, 6, 1, '#a8874a'));                    // 갓 윗면
  o.push(R(42, 29, 7, 2, '#8a6a3a'));                    // 갓
  o.push(R(42, 31, 7, 1, '#6a4f2c'));                    // 갓 밑
  o.push(R(45, 31, 1, 5, MET.m));                        // 목
  o.push(R(43, 36, 5, 1, MET.f)); o.push(R(43, 37, 5, 1, MET.d));  // 받침+AO
  return o;
}
function lampGlow() {
  return [
    R(44, 32, 3, 2, '#fff1c0'),
    R(42, 31, 7, 5, '#ffd98a', 0.5),
    R(39, 29, 13, 9, '#ffcf80', 0.24),
    R(36, 27, 19, 13, '#ffc266', 0.1),
  ];
}

// ── 협탁 (책상과 침대 사이) — 상자(투시 윗면) + 서랍 + 손잡이 ──
function nightstand() {
  const x0 = 66, x1 = 79, top = 37;
  const o = box(x0, y0f(top), x1, FLOOR_Y - 1, 'L', 2);
  function y0f(v){return v;}
  o.push(R(x0 + 2, top + 3, x1 - x0 - 4, 4, WD.s));      // 서랍 홈
  o.push(R(x0 + 2, top + 3, x1 - x0 - 4, 1, WD.d));      // 서랍 윗 그늘
  o.push(R(x0 + 2, top + 6, x1 - x0 - 4, 1, WD.t));      // 서랍 아래 하이라이트
  o.push(R((x0 + x1) / 2 | 0, top + 4, 1, 2, WD.th));    // 손잡이
  return o;
}
function nightDrink() {
  return [
    R(70, 33, 4, 4, '#9a6a3e'), R(70, 33, 4, 1, '#c08a52'),
    R(70, 33, 1, 4, '#b07c48'), R(73, 33, 1, 4, '#6e4a2a'),
  ];
}

// ── 침대 (오른쪽) — 매트리스 상판(투시) + 이불 주름 + 베개 + 헤드보드 + 프레임 ──
function bed() {
  const x0 = 78, x1 = 118, mtop = 33;
  const o = [];
  // 헤드보드(오른쪽, 상자)
  o.push(...box(x1 - 3, mtop - 5, x1, FLOOR_Y - 2, 'R', 1));
  // 프레임 앞 레일(아래) + 다리
  o.push(R(x0, FLOOR_Y - 4, x1 - x0 - 2, 3, WD.f));
  o.push(R(x0, FLOOR_Y - 4, x1 - x0 - 2, 1, WD.t));
  o.push(R(x0, FLOOR_Y - 1, x1 - x0 - 2, 1, WD.d));
  o.push(...leg(x0, FLOOR_Y - 2, FLOOR_Y, 2));
  // 매트리스+이불: 윗면(밝음) → 앞 드리운 면(주름)
  o.push(R(x0, mtop, x1 - x0 - 3, 1, CL.hi));            // 이불 윗 모서리
  o.push(R(x0, mtop + 1, x1 - x0 - 3, 2, CL.t));         // 윗면
  o.push(R(x0, mtop + 3, x1 - x0 - 3, 3, CL.f));         // 앞 드리운 면
  o.push(R(x0, mtop + 6, x1 - x0 - 3, 1, CL.s));         // 밑 그늘
  // 이불 주름(세로 밝은 줄 몇 개)
  for (const fx of [x0 + 6, x0 + 15, x0 + 24]) {
    o.push(R(fx, mtop + 1, 1, 5, CL.hi, 0.6));
    o.push(R(fx + 1, mtop + 1, 1, 5, CL.s, 0.5));
  }
  // 베개(머리맡, 오른쪽) — 투시 윗면 + 그늘
  const px0 = x1 - 15, pw = 11;
  o.push(R(px0, mtop - 3, pw, 1, PIL.hi));
  o.push(R(px0, mtop - 2, pw, 2, PIL.m));
  o.push(R(px0, mtop, pw, 1, PIL.s));
  o.push(R(px0, mtop - 2, 1, 2, PIL.hi)); o.push(R(px0 + pw - 1, mtop - 2, 1, 2, PIL.s));
  return o;
}

// ── 선풍기 (오른쪽 끝) — 받침 + 기둥 + 둥근 머리(가드 링 + 날개) ──
function fan() {
  const cx = 122, hy = 33;
  const o = [];
  // 머리(둥근 근사) — 바깥 링(어둠) + 안쪽 날개면
  o.push(R(cx - 4, hy - 3, 9, 1, MET.f)); o.push(R(cx - 4, hy + 4, 9, 1, MET.d));
  o.push(R(cx - 5, hy - 2, 1, 6, MET.f)); o.push(R(cx + 5, hy - 2, 1, 6, MET.d));
  o.push(R(cx - 4, hy - 2, 9, 6, MET.m));               // 날개면
  o.push(R(cx - 4, hy - 2, 9, 1, MET.hi));              // 상단 반사
  // 날개 살(방사 근사) — 세로·가로·대각
  o.push(R(cx, hy - 2, 1, 6, MET.f));
  o.push(R(cx - 4, hy + 1, 9, 1, MET.f));
  o.push(R(cx - 2, hy - 1, 1, 1, MET.d)); o.push(R(cx + 2, hy + 2, 1, 1, MET.d));
  o.push(R(cx, hy, 1, 1, MET.hi));                      // 허브
  // 목 + 기둥 + 받침
  o.push(R(cx, hy + 5, 1, 3, MET.f));
  o.push(R(cx, hy + 8, 1, FLOOR_Y - 1 - (hy + 8), MET.m));
  o.push(R(cx - 1, hy + 8, 1, FLOOR_Y - 1 - (hy + 8), MET.f));
  o.push(R(cx - 3, FLOOR_Y - 1, 7, 1, MET.f)); o.push(R(cx - 2, FLOOR_Y - 2, 5, 1, MET.d));
  return o;
}

// ── 러그 (바닥 중앙) — 투시 사다리꼴(앞이 넓다) + 테두리 단 + 안쪽 필드 ──
function rug() {
  const yTop = 53, yBot = 67;
  const o = [];
  for (let y = yTop; y <= yBot; y++) {
    const t = (y - yTop) / (yBot - yTop);
    const half = Math.round(20 + t * 8);                // 앞으로 갈수록 넓어짐
    const cx = 66;
    const x0 = cx - half, x1 = cx + half;
    // 테두리(2줄) vs 안쪽 필드
    const edge = (y <= yTop + 1 || y >= yBot - 1);
    o.push(R(x0, y, x1 - x0 + 1, 1, edge ? '#7a3a3c' : '#5e2b2e'));
    if (!edge) {
      o.push(R(x0 + 2, y, 1, 1, '#7a3a3c')); o.push(R(x1 - 2, y, 1, 1, '#4a2124'));
    }
  }
  o.push(R(66 - 20, yTop, 41, 1, '#8a4648'));           // 앞-윗 밝은 테두리
  o.push(R(66 - 28, yBot, 57, 1, '#3e1c20'));           // 앞 그늘
  return o;
}

// ── 벽 선반 (창 오른쪽 위) — 널(투시) + 받침 + 화분 2 ──
function wallShelf() {
  const x0 = 56, x1 = 68, y = 13;
  const o = [];
  o.push(R(x0, y, x1 - x0, 1, WD.th));                  // 널 윗면
  o.push(R(x0, y + 1, x1 - x0, 1, WD.f));
  o.push(R(x0, y + 2, x1 - x0, 1, WD.d));               // 밑 AO
  o.push(R(x0 + 1, y + 2, 1, 2, WD.s)); o.push(R(x1 - 2, y + 2, 1, 2, WD.s));  // 받침
  o.push(R(x0 + 1, y - 3, 3, 3, POT.m)); o.push(R(x0, y - 5, 5, 2, LEAF.m)); o.push(R(x0 + 1, y - 6, 2, 1, LEAF.l));
  o.push(R(x1 - 4, y - 3, 3, 3, POT.m)); o.push(R(x1 - 5, y - 5, 5, 2, LEAF.m)); o.push(R(x1 - 3, y - 6, 2, 1, LEAF.l));
  return o;
}

// ── 벽 액자들 (오른쪽 벽) — 프레임(모서리 명암) + 그림 ──
function frames() {
  const o = [];
  const F = (x, y, w, h, inner) => {
    o.push(R(x, y, w, h, WD.f));
    o.push(R(x, y, w, 1, WD.t)); o.push(R(x, y + h - 1, w, 1, WD.d));  // 위 밝고 아래 어둠
    o.push(R(x + 1, y + 1, w - 2, h - 2, inner));
    o.push(R(x + 1, y + 1, w - 2, 1, '#ffffff', 0.12));               // 유리 반사
  };
  F(72, 8, 8, 7, '#3a5a7a');
  F(84, 10, 6, 6, '#5a7a4a');
  F(93, 8, 5, 8, '#7a5a4a');
  F(80, 18, 6, 5, '#6a4a6a');
  F(90, 18, 5, 5, '#7a6a4a');
  return o;
}

// ── 접지 그림자 — 렌더러가 바닥에 multiply 로 깐다. [x,y,w,h,fill,alpha] ──
// 밑변에서 시작해 한두 줄, 광원(왼쪽 창) 반대편으로 살짝 늘어난다.
export function groundShadows(off = new Set()) {
  const s = [];
  const sh = (x, w, y, a) => s.push(R(x, y, w, 1, SHADOW, a));
  if (!off.has('bd-desk')) { sh(14, 40, FLOOR_Y, 0.34); sh(16, 38, FLOOR_Y + 1, 0.18); }
  if (!off.has('bd-chair')) { sh(28, 15, FLOOR_Y, 0.30); }
  if (!off.has('bd-nightstand')) { sh(66, 15, FLOOR_Y, 0.34); sh(68, 13, FLOOR_Y + 1, 0.18); }
  if (!off.has('bd-bed')) { sh(78, 40, FLOOR_Y, 0.34); sh(80, 38, FLOOR_Y + 1, 0.18); }
  if (!off.has('bd-fan')) { sh(117, 10, FLOOR_Y, 0.30); }
  return s;
}

// ── 돌 — **거실에서 생성한 돌을 그대로** 쓴다(ball/rim, 팔레트 슬롯 --o0..o4/--wl).
import { ball, rim, stoneRows, STONE_ASPECT } from '../livingroom/scene/generate.js';
const orbAt = (cx, baseY, w) => {
  const rows = stoneRows(cx, baseY, w, Math.round(w / STONE_ASPECT));
  return { base: ball(rows), rim: rim(rows) };
};
// 돌 3자리 — 작업=의자 / 누워있기+침대=침대 / 침대없음=러그
export const ORB_SPOTS = {
  chair: () => orbAt(34, 41, 11),     // 의자 좌판 위
  bed:   () => orbAt(90, 34, 12),     // 이불 위(베개 앞)
  rug:   () => orbAt(66, 62, 14),     // 러그 중앙
};

/** 침실 가구 그룹 — { groupId: rects[] }. 렌더러가 z-순서로 그린다. */
export function bedroomProps() {
  return {
    'bd-shelf': wallShelf(),
    'bd-frames': frames(),
    'bd-bed': bed(),
    'bd-fan': fan(),
    'bd-nightstand': nightstand(),
    'bd-nightdrink': nightDrink(),
    'bd-desk': desk(),
    'bd-laptop': laptop(),
    'bd-deskplant': deskPlant(),
    'bd-lamp': lamp(),
    'bd-lamp-glow': lampGlow(),
    'bd-rug': rug(),
    'bd-chair': chair(),
  };
}

/** z-순서 (뒤→앞). 벽 소품 → 바닥 가구 → 러그 → 의자(앞). */
export const BD_Z = [
  'bd-shelf', 'bd-frames',
  'bd-bed', 'bd-fan', 'bd-nightstand', 'bd-nightdrink',
  'bd-desk', 'bd-laptop', 'bd-deskplant', 'bd-lamp',
  'bd-rug',
  'bd-chair',
];

// 켤 수 있는 소품 목록(인스펙터 토글용).
export const BD_PROPS = [
  'bd-desk', 'bd-chair', 'bd-laptop', 'bd-deskplant', 'bd-lamp',
  'bd-nightstand', 'bd-nightdrink', 'bd-bed', 'bd-fan',
  'bd-rug', 'bd-shelf', 'bd-frames',
];
