// 주방 렌더러 — 거실 scene/render.js 의 패스 구조를 그대로 따른다(SCENE-RULES §1).
//   [1] 창밖 풍경(전체) → [2] 벽·바닥 → [2.5] 접지그림자 → [3] 가구(알베도)
//   → [4] 색감 오버레이(시간→날씨) → [5] 창광(poolTrap) → [5.5] 돌 역광
//   → [6] 화구 발광 → [7] 비네트
//
// **시안 3종을 한 렌더러로 돌린다** — 바뀌는 건 정적 아트뿐이고 방의 구조(창·바닥선)와
import { generateGroups } from '../livingroom/scene/generate.js';
import { resolve } from '../livingroom/scene/palette.js';
import { ROOM_DATA } from '../livingroom/scene/room-data.js';
import { OVERLAYS, AMBIENT } from '../livingroom/scene/lights.js';
import { ANIM, GROUP_ANIM, TILE_H } from '../livingroom/scene/anim.js';
import { KT_GLASS } from './geom-art.js';
import { KT_HAND } from './geom-art-hand.js';
import { KT_ITEMS, KT_ITEMS_Z } from './geom-items.js';
import { ORB_SPOTS, sproutArt, windowPool, propLight, groundShadows, surfaceShadows, kitchenScenery,
  stoveGlowArt, potUnderglow, steamArt, VIGNETTE_KT, FLOOR_Y,
  KT_SUN, KT_MOON, KT_STARS } from './geom.js';

const GX = 128, GY = 72;
const groups = generateGroups({});           // 거실 절차 그룹(바닥·구름·날씨 재사용)
const SCN = kitchenScenery();

// **방 구조** — 상품이 아니라 늘 있는 것(확정). 문·곁선반·걸이선반·작업대·싱크대.
// 거실 벽난로·침실 책상은 상품이지만 주방은 대응 상품이 없다 → 공짜로 둔다.
export const ROOM_PROPS = ['kt-door', 'kt-shelf', 'kt-rack', 'kt-table', 'kt-sink'];
// **상점 소품** — 게이팅 대상. 냄비·빗자루는 방 그림 쪽 레이어를 쓴다(나머지는 KT_ITEMS).
export const SHOP_PROPS = ['kt-pot', 'kt-broom', ...KT_ITEMS_Z];
// z-순서 (뒤→앞) — 받침을 먼저, 그 위 물건을 나중에
const Z_FURNITURE = ['kt-door', 'kt-sink', 'kt-rack', 'kt-shelf', 'kt-broom',
  'kt-table', 'kt-pot', ...KT_ITEMS_Z];

// 시안 확정: 손작화(KT_HAND) 한 벌만 쓴다. 미도달 시안 a·c는 런타임 분기가
// 참조를 붙잡아 tree-shake도 안 된 채 번들에 실려 나갔다 → 분기째 제거.
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
  const a = p.length > 3 ? parseFloat(p[3]) : 1;
  return `rgba(${p[0]},${p[1]},${p[2]},${a * k})`;
}

// 유리 구멍(2판) 클립 / 방 영역(유리 제외) 클립
function glassPath(ctx) {
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of KT_GLASS) ctx.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}
function roomPath(ctx) {
  ctx.beginPath();
  ctx.rect(0, 0, GX, GY);
  for (const [x0, y0, x1, y1] of KT_GLASS) ctx.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}

// 색감 오버레이 — 거실 OVERLAYS 를 zone 태그째 재활용(§3.5)
function overlay(ctx, oid, pal) {
  const list = OVERLAYS[oid]; if (!list) return;
  const seen = new Set();
  for (const { fill, blend, tune, zone } of list) {
    const key = `${zone}|${fill}|${blend}|${tune || ''}`;
    if (seen.has(key)) continue; seen.add(key);
    const s = tune ? (AMBIENT[oid]?.[tune] ?? 0) : 1;
    if (s <= 0) continue;
    ctx.save();
    ctx.globalCompositeOperation = blend;
    ctx.fillStyle = s >= 1 ? fill : scaleAlpha(fill, s);
    if (zone === 'glass') { glassPath(ctx); ctx.clip('evenodd'); }
    else { roomPath(ctx); ctx.clip('evenodd'); }
    ctx.fillRect(0, 0, GX, GY);
    ctx.restore();
  }
}

// 창밖 강수 — 거실이 절차 생성한 입자를 그대로 쓴다(캔버스 전폭이라 창 자리에도 깔린다).
const WEATHER_GROUP = { rain: 'rain', downpour: 'downpour', snow: 'snow', petals: 'pt-petals' };
function paintWeather(ctx, pal, state, off, t, animOn) {
  const id = WEATHER_GROUP[state.weather];
  if (!id || !groups[id] || off.has(id)) return;
  const a = animOn ? ANIM[GROUP_ANIM[id]] : null;
  const tf = a ? a(t) : {};
  ctx.save();
  if (tf.dy) ctx.translate(0, tf.dy);
  paint(ctx, groups[id], pal);
  if (tf.tile) { ctx.translate(0, -TILE_H); paint(ctx, groups[id], pal); }
  ctx.restore();
}

function orbSprite(state) {
  return (state.orb && state.orb !== 'none' && ORB_SPOTS[state.orb]) ? ORB_SPOTS[state.orb](state) : null;
}

export function render(cv, state, off = new Set(), t = 0) {
  const ctx = cv.getContext('2d');
  const pal = { ...resolve(state, ROOM_DATA.palette), ...(state.override || {}) };
  const ART = KT_HAND;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal['--page-bg'] || '#1a1330';
  ctx.fillRect(0, 0, GX, GY);

  // [1] 창밖 풍경 — 캔버스 전체. 벽[2]이 덮어 개구부로만 보인다(§1).
  const sunUp = state.time !== 'night';
  if (!off.has('base-scenery')) paint(ctx, SCN, pal);
  // 비·폭우·눈·안개엔 해·달·별이 안 보인다 (거실 SUN_HIDDEN 과 같은 규칙)
  if (!['fog', 'rain', 'downpour', 'snow'].includes(state.weather)) {
    if (sunUp) { if (!off.has('sun')) paint(ctx, KT_SUN, pal); }
    else {
      if (!off.has('stars')) paint(ctx, KT_STARS, pal);
      if (!off.has('moon')) paint(ctx, KT_MOON, pal);
    }
  }
  const cloudy = ['cloud', 'rain', 'downpour', 'snow'].includes(state.weather)
    && groups.clouds && !off.has('clouds');
  if (cloudy) paint(ctx, groups.clouds, pal);
  paintWeather(ctx, pal, state, off, t, !off.has('anim'));

  // [2] 벽·창틀(유리 구멍) → 바닥
  if (!off.has('g-wall')) paint(ctx, ART['kt-wall'], pal);
  if (!off.has('g-floor')) paint(ctx, ART['kt-floor'], pal);

  // [2.5] 접지 그림자 (multiply, §3.4)
  if (!off.has('shadow')) {
    const shK = state.shadowK ?? 1;
    ctx.globalCompositeOperation = 'multiply';
    for (const r of groundShadows(off)) { ctx.globalAlpha = r[5] * shK; ctx.fillStyle = r[4]; ctx.fillRect(r[0], r[1], r[2], r[3]); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // [3] 가구 (무광원 알베도 base). 게이팅.
  for (const id of Z_FURNITURE) {
    // 방 그림(시안별) 우선, 없으면 상품 그림(시안 공통)
    const g = ART[id] || KT_ITEMS[id];
    if (off.has(id) || !g) continue;
    paint(ctx, g, pal);
  }
  // [3.2] 상판 위 물건의 접지 그림자 — 받침을 그린 뒤에 얹어야 면에 앉는다.
  //       바닥 그림자[2.5]와 달리 여기서 내는 이유: 상판은 가구보다 나중에 그려진다.
  if (!off.has('shadow')) {
    const shK = state.shadowK ?? 1;
    ctx.globalCompositeOperation = 'multiply';
    for (const r of surfaceShadows(off)) { ctx.globalAlpha = r[5] * shK; ctx.fillStyle = r[4]; ctx.fillRect(r[0], r[1], r[2], r[3]); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
  // 김 — 손작화 판은 김이 안 구워져 있으므로 겹쳐 그린다.
  if (!off.has('kt-pot'))
    paint(ctx, steamArt(!off.has('anim') ? Math.floor(t / 450) % 3 : 0), pal);

  // [3.5] 돌 base
  const orb = orbSprite(state);
  if (orb && !off.has('orb')) {
    paint(ctx, orb.base, pal);
    if (state.sprout && state.sprout !== 'none' && !off.has('sprout'))
      paint(ctx, sproutArt(state.orb, state.sprout, state.wither ?? 0), pal);
  }

  // [4] 색감 오버레이 — 시간 → 날씨
  const oids = [`light-${state.time}`];
  if (state.weather !== 'clear') oids.push(`light-${state.weather}`);
  for (const oid of oids) if (!off.has(oid)) overlay(ctx, oid, pal);

  // [5] 창광 = poolTrap. 낮·노을=햇빛(--wl), 밤=달빛(--ml). screen. 흐림·비·눈은 죽는다.
  const poolId = sunUp ? 'lp-sun' : 'lp-moon';
  const wet = ['fog', 'rain', 'downpour', 'snow'].includes(state.weather);
  if (!off.has(poolId) && !wet) {
    const { rects, alphaSlot } = windowPool(sunUp ? '--wl' : '--ml',
      sunUp ? '--wl-a' : '--ml-a', off, state.orb);
    const a = parseFloat(pal[alphaSlot] ?? 0);
    if (a > 0) {
      // 빔에 선 물건의 창 쪽 면도 같이 밝힌다 — 안 하면 빛 한가운데 선 바구니가
      // 되레 어두운 실루엣이 된다(차폐물로만 쓰던 시절의 버그).
      const lit = propLight(sunUp ? '--wl' : '--ml', alphaSlot, off);
      ctx.globalCompositeOperation = 'screen';
      for (const r of [...rects, ...lit.rects]) { ctx.globalAlpha = r[5] * a; ctx.fillStyle = slot(pal, r[4]); ctx.fillRect(r[0], r[1], r[2], r[3]); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
  }

  // [5.5] 돌 역광 — 창광 색(밤=달빛). screen.
  if (orb && !off.has('orb') && !off.has('rim')) {
    const rimPal = { ...pal, '--wl': sunUp ? pal['--wl'] : (pal['--ml'] || pal['--wl']) };
    ctx.globalCompositeOperation = 'screen';
    paint(ctx, orb.rim, rimPal);
    ctx.globalCompositeOperation = 'source-over';
  }

  // [6] 발광(emission) — 화구. 냄비를 끄면 함께 꺼진다. 불이라 flicker 를 준다.
  //     **시간대로 세기가 갈린다** — 대낮에 창빛과 같이 세면 전구로 읽힌다.
  //     밤엔 방 안에 이것 말고 광원이 없으니 주역이 된다.
  const STOVE_K = { day: 0.45, sunset: 0.8, night: 1.25 };
  if (state.stove !== 'off' && !off.has('kt-pot') && !off.has('stove-glow')) {
    const gk = (state.stoveK ?? 1) * (STOVE_K[state.time] ?? 1);
    const ft = off.has('anim') ? null : t;
    ctx.globalCompositeOperation = 'lighter';
    paint(ctx, stoveGlowArt(gk, ft), pal);
    paint(ctx, potUnderglow(gk, ft), pal);   // 냄비 아랫배 — 없으면 밤에 평평하다
    ctx.globalCompositeOperation = 'source-over';
  }

  // [7] 비네트 — **주방 전용**. 거실 것은 중심이 (60,40)이라 창이 오른쪽인 주방에
  //     쓰면 빛이 오는 쪽이 되레 어두워진다(§4: 중심을 광원 쪽으로).
  if (!off.has('vignette')) {
    const vigK = state.vigK ?? 1;
    ctx.globalCompositeOperation = 'multiply';
    for (const r of VIGNETTE_KT) { ctx.globalAlpha = r[5] * vigK; ctx.fillStyle = r[4]; ctx.fillRect(r[0], r[1], r[2], r[3]); }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export { GX, GY, FLOOR_Y };
