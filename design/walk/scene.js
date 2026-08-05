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
import { generateGroups, ball, rim, stoneRows, STONE_ASPECT, h2, emitRows, rainDrops, fall }
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
// 나무 — tree-stages 와 같은 로브 방식(비대칭 수관 + 줄기)
function tree(o, cx, groundY, s = 1) {
  const T3 = '--t3', lobes = [[cx, groundY - 14 * s, 6 * s, 4 * s],
    [cx - 4 * s, groundY - 11 * s, 4 * s, 2.6 * s], [cx + 4.5 * s, groundY - 11.5 * s, 4 * s, 2.4 * s]];
  for (let y = Math.round(groundY - 10 * s); y <= groundY; y++)
    o.push(R(cx, y, Math.max(1, Math.round(s)), 1, T3));
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
    o.push(R(x, y, 1, 1, slot));
  }
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
  tree(out, 88, 30, 1.0);
  const F = '#3f3130';                                           // 울타리
  out.push(R(8, 40, 16, 1, F), R(8, 43, 16, 1, F));
  for (const x of [9, 15, 22]) out.push(R(x, 39, 1, 6, F));
  return out;
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
  return out;
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
  // 왼쪽 큰 나무 실루엣
  tree(out, 16, 38, 1.4);
  return out;
}

const SCENES = {
  ridge:     { build: buildRidge,     sun: [100, 9],  orb: [63, 64, 12], rimL: false },
  riverside: { build: buildRiverside, sun: [100, 11], orb: [32, 66, 12], rimL: false },
  homeward:  { build: buildHomeward,  sun: [24, 26],  orb: [50, 65, 12], rimL: true },
};
for (const s of Object.values(SCENES)) s.art = s.build();

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
// 야외 전용 강수 — 실내 입자는 **창 38px 로 보는 것** 기준으로 조율된 밀도다
// (generate.js 주석: "창 폭 37에 방울 16개"). 들판 전폭에 그대로 깔면 가랑비다.
// 야외는 하늘이 통째로 보이니 더 촘촘하고 길게 — 같은 생성기에 다른 조율값.
const WX = {
  rain: rainDrops('--rain', 4, 4, 5, 140),
  downpour: rainDrops('--rain', 3, 6, 7, 141),
  snow: [...fall('--snow-p', 5, 1, 142), ...fall('--snow-p', 2, 2, 143)],  // 굵은 송이 섞임
  'pt-petals': groups['pt-petals'],
};
const WEATHER_GROUP = { rain: 'rain', downpour: 'downpour', snow: 'snow', petals: 'pt-petals' };

export function render(cv, state, off = new Set(), t = 0) {
  const ctx = cv.getContext('2d');
  const pal = { ...resolve(state, ROOM_DATA.palette), ...(state.override || {}) };
  const sc = SCENES[state.scene] || SCENES.ridge;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = pal['--page-bg'] || '#1a1330';
  ctx.fillRect(0, 0, GX, GY);

  // [1] 하늘·해·달·별 (씬 정적 아트가 땅으로 덮는다 — 아니, 하늘은 art 안에 있다)
  paint(ctx, sc.art, pal);
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

  // [3] 날씨 입자 — 캔버스 전폭(거실 절차 생성 재사용)
  const wid = WEATHER_GROUP[state.weather];
  if (wid && WX[wid] && !off.has('anim-weather')) {
    const a = !off.has('anim') ? ANIM[GROUP_ANIM[wid]] : null;
    const tf = a ? a(t) : {};
    ctx.save();
    if (tf.dy) ctx.translate(0, tf.dy);
    paint(ctx, WX[wid], pal);
    if (tf.tile) { ctx.translate(0, -TILE_H); paint(ctx, WX[wid], pal); }
    ctx.restore();
  }

  // [3.5] 우산 — 비·눈 오는 산책의 우산 플로우(M12). 돌 곁에 꽂아 갓이 돌을 덮는다.
  // 날씨 입자 **뒤**에 그린다 — 빗방울이 갓에서 가려져 "막아 준다"로 읽힌다.
  // 색은 주방 신발장의 그 우산(청록)과 같은 물건이다.
  if (orb && state.umbrella === 'on' && !off.has('umbrella')) {
    const [cx, baseY, w] = sc.orb;
    const top = baseY - Math.round(w / STONE_ASPECT) + 1;
    const U0 = '#4a6870', U1 = '#3f5a63', U2 = '#31474f', UD = '#26383f';
    const cy = top - 9, hw = Math.round(w / 2) + 2;
    const um = [
      R(cx - 1, cy, 3, 1, U0),
      R(cx - Math.round(hw * 0.6), cy + 1, Math.round(hw * 1.2) + 1, 1, U1),
      R(cx - hw, cy + 2, hw * 2 + 1, 1, U2),
    ];
    for (let i = -hw; i <= hw; i += 3) um.push(R(cx + i, cy + 3, 1, 1, UD));  // 갓 톱니
    um.push(R(cx - 1, cy - 1, 1, 1, '#8d9099'));                              // 꼭지
    for (let y = cy + 3; y < top; y++) um.push(R(cx, y, 1, 1, '#41444d'));    // 대 — 돌 뒤로
    paint(ctx, um, pal);
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
