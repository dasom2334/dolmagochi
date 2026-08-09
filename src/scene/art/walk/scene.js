// 산책 야외 씬 3종 (기획서 §178 "야외 씬 로테이션") — 풀에서 로테이션:
//   ridge     언덕 오르막   (레퍼런스 03-ridge)
//   riverside 개울 나무다리 (레퍼런스 06-riverside)
//   homeward  노을 귀갓길   (레퍼런스 07-homeward)
//
// 레퍼런스는 특정 시간대에 구워진 한 장이지만, 여기선 **팔레트 슬롯**으로 그린다 —
// 하늘 --k, 땅·수풀 --h, 나무 --t 가 시간·계절을 그대로 타므로 세 씬 모두
// 낮/노을/밤 × 사계절이 공짜로 나온다. 물은 하늘을 비추므로 --k 위에 파란 유리를
// 한 겹 얹는 방식(고정 파랑을 칠하면 노을에도 한낮 물색이 된다).
//
// 흙길·나무다리·집 같은 인공물만 고정색 알베도 — 시간대 색감은 오버레이가 얹는다.
// 돌은 원근에 따라 실내(w14)보다 작다(§178). 실내 소품은 없다(rooms.ts: walk = null).
import { generateGroups, ball, rim, stoneRows, STONE_ASPECT, h2, emitRows }
  from '../livingroom/scene/generate.js';
import { resolve } from '../livingroom/scene/palette.js';
import { ROOM_DATA } from '../livingroom/scene/room-data.js';
import { OVERLAYS, AMBIENT, VIGNETTE } from '../livingroom/scene/lights.js';
import { ANIM, GROUP_ANIM, TILE_H } from '../livingroom/scene/anim.js';
import { sproutArt } from '../livingroom/scene/sprout.js';

const GX = 128, GY = 72;
const R = (x, y, w, h, c, a) => (a == null ? [x, y, w, h, c] : [x, y, w, h, c, a]);
const groups = generateGroups({});               // 날씨 입자·구름 재사용(캔버스 전폭)

// ── 공용 조각 ───────────────────────────────────────────────────────────
function sky(cell, horizon) {
  for (let y = 0; y < horizon; y++) {
    const s = Math.max(0, Math.min(9, Math.round((y / horizon) * 9.5)));
    for (let x = 0; x < GX; x++) cell.set(y * 1000 + x, `--k${s}`);
  }
}
// 풀밭 — 멀수록 어둡고(--h1) 가까울수록 밝다(--h3). 결 스펙클.
function grass(cell, y0, y1, base) {
  for (let y = y0; y < y1; y++)
    for (let x = 0; x < GX; x++) {
      const r = h2(x, y, 300);
      cell.set(y * 1000 + x, r < 8 ? `--h${Math.max(0, base - 1)}`
        : r > 93 ? `--h${Math.min(3, base + 1)}` : `--h${base}`);
    }
}
// 흙길 — 소실점을 향해 좁아지며 굽는다. [y0(먼 끝), cx(y), 반폭(y)]
function path(o, yTop, cxOf, hwOf) {
  const D0 = '#8a6a48', D1 = '#75563a', D2 = '#5e4530';
  for (let y = yTop; y < GY; y++) {
    const cx = cxOf(y), hw = hwOf(y);
    const x0 = Math.round(cx - hw), x1 = Math.round(cx + hw);
    o.push(R(x0, y, x1 - x0 + 1, 1, h2(0, y, 310) < 30 ? D1 : D0));
    o.push(R(x0, y, 1, 1, D2), R(x1, y, 1, 1, D2));       // 가장자리
    if (h2(y, 0, 311) < 40) o.push(R(x0 + 1 + (h2(y, 1, 312) % Math.max(1, x1 - x0 - 1)), y, 1, 1, D2));
  }
}
// 나무 — tree-stages 와 같은 로브 방식(비대칭 수관 + 줄기).
// **잎과 줄기를 나눠 돌려준다** — 겨울엔 잎이 지고(거실 나무와 같은 규칙)
// 맨가지 실루엣이 남아야 한다. 잎을 그림에 구우면 계절이 못 벗긴다.
function tree(cx, groundY, s = 1) {
  const trunk = [], leaves = [];
  const topY = Math.round(groundY - 10 * s);
  for (let y = topY; y <= groundY; y++)
    trunk.push(R(cx, y, Math.max(1, Math.round(s)), 1, '--t3'));
  // 맨가지 — 잎이 지면 이게 실루엣이다. 위로 벌어지는 잔가지 넷.
  for (const [dir, off, len] of [[-1, 0, 3], [1, 1, 3], [-1, 3, 2], [1, 4, 2]])
    for (let k = 1; k <= Math.round(len * s); k++)
      trunk.push(R(cx + dir * k, topY + off - k, 1, 1, '--t3'));
  const lobes = [[cx, groundY - 14 * s, 6 * s, 4 * s],
    [cx - 4 * s, groundY - 11 * s, 4 * s, 2.6 * s], [cx + 4.5 * s, groundY - 11.5 * s, 4 * s, 2.4 * s]];
  const cell = new Set();
  for (const [lx, ly, rx, ry] of lobes)
    for (let y = Math.floor(ly - ry); y <= Math.ceil(ly + ry); y++)
      for (let x = Math.floor(lx - rx); x <= Math.ceil(lx + rx); x++)
        if (Math.hypot((x - lx) / rx, (y - ly) / ry) + (h2(x, y, 7) / 100 - 0.5) * 0.14 <= 1)
          cell.add(y * 1000 + x);
  for (const k of cell) {
    const y = Math.floor(k / 1000), x = k % 1000;
    let slot = '--t1';
    if (!cell.has((y - 1) * 1000 + x)) slot = '--t2';
    else if (!cell.has((y + 1) * 1000 + x) || h2(x, y, 9) < 8) slot = '--t0';
    leaves.push(R(x, y, 1, 1, slot));
  }
  return { trunk, leaves };
}

// ── 씬 3종 — {art(정적), sun[x,y], orb[cx,baseY,w], rimL} ──────────────
function buildRidge() {
  const cell = new Map();
  sky(cell, 33);                                  // 능선 최저점(y~32) 밑까지 — 빈 띠 방지
  // 능선 — 오른쪽 언덕마루가 높다. 마루 위에 나무 한 그루, 왼쪽에 울타리.
  const crest = (x) => Math.round(30 - 8 * Math.exp(-((x - 88) ** 2) / 900) + 2 * Math.sin(x / 17));
  for (let x = 0; x < GX; x++)
    for (let y = crest(x); y < GY; y++) {
      const r = h2(x, y, 300);
      const base = y < crest(x) + 2 ? 2 : y < 46 ? 2 : 3;   // 앞으로 갈수록 밝다
      cell.set(y * 1000 + x, r < 8 ? `--h${base - 1}` : r > 93 ? `--h${Math.min(3, base + 1)}` : `--h${base}`);
    }
  const out = emitRows([...cell].map(([k, c]) => [Math.floor(k / 1000), k % 1000, c]));
  const yTop = 26;
  path(out, yTop,
    (y) => 88 + (62 - 88) * ((y - yTop) / (GY - yTop)) ** 0.8,   // 마루 x88 → 발치 x62
    (y) => 1 + 7 * ((y - yTop) / (GY - yTop)) ** 1.3);           // 폭 1 → 8
  const F = '#3f3130';                                           // 울타리
  out.push(R(8, 40, 16, 1, F), R(8, 43, 16, 1, F));
  for (const x of [9, 15, 22]) out.push(R(x, 39, 1, 6, F));
  return { art: out, tree: tree(88, 30, 1.0) };
}

function buildRiverside() {
  const cell = new Map();
  sky(cell, 24);
  grass(cell, 24, 44, 2);
  grass(cell, 58, GY, 3);
  const out = emitRows([...cell].map(([k, c]) => [Math.floor(k / 1000), k % 1000, c]));
  // 먼 수풀 덤불 — 지평선 위 어두운 덩어리
  for (const [bx, bw] of [[10, 22], [38, 12], [88, 26], [118, 10]]) {
    for (let x = bx; x < bx + bw; x++) {
      const hgt = 2 + (h2(x, 0, 320) % 3);
      out.push(R(x, 24 - hgt, 1, hgt, '--h1'));
      if (h2(x, 1, 321) < 30) out.push(R(x, 24 - hgt, 1, 1, '--h2'));
    }
  }
  // 개울 — 하늘 슬롯 + 파란 유리(고정 파랑이면 노을에도 한낮 물색이 된다)
  for (let y = 44; y < 58; y++) {
    const s = 9 - Math.round(((y - 44) / 13) * 3);          // 먼 물이 밝다(하늘 반사)
    out.push(R(0, y, GX, 1, `--k${s}`));
    out.push(R(0, y, GX, 1, '#27476e', 0.5));
    if (y % 3 === 1)                                        // 잔물결 — 밝은 토막
      for (let x = (y * 7) % 11; x < GX; x += 17)
        out.push(R(x, y, 2 + (h2(x, y, 322) % 3), 1, '#cfe0ee', 0.3));
  }
  out.push(R(0, 44, GX, 1, '#1c3350', 0.5));                // 물가 접선
  // 나무다리 — 상판 + 난간 + 물에 잠긴 기둥. 어두운 웜 우드(역광 실루엣 톤)
  const W0 = '#4a3527', W1 = '#3a2a1e', W2 = '#2c1f15';
  out.push(R(44, 41, 40, 1, W0));                           // 난간 손잡이
  for (let x = 45; x <= 83; x += 5) out.push(R(x, 42, 1, 4, W1));
  out.push(R(43, 46, 42, 2, W0));                           // 상판
  out.push(R(43, 48, 42, 1, W2));
  for (const x of [46, 62, 80]) {
    out.push(R(x, 49, 2, 6, W1), R(x, 54, 2, 1, W2));       // 기둥 + 수면 접선
    out.push(R(x, 55, 2, 2, '#1c3350', 0.5));               // 물속 그림자
  }
  for (const x of [6, 118]) out.push(R(x, 38, 2, 12, W1), R(x + 3, 41, 2, 9, W2)); // 물가 말뚝
  return { art: out, tree: null };
}

function buildHomeward() {
  const cell = new Map();
  sky(cell, 30);
  grass(cell, 30, GY, 1);                                    // 귀갓길 들판은 어둑하다
  const out = emitRows([...cell].map(([k, c]) => [Math.floor(k / 1000), k % 1000, c]));
  // 길 — 발치 가운데에서 오른쪽 집으로
  path(out, 34, (y) => 92 + (56 - 92) * ((y - 34) / (GY - 34)) ** 0.9,
    (y) => 1 + 8 * ((y - 34) / (GY - 34)) ** 1.2);
  // 집 — 어두운 실루엣 + 불 켜진 창(발광은 render 가 얹는다)
  const H0 = '#2e2226', H1 = '#241a1d', HR = '#1b1316';
  out.push(R(86, 26, 21, 9, H0));                            // 몸체
  out.push(R(86, 26, 21, 1, H1));
  for (let r = 0; r <= 5; r++)                               // 삼각 지붕 — 마루에서 처마로
    out.push(R(95 - r * 2, 20 + r, 3 + r * 4, 1, HR));
  out.push(R(103, 17, 2, 4, HR));                            // 굴뚝
  out.push(R(90, 29, 4, 4, '#0e0a0c'));                      // 창(불은 render)
  return { art: out, tree: tree(16, 38, 1.4) };                  // 왼쪽 큰 나무
}

const SCENES = {
  ridge:     { build: buildRidge,     sun: [100, 9],  orb: [63, 64, 12], rimL: false },
  riverside: { build: buildRiverside, sun: [100, 11], orb: [32, 66, 12], rimL: false },
  homeward:  { build: buildHomeward,  sun: [24, 26],  orb: [50, 65, 12], rimL: true },
};
for (const s of Object.values(SCENES)) {
  const b = s.build();
  s.art = b.art; s.tree = b.tree;
}

// 해·달 — 씬마다 자리가 다르다(귀갓길은 지평선에 낮게)
const disc = (cx, cy) => [
  R(cx - 4, cy - 3, 9, 7, '#ffdf8a', 0.12), R(cx - 2, cy - 2, 5, 5, '#ffe9a8', 0.2),
  R(cx - 1, cy - 2, 3, 1, '#ffd76a'), R(cx - 2, cy - 1, 5, 3, '#ffd76a'), R(cx - 1, cy + 2, 3, 1, '#ffd76a'),
];
const moonAt = (cx, cy) => [
  R(cx - 4, cy - 3, 9, 7, '#bcd0f0', 0.12), R(cx - 2, cy - 2, 5, 5, '#dfe8f6', 0.18),
  R(cx - 1, cy - 2, 3, 1, '#e9eef5'), R(cx - 2, cy - 1, 5, 3, '#e9eef5'), R(cx - 1, cy + 2, 3, 1, '#e9eef5'),
];
const STARS = (() => {
  const o = [];
  for (let y = 1; y < 22; y++) for (let x = 1; x < 127; x++)
    if (h2(x, y, 330) < 2) o.push(R(x, y, 1, 1, '#e8ecf6', 0.8));
  return o;
})();

// 반딧불 — 귀갓길 전용. 노을·밤에만, 숨쉬듯 깜빡인다.
const FIREFLIES = [[30, 50], [44, 58], [70, 46], [82, 55], [58, 62], [100, 48], [20, 44]];

const slot = (pal, v) => (v[0] === '#' ? v : (pal[v] || '#f0f'));
function paint(ctx, rects, pal) {
  for (const r of rects) {
    ctx.globalAlpha = r[5] == null ? 1 : r[5];
    ctx.fillStyle = slot(pal, r[4]);
    ctx.fillRect(r[0], r[1], r[2], r[3]);
  }
  ctx.globalAlpha = 1;
}
function scaleAlpha(css, k) {
  const m = css.match(/rgba?\(([^)]+)\)/); if (!m) return css;
  const p = m[1].split(',').map((s) => s.trim());
  return `rgba(${p[0]},${p[1]},${p[2]},${(p.length > 3 ? parseFloat(p[3]) : 1) * k})`;
}
// 야외엔 방/유리 구분이 없다 — 전 캔버스가 "창밖"이므로 **유리 존 세기**(약한 쪽)를
// 전면에 깐다. 하늘·땅 팔레트가 이미 그 시간대 색이라 세게 얹으면 이중 착색이 된다.
function overlay(ctx, oid, pal) {
  const list = OVERLAYS[oid]; if (!list) return;
  const seen = new Set();
  for (const { fill, blend, tune, zone } of list) {
    if (zone !== 'glass') continue;
    const key = `${fill}|${blend}|${tune || ''}`;
    if (seen.has(key)) continue; seen.add(key);
    const s = tune ? (AMBIENT[oid]?.[tune] ?? 0) : 1;
    if (s <= 0) continue;
    ctx.globalCompositeOperation = blend;
    ctx.fillStyle = s >= 1 ? fill : scaleAlpha(fill, s);
    ctx.fillRect(0, 0, GX, GY);
    ctx.globalCompositeOperation = 'source-over';
  }
}
// 야외 전용 강수 — 실내 것(세로 낱방울)은 창 38px 유리 너머 기준의 문법이라
// 들판에선 정지한 점묘로 읽혔다. 정석 야외 픽셀아트 강수 문법을 벤치마킹:
//   비  = **사선 줄기**(수직 아님) + **원근 2겹**(먼 겹은 짧고 흐리고, 가까운 겹은
//         길고 진하다) + 바닥 튐(render 쪽).
//   눈  = 잔눈(1px, 촘촘) + 굵은 송이(2px, 성김) 2겹 — 크기 차이가 곧 원근이다.
// 셀은 [0,TILE_H) 주기로 만들고 3벌 복제해 72px 을 채운다(주기성이 깨지면
// 낙하 래핑 순간 뚝 끊긴다).
// 빗줄기는 **기울기 방향으로 떨어져야** 한다 — 사선으로 그려 놓고 세로로 내리면
// 들통난다(generate.js 가 실내에서 세로 낱방울을 고른 이유가 이 함정이었다).
// 낙하 변환이 (dy, -dy·slant) 이므로, 이음새 없이 돌려면 패턴이 그 방향으로
// 주기적이어야 한다 → 밴드 b 를 (y + b·T, x - b·T·slant) 로 **빗겨 복제**한다.
function streaks(spacing, len, passes, salt, slant, alpha) {
  const o = [];
  for (let pass = 0; pass < passes; pass++)
    for (let x0 = -12; x0 < GX + 40; x0 += spacing) {
      const x = x0 + (h2(x0 + 20, pass, salt) % spacing);
      const y0 = h2(x + 20, pass, salt + 1) % TILE_H;
      for (let k = 0; k < len; k++)
        for (let band = 0; band < 3; band++)
          o.push(R(x - Math.round((k + band * TILE_H) * slant),
            (y0 + k) % TILE_H + band * TILE_H, 1, 1, '--rain', alpha));
    }
  return o;
}
function flakes(dens, size, salt, alpha) {
  const o = [];
  for (let y = 0; y < TILE_H; y++)
    for (let x = 0; x < GX; x++)
      if (h2(x, y, salt) < dens)
        for (let band = 0; band < 3; band++)
          o.push(R(x, y + band * TILE_H, size, size, '--snow-p', alpha));
  return o;
}
// 눈은 두 겹을 **속도까지** 가른다 — 가까운 것(굵은 송이)이 빨리 떨어져야
// 원근이 산다. 크기만 다르고 같은 속도로 내리면 벽지 무늬가 흐르는 것이 된다.
const SNOW_FAR = flakes(3, 1, 158, 0.6);               // 잔눈 — 멀고 느리다
const SNOW_NEAR = flakes(1, 2, 159, 0.95);             // 굵은 송이 — 가깝고 빠르다
// 꽃잎·낙엽 — 색은 계절 슬롯(--t2)이 정한다: 봄=꽃잎, 가을=낙엽 (거실과 같은 규칙).
// 실내 것은 창 기준 밀도라 야외에선 두 겹으로 다시: 먼 잎(1px)·가까운 잎(2px).
function petals(dens, size, salt, alpha) {
  const o = [];
  for (let y = 0; y < TILE_H; y++)
    for (let x = 0; x < GX; x++)
      if (h2(x, y, salt) < dens)
        for (let band = 0; band < 3; band++)
          o.push(R(x, y + band * TILE_H, size, 1, '--t2', alpha));   // 잎은 납작하다
  return o;
}
const PET_FAR = petals(2, 1, 180, 0.75);
const PET_NEAR = petals(1, 2, 181, 1);
const WX = {
  // 사선 판도 내려 봤지만 결국 직선 — 이 해상도에선 곧은 줄기가 제일 비답다.
  rain: [...streaks(7, 3, 2, 150, 0, 0.45),           // 먼 겹 — 짧고 흐림
    ...streaks(6, 5, 3, 152, 0, 0.9)],                // 가까운 겹 — 길고 진함
  downpour: [...streaks(5, 4, 3, 154, 0, 0.5),
    ...streaks(4, 8, 4, 156, 0, 1)],
  snow: [...SNOW_FAR, ...SNOW_NEAR],                   // 애니 끔일 때 한 장으로
  'pt-petals': [...PET_FAR, ...PET_NEAR],
};
// 겹별 낙하 속도 — 가까운 겹이 빨라야 원근이 산다
const LAYERED = {
  snow: [[SNOW_FAR, 0.55], [SNOW_NEAR, 1.25]],
  'pt-petals': [[PET_FAR, 0.7], [PET_NEAR, 1.15]],
};
const WEATHER_GROUP = { rain: 'rain', downpour: 'downpour', snow: 'snow', petals: 'pt-petals' };

// ── 피크닉 바구니 — 도시락을 싸 온 산책(state.basket = 내용물 key | 'off').
// 돌 왼쪽에 나란히(주방 바구니와 같은 문법 — "같이 나가자"). 손잡이 아치가
// "들고 나온 것"으로 읽히게 하는 결정타고, 뚜껑 밑으로 삐져나온 천 조각의
// 색이 이번 내용물을 말한다(주먹밥 김 / 샌드위치 / 과일).
const BASKET_FILL = { riceball: '#2a2a3a', sandwich: '#a05a3a', fruit: '#d85a4a' };
function basketArt(bx, gy, kind) {
  const fill = BASKET_FILL[kind] || '#b0453e';
  return [
    // 손잡이 아치
    R(bx + 3, gy - 8, 3, 1, '#875f3c'),
    R(bx + 2, gy - 7, 1, 1, '#875f3c'), R(bx + 6, gy - 7, 1, 1, '#875f3c'),
    R(bx + 1, gy - 6, 1, 2, '#65442a'), R(bx + 7, gy - 6, 1, 2, '#65442a'),
    // 천 — 내용물 색
    R(bx + 2, gy - 5, 5, 1, '#d8cfc4'), R(bx + 4, gy - 5, 2, 1, fill),
    // 몸통(고리버들) — 야외 흙빛에 뜨지 않게 주방 바구니보다 한 단계 낮은 톤
    R(bx, gy - 4, 9, 1, '#a8853f'), R(bx, gy - 3, 9, 1, '#8f7030'),
    R(bx + 1, gy - 2, 7, 3, '#7d6029'),
    R(bx + 1, gy - 2, 1, 3, '#5c4419'), R(bx + 7, gy - 2, 1, 3, '#9c7c3a'),
    R(bx + 2, gy - 1, 5, 1, '#665020'),                       // 엮은 결
  ];
}

export function render(cv, state, off = new Set(), t = 0) {
  const ctx = cv.getContext('2d');
  const pal = { ...resolve(state, ROOM_DATA.palette), ...(state.override || {}) };
  const sc = SCENES[state.scene] || SCENES.ridge;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = pal['--page-bg'] || '#1a1330';
  ctx.fillRect(0, 0, GX, GY);

  // [1] 씬 정적 아트 + 나무(줄기/잎 분리 — 겨울엔 잎이 진다)
  paint(ctx, sc.art, pal);
  if (sc.tree) {
    paint(ctx, sc.tree.trunk, pal);
    if (state.season !== 'winter') paint(ctx, sc.tree.leaves, pal);
  }
  const sunUp = state.time !== 'night';
  // 비·폭우·눈·안개엔 해·달·별이 안 보인다 (거실 SUN_HIDDEN 과 같은 규칙)
  const skyHidden = ['fog', 'rain', 'downpour', 'snow'].includes(state.weather);
  if (!skyHidden) {
    if (sunUp) { if (!off.has('sun')) paint(ctx, disc(...sc.sun), pal); }
    else {
      if (!off.has('stars')) paint(ctx, STARS, pal);
      if (!off.has('moon')) paint(ctx, moonAt(...sc.sun), pal);
    }
  }
  const cloudy = ['cloud', 'rain', 'downpour', 'snow'].includes(state.weather);
  if (cloudy && groups.clouds && !off.has('clouds')) paint(ctx, groups.clouds, pal);

  // [2] 돌 — 산책 나온 돌. 원근으로 실내보다 작다. 없으면 씬만(배경 로테이션 미리보기)
  let orb = null;
  if (state.orb && state.orb !== 'none' && !off.has('orb')) {
    const [cx, baseY, w] = sc.orb;
    const rows = stoneRows(cx, baseY, w, Math.round(w / STONE_ASPECT));
    orb = { rows, base: ball(rows) };
    // 접지 그림자 — 흙 위 부드럽게
    ctx.globalCompositeOperation = 'multiply';
    for (let j = 0; j < 3; j++) {
      ctx.globalAlpha = [0.35, 0.2, 0.1][j];
      ctx.fillStyle = '#0b0710';
      ctx.fillRect(cx - Math.round(w / 2) - j, baseY + 1 + j, w + j * 2, 1);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    paint(ctx, orb.base, pal);
    if (state.sprout && state.sprout !== 'none' && !off.has('sprout'))
      paint(ctx, sproutArt(cx, baseY, w, state.sprout, state.wither ?? 0), pal);
  }

  // [2.2] 피크닉 바구니 — 도시락을 싸 온 날만. 접지 그림자는 돌과 같은 문법.
  if (orb && state.basket && state.basket !== 'off' && !off.has('basket')) {
    const [cx, baseY, w] = sc.orb;
    const bx = cx - Math.round(w / 2) - 12;                   // 돌 왼쪽, 두 칸 띄고
    ctx.globalCompositeOperation = 'multiply';
    for (let j = 0; j < 2; j++) {
      ctx.globalAlpha = [0.3, 0.15][j];
      ctx.fillStyle = '#0b0710';
      ctx.fillRect(bx - j, baseY + 1 + j, 9 + j * 2, 1);
    }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    paint(ctx, basketArt(bx, baseY, state.basket), pal);
  }

  // [2.5] 우산 — 펼쳐진 채 **바짝 기울여**(60도) 돌에 기대 놓아 돌을 가린다.
  // 파라솔로 읽히던 원인: 테가 매끈한 반원 = 파라솔이다. 우산은 **물결 테**
  // (스캘럽)가 정체성이다 → 테를 삼각파로 깎고, 꼭지·긴 대·J 손잡이를 붙인다.
  // 날씨 입자보다 **먼저** 그린다 — 비는 우산 위로 지나가는 애니메이션이다.
  if (orb && state.umbrella === 'on' && !off.has('umbrella')) {
    const [cx, baseY, w] = sc.orb;
    const gy = baseY + 1;
    const top = baseY - Math.round(w / STONE_ASPECT) + 1;
    const C = [cx + 4, top - 2];                              // 돌 정수리 위 — 갓이 돌을 덮는다
    const ax_ = 0.87, ay_ = -0.5, rad = 8;                    // 갓 축 — 60도로 눕는다
    const tri = (v) => Math.abs(((v % 2) + 2) % 2 - 1);
    const U0 = '#5b7b84', U1 = '#3f5a63', U2 = '#31474f', UD = '#26383f', MP = '#41444d';
    const um = [];
    for (let y = Math.floor(C[1] - rad - 2); y <= gy; y++)
      for (let x = Math.floor(C[0] - rad - 2); x <= Math.ceil(C[0] + rad + 2); x++) {
        const dx = x - C[0], dy = y - C[1];
        const d = Math.hypot(dx, dy);
        if (d > rad + 0.3) continue;
        const ap = dx * ax_ + dy * ay_;                       // 축 방향(꼭지 +)
        const sp = -dx * ay_ + dy * ax_;                      // 테를 따라
        const cut = -0.4 + 1.7 * tri(sp / 2.6);               // 물결 테
        if (ap < cut) continue;
        const c = ap < cut + 1.1 ? UD                         // 테두리 선
          : ap > rad * 0.62 ? U0                              // 꼭지 쪽 등 — 밝다
            : d > rad * 0.82 ? U2 : U1;
        um.push(R(x, y, 1, 1, c));
      }
    um.push(R(Math.round(C[0] + ax_ * (rad + 1)) , Math.round(C[1] + ay_ * (rad + 1)), 2, 1, '#8d9099')); // 꼭지
    for (let k = 1; k <= 9; k++) {                            // 대 — 열린 면에서 왼쪽 아래로
      const px = Math.round(C[0] - ax_ * k), py = Math.min(gy, Math.round(C[1] - ay_ * k));
      um.push(R(px, py, 1, 1, MP));
    }
    const hx = Math.round(C[0] - ax_ * 10), hy = Math.min(gy, Math.round(C[1] - ay_ * 10));
    um.push(R(hx - 1, hy, 2, 1, MP), R(hx - 2, hy - 1, 1, 1, MP));   // J 손잡이
    paint(ctx, um, pal);
    ctx.globalCompositeOperation = 'multiply';                // 접지 그림자
    ctx.globalAlpha = 0.25; ctx.fillStyle = '#0b0710';
    ctx.fillRect(C[0] - 4, gy + 1, 14, 1);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // [3] 날씨 입자 — 캔버스 전폭(거실 절차 생성 재사용)
  const wid = WEATHER_GROUP[state.weather];
  if (wid && WX[wid] && !off.has('anim-weather')) {
    const a = !off.has('anim') ? ANIM[GROUP_ANIM[wid]] : null;
    // 눈은 겹마다 속도가 다르다 — t 배율로 같은 스텝 애니를 다른 속도로 돌린다
    const layers = a && LAYERED[wid] ? LAYERED[wid] : [[WX[wid], 1]];
    for (const [rects, spd] of layers) {
      const tf = a ? a(t * spd) : {};
      ctx.save();
      if (tf.dy) ctx.translate(0, tf.dy);
      paint(ctx, rects, pal);
      if (tf.tile) { ctx.translate(0, -TILE_H); paint(ctx, rects, pal); }
      ctx.restore();
    }
  }

  // [3.4] 바닥 튐 — 빗방울이 땅에 닿아 튀는 한 점. 이게 있어야 비가 **이 세계에
  // 내리는** 것이 되고, 없으면 화면 앞 유리에 붙은 스티커다.
  if ((state.weather === 'rain' || state.weather === 'downpour')
      && !off.has('anim-weather') && !off.has('anim')) {
    const n = state.weather === 'rain' ? 6 : 11;
    for (let i = 0; i < n; i++) {
      const ph = ((t / 420) + i * 0.41) % 1;
      if (ph < 0.3) {
        const x = 4 + (h2(i, 41, 170) * 120 / 99) | 0;
        const y = 62 + (h2(i, 7, 171) % 9);
        const a = 0.4 * (1 - ph / 0.3);
        paint(ctx, [R(x, y, 1, 1, '--rain', a), R(x - 1, y - 1, 1, 1, '--rain', a * 0.6),
          R(x + 1, y - 1, 1, 1, '--rain', a * 0.6)], pal);
      }
    }
  }

  // [4] 색감 오버레이 — 유리 존 세기로 전면
  const oids = [`light-${state.time}`];
  if (state.weather !== 'clear') oids.push(`light-${state.weather}`);
  for (const oid of oids) if (!off.has(oid)) overlay(ctx, oid, pal);

  // [5] 돌 역광 — 해 쪽 모서리
  if (orb && !off.has('rim')) {
    const rimPal = { ...pal, '--wl': sunUp ? pal['--wl'] : (pal['--ml'] || pal['--wl']) };
    ctx.globalCompositeOperation = 'screen';
    paint(ctx, rim(orb.rows, sc.rimL ? 'left' : 'right'), rimPal);
    ctx.globalCompositeOperation = 'source-over';
  }

  // [6] 발광 — 귀갓길 창불 + 반딧불
  if (state.scene === 'homeward') {
    ctx.globalCompositeOperation = 'lighter';
    if (!off.has('window-glow')) {
      paint(ctx, [R(90, 29, 4, 4, '#ffd76a', 0.85), R(88, 27, 8, 8, '#ff9440', 0.10),
        R(89, 28, 6, 6, '#ffb45c', 0.10)], pal);
    }
    if (!off.has('fireflies') && state.time !== 'day') {
      for (let i = 0; i < FIREFLIES.length; i++) {
        const [fx, fy] = FIREFLIES[i];
        const ph = off.has('anim') ? 1 : 0.5 + 0.5 * Math.sin(t / 700 + i * 1.7);
        if (ph > 0.25) paint(ctx, [R(fx, fy - Math.round(ph * 2), 1, 1, '#ffd76a', 0.6 * ph)], pal);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // [7] 비네트 — 거실 것 재사용(야외도 중심 시선은 같다)
  if (!off.has('vignette')) {
    ctx.globalCompositeOperation = 'multiply';
    for (const v of VIGNETTE) { ctx.globalAlpha = v.alpha; ctx.fillStyle = v.fill; ctx.fillRect(...v.r); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
}

export { GX, GY };
