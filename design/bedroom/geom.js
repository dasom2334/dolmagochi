// 침실 가구 지오메트리 — 손으로 그린 무광원 중립(albedo)+AO. 캔버스 128×72 좌표.
// 시간·날씨 색은 렌더러의 오버레이가 얹으므로 여기선 중립 톤만.
// 레퍼런스: design/reference/bedroom/times/*.png (창 왼쪽·책상 아래·침대 오른쪽).
//
// 각 소품은 rects [x,y,w,h,'#hex'] 배열. 큰 면을 먼저, 명암을 뒤에 덧그린다.

const FLOOR_Y = 49;

// ── 팔레트(중립) ──
const WOOD = { d: '#4a3524', m: '#6b4a30', l: '#8a6540', hi: '#a07b4e' };   // 원목
const CLOTH = { d: '#3a4a6e', m: '#4f629a', l: '#6a7fb8', pil: '#c9cbe0' }; // 침구(남색 이불 + 흰 베개)
const METAL = { d: '#2b2f3a', m: '#464c5e', l: '#6b7488' };                  // 선풍기·노트북
const LEAF = { d: '#3f5a34', m: '#5f7e42', l: '#84a45a' };                   // 화분 잎
const POT = { d: '#6e4230', m: '#8f5c3c' };                                  // 화분

const R = (x, y, w, h, c) => [x, y, w, h, c];

// ── 책상 (창 아래, 왼쪽) — 상판 + 다리. 돌 작업자리(의자)가 앞에 온다 ──
function desk() {
  const x0 = 8, x1 = 47, top = 37;
  const o = [];
  o.push(R(x0, top, x1 - x0, 2, WOOD.m));         // 상판
  o.push(R(x0, top, x1 - x0, 1, WOOD.hi));        // 상판 윗면 하이라이트
  o.push(R(x0, top + 2, x1 - x0, 1, WOOD.d));     // 상판 밑 그림자
  o.push(R(x0 + 1, top + 3, 2, FLOOR_Y - top - 3, WOOD.d));   // 왼 다리
  o.push(R(x1 - 3, top + 3, 2, FLOOR_Y - top - 3, WOOD.m));   // 오른 다리
  return o;
}

// ── 의자 (책상 앞) — 돌의 작업 자리. 등받이 + 좌판 + 다리 ──
function chair() {
  const o = [];
  o.push(R(20, 40, 12, 1, WOOD.l));               // 좌판 윗면
  o.push(R(20, 41, 12, 2, WOOD.m));               // 좌판
  o.push(R(20, 43, 12, 1, WOOD.d));               // 좌판 밑
  o.push(R(20, 33, 2, 8, WOOD.m));                // 등받이 왼 기둥
  o.push(R(30, 33, 2, 8, WOOD.d));                // 등받이 오른 기둥
  o.push(R(22, 34, 8, 1, WOOD.l));                // 등받이 가로대
  o.push(R(21, 44, 2, FLOOR_Y - 44, WOOD.d));     // 앞 왼다리
  o.push(R(29, 44, 2, FLOOR_Y - 44, WOOD.d));     // 앞 오른다리
  return o;
}

// ── 노트북 (책상 위) ──
function laptop() {
  const o = [];
  o.push(R(24, 30, 11, 7, METAL.d));              // 화면 뒷판
  o.push(R(25, 31, 9, 5, METAL.l));               // 화면
  o.push(R(23, 36, 13, 1, METAL.m));              // 키보드 판 뒤
  return o;
}

// ── 책상 화분 ──
function deskPlant() {
  const o = [];
  o.push(R(11, 34, 4, 3, POT.m));                 // 화분
  o.push(R(11, 34, 4, 1, POT.d));
  o.push(R(10, 31, 6, 3, LEAF.m));                // 잎
  o.push(R(11, 30, 2, 1, LEAF.l));
  o.push(R(13, 31, 2, 1, LEAF.d));
  return o;
}

// ── 협탁 (책상과 침대 사이) — 위에 음료 ──
function nightstand() {
  const x0 = 58, x1 = 71, top = 38;
  const o = [];
  o.push(R(x0, top, x1 - x0, FLOOR_Y - top, WOOD.m));   // 몸통
  o.push(R(x0, top, x1 - x0, 1, WOOD.hi));              // 윗면
  o.push(R(x0, top, 1, FLOOR_Y - top, WOOD.d));         // 왼 그늘
  o.push(R(x1 - 1, top, 1, FLOOR_Y - top, WOOD.d));     // 오른 그늘
  o.push(R(x0 + 2, top + 3, x1 - x0 - 4, 3, WOOD.d));   // 서랍 홈
  return o;
}
function nightDrink() {
  return [R(62, 34, 3, 4, '#b8935a'), R(62, 34, 3, 1, '#d8b878')];  // 컵
}

// ── 침대 (오른쪽) — 프레임 + 매트리스 + 이불 + 베개(오른쪽 머리맡) ──
function bed() {
  const x0 = 74, x1 = 117, top = 34;
  const o = [];
  o.push(R(x1 - 3, top - 4, 4, FLOOR_Y - top + 4, WOOD.d));  // 헤드보드(오른쪽)
  o.push(R(x1 - 3, top - 4, 4, 1, WOOD.l));
  o.push(R(x0, top + 4, x1 - x0, FLOOR_Y - top - 4, WOOD.m)); // 프레임 옆판
  o.push(R(x0, top + 2, x1 - x0 - 2, 4, CLOTH.m));            // 이불 몸통
  o.push(R(x0, top + 2, x1 - x0 - 2, 1, CLOTH.l));            // 이불 윗선
  o.push(R(x0, top + 5, x1 - x0 - 2, 1, CLOTH.d));            // 이불 아랫 그늘
  o.push(R(x1 - 14, top, 11, 5, CLOTH.pil));                 // 베개(머리맡)
  o.push(R(x1 - 14, top, 11, 1, '#e6e8f2'));
  o.push(R(x0 + 1, FLOOR_Y - 3, x1 - x0 - 4, 3, WOOD.d));    // 다리 그늘부
  return o;
}

// ── 선풍기 (오른쪽 끝) — 받침 + 기둥 + 머리 ──
function fan() {
  const cx = 122;
  const o = [];
  o.push(R(cx - 3, 30, 7, 7, METAL.m));           // 머리(원형 근사)
  o.push(R(cx - 2, 31, 5, 5, METAL.l));           // 날개면
  o.push(R(cx, 29, 1, 9, METAL.d));               // 세로 살
  o.push(R(cx - 4, 33, 9, 1, METAL.d));           // 가로 살
  o.push(R(cx, 37, 1, 9, METAL.d));               // 기둥
  o.push(R(cx - 3, 46, 7, 1, METAL.m));           // 받침
  return o;
}

// ── 러그 (바닥 중앙) — 외곽 단 + 안쪽 필드 + 밝은 테두리 ──
function rug() {
  const x0 = 40, x1 = 90, y0 = 54, y1 = 66;
  const o = [];
  o.push(R(x0, y0, x1 - x0, y1 - y0, '#5a2b2f'));       // 필드
  o.push(R(x0, y0, x1 - x0, 1, '#7a3b3f'));             // 윗 테두리(밝음)
  o.push(R(x0, y1 - 1, x1 - x0, 1, '#3e1e22'));         // 아랫 테두리(그늘)
  o.push(R(x0, y0, 1, y1 - y0, '#6a3236'));
  o.push(R(x1 - 1, y0, 1, y1 - y0, '#4a2226'));
  o.push(R(x0 + 3, y0 + 2, x1 - x0 - 6, y1 - y0 - 4, '#6a3236'));  // 안쪽 무늬 필드
  return o;
}

// ── 벽 선반 (창 오른쪽 위) — 널 + 화분 2 ──
function wallShelf() {
  const x0 = 54, x1 = 66, y = 13;
  const o = [];
  o.push(R(x0, y, x1 - x0, 1, WOOD.l));            // 널 윗면
  o.push(R(x0, y + 1, x1 - x0, 1, WOOD.d));        // 널 밑그늘
  o.push(R(x0 + 1, y + 1, 1, 2, WOOD.d));          // 받침
  o.push(R(x1 - 2, y + 1, 1, 2, WOOD.d));
  // 화분 2
  o.push(R(x0 + 1, y - 3, 3, 3, POT.m)); o.push(R(x0, y - 5, 5, 2, LEAF.m));
  o.push(R(x1 - 4, y - 3, 3, 3, POT.m)); o.push(R(x1 - 5, y - 5, 5, 2, LEAF.m));
  return o;
}

// ── 벽 액자들 (오른쪽 벽) — 작은 프레임 여러 개 ──
function frames() {
  const o = [];
  const F = (x, y, w, h, inner) => {
    o.push(R(x, y, w, h, WOOD.m));                 // 프레임
    o.push(R(x + 1, y + 1, w - 2, h - 2, inner));  // 그림
  };
  F(72, 8, 8, 7, '#3a5a7a');    // 풍경
  F(84, 10, 6, 6, '#5a7a4a');   // 초록
  F(92, 8, 5, 8, '#7a5a4a');    // 세로
  F(80, 18, 6, 5, '#6a4a6a');   // 보라
  F(90, 18, 5, 5, '#7a6a4a');
  return o;
}

/** 침실 가구 그룹 — { groupId: rects[] }. 렌더러가 z-순서로 그린다. */
export function bedroomProps() {
  return {
    'bd-shelf': wallShelf(),
    'bd-frames': frames(),
    'bd-desk': desk(),
    'bd-laptop': laptop(),
    'bd-deskplant': deskPlant(),
    'bd-nightstand': nightstand(),
    'bd-nightdrink': nightDrink(),
    'bd-bed': bed(),
    'bd-fan': fan(),
    'bd-rug': rug(),
    'bd-chair': chair(),
  };
}

/** z-순서 (뒤→앞). 벽 소품 → 바닥 가구 → 러그 → 의자(앞). */
export const BD_Z = [
  'bd-shelf', 'bd-frames',
  'bd-bed', 'bd-fan', 'bd-nightstand', 'bd-nightdrink',
  'bd-desk', 'bd-laptop', 'bd-deskplant',
  'bd-rug',
  'bd-chair',
];
