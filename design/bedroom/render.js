// 침실 렌더러 — 거실 scene/render.js 의 **패스 구조를 그대로** 따른다(SCENE-RULES §1).
//   [1] 창밖 풍경(전체) → [2] 벽·바닥 → [2.5] 접지그림자 → [3] 가구(알베도)
//   → [4] 색감 오버레이(시간→날씨) → [5] 창광(poolTrap) → [5.5] 돌 역광
//   → [6] 스탠드 발광 → [7] 비네트
// 색·오버레이·비네트·AMBIENT 는 거실 모듈을 그대로 공유. 정적 아트는 레퍼런스 추출본.
import { generateGroups } from '../livingroom/scene/generate.js';
import { resolve } from '../livingroom/scene/palette.js';
import { OVERLAYS, AMBIENT, VIGNETTE } from '../livingroom/scene/lights.js';
import { BD_ART, BD_GLASS } from './geom-art.js';
import { ORB_SPOTS, lampArt, lampGlowArt, windowPool, groundShadows } from './geom.js';

const GX = 128, GY = 72;
const groups = generateGroups({});           // 절차 창밖(하늘·산·해달별·구름·날씨)

// 상점 소품 — 안 산 상태로 시작(거실 SHOP_PROPS 대응)
export const SHOP_PROPS = ['bd-desk', 'bd-chair', 'bd-laptop', 'bd-deskplant',
  'bd-nightstand', 'bd-bed', 'bd-fan', 'bd-lamp'];

// z-순서 (뒤→앞) — 창밖은 [1]에서 따로, 여기는 방 구조·가구
const Z_FURNITURE = ['bd-frames', 'bd-shelf', 'bd-bed', 'bd-fan', 'bd-nightstand',
  'bd-rug', 'bd-desk', 'bd-laptop', 'bd-deskplant', 'bd-chair'];
// 창밖 개별 레이어(거실 '창밖' 토글 대응)
const SCENERY = ['base-scenery', 'halo-moon', 'halo-sun', 'sun', 'moon', 'stars', 'clouds'];

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

// 유리 구멍(4판) 클립 / 방 영역(유리 제외) 클립
function glassPath(ctx) {
  ctx.beginPath();
  for (const [x0, y0, x1, y1] of BD_GLASS) ctx.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
}
function roomPath(ctx) {
  ctx.beginPath();
  ctx.rect(0, 0, GX, GY);
  for (const [x0, y0, x1, y1] of BD_GLASS) ctx.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
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
    if (zone === 'glass') { glassPath(ctx); ctx.clip(); }
    else { roomPath(ctx); ctx.clip('evenodd'); }
    ctx.fillRect(0, 0, GX, GY);
    ctx.restore();
  }
}

// 돌 자리 판정 — state.orb('none'/'chair'/'bed'/'rug')
function orbSprite(state) {
  return (state.orb && state.orb !== 'none' && ORB_SPOTS[state.orb]) ? ORB_SPOTS[state.orb]() : null;
}

export function render(cv, state, off = new Set(), t = 0) {
  const ctx = cv.getContext('2d');
  const pal = resolve(state);
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal['--page-bg'] || '#1a1330';
  ctx.fillRect(0, 0, GX, GY);

  // [1] 창밖 풍경 — **캔버스 전체**. 벽[2]이 덮어 개구부로만 보인다.
  //     벽(bd-wall)을 끄면 풍경이 통째로 드러난다(검수용).
  for (const id of SCENERY) if (groups[id] && !off.has(id)) paint(ctx, groups[id], pal);

  // [2] 벽·창틀(유리 구멍) → 바닥
  if (!off.has('g-wall')) paint(ctx, BD_ART['bd-wall'], pal);
  if (!off.has('g-floor')) paint(ctx, BD_ART['bd-floor'], pal);

  // [2.5] 접지 그림자 (multiply) — 소품 밑, SCENE-RULES §3.4
  if (!off.has('shadow')) {
    ctx.globalCompositeOperation = 'multiply';
    for (const r of groundShadows(off)) { ctx.globalAlpha = r[5]; ctx.fillStyle = r[4]; ctx.fillRect(r[0], r[1], r[2], r[3]); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // [3] 가구 (무광원 알베도 base). 게이팅.
  for (const id of Z_FURNITURE) if (!off.has(id) && BD_ART[id]) paint(ctx, BD_ART[id], pal);
  if (!off.has('bd-lamp')) paint(ctx, lampArt(), pal);

  // [3.5] 돌 base
  const orb = orbSprite(state);
  if (orb && !off.has('orb')) paint(ctx, orb.base, pal);

  // [4] 색감 오버레이 — 시간 → 날씨
  const oids = [`light-${state.time}`];
  if (state.weather !== 'clear') oids.push(`light-${state.weather}`);
  for (const oid of oids) if (!off.has(oid)) overlay(ctx, oid, pal);

  // [5] 창광 = poolTrap. 낮·노을=햇빛(--wl), 밤=달빛(--ml). screen. 흐림·비·눈은 죽는다.
  const sunOn = state.time !== 'night';
  const poolId = sunOn ? 'lp-sun' : 'lp-moon';
  const wet = ['fog', 'rain', 'downpour', 'snow'].includes(state.weather);
  if (!off.has(poolId) && !wet) {
    const { rects, alphaSlot } = windowPool(sunOn ? '--wl' : '--ml', sunOn ? '--wl-a' : '--ml-a');
    const a = parseFloat(pal[alphaSlot] ?? 0);
    if (a > 0) {
      ctx.globalCompositeOperation = 'screen';
      for (const r of rects) { ctx.globalAlpha = r[5] * a; ctx.fillStyle = slot(pal, r[4]); ctx.fillRect(r[0], r[1], r[2], r[3]); }
      ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    }
  }

  // [5.5] 돌 역광 — 창광 색(밤=달빛). screen.
  if (orb && !off.has('orb') && !off.has('rim')) {
    const rimPal = { ...pal, '--wl': sunOn ? pal['--wl'] : (pal['--ml'] || pal['--wl']) };
    ctx.globalCompositeOperation = 'screen';
    paint(ctx, orb.rim, rimPal);
    ctx.globalCompositeOperation = 'source-over';
  }

  // [6] 스탠드 발광(emission) — 켰을 때. 밤에도 안 어두워진다.
  if (state.lamp === 'on' && !off.has('bd-lamp') && !off.has('lamp-glow')) {
    ctx.globalCompositeOperation = 'lighter';
    paint(ctx, lampGlowArt(), pal);
    ctx.globalCompositeOperation = 'source-over';
  }

  // [7] 비네트 — 거실 것 재사용
  if (!off.has('shadow')) {
    ctx.globalCompositeOperation = 'multiply';
    for (const v of VIGNETTE) { ctx.globalAlpha = v.alpha; ctx.fillStyle = v.fill; ctx.fillRect(...v.r); }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export { GX, GY };
