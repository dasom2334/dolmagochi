// 침실 렌더러 — 거실 scene/render.js 의 **패스 구조를 그대로** 따른다(SCENE-RULES §1).
//   [1] 창밖 풍경(전체) → [2] 벽·바닥 → [2.5] 접지그림자 → [3] 가구(알베도)
//   → [4] 색감 오버레이(시간→날씨) → [5] 창광(poolTrap) → [5.5] 돌 역광
//   → [6] 스탠드 발광 → [7] 비네트
// 색·오버레이·비네트·AMBIENT 는 거실 모듈을 그대로 공유. 정적 아트는 레퍼런스 추출본.
import { generateGroups } from '../livingroom/scene/generate.js';
import { resolve } from '../livingroom/scene/palette.js';
import { ROOM_DATA } from '../livingroom/scene/room-data.js';
import { OVERLAYS, AMBIENT, VIGNETTE } from '../livingroom/scene/lights.js';
import { BD_ART, BD_GLASS } from './geom-art.js';
import * as PREV from './geom-art-prev.js';   // 이전 버전(오늘 4건 수정 전) 정적 아트 — A/B 비교용
import { ORB_SPOTS, lampArt, lampGlowArt, windowPool, groundShadows, bedroomRug } from './geom.js';

const GX = 128, GY = 72;
const groups = generateGroups({});           // 절차 창밖(하늘·산·해달별·구름·날씨)

// 상점 소품 — 안 산 상태로 시작(거실 SHOP_PROPS 대응)
export const SHOP_PROPS = ['bd-desk', 'bd-chair', 'bd-laptop', 'bd-deskplant',
  'bd-nightstand', 'bd-bed', 'bd-fan', 'bd-lamp'];

// z-순서 (뒤→앞) — 창밖은 [1]에서 따로, 여기는 방 구조·가구.
// bd-rug 는 추출본을 안 쓰고 절차 러그(bedroomRug)로 대체 → 목록에서 뺀다.
const Z_FURNITURE = ['bd-frames', 'bd-shelf', 'bd-bed', 'bd-fan', 'bd-nightstand',
  'bd-desk', 'bd-laptop', 'bd-deskplant', 'bd-chair'];
// 이전 버전 z-순서 — 추출 러그(bd-rug)를 가구로 포함(절차 러그를 안 쓰던 때)
const Z_FURNITURE_PREV = ['bd-frames', 'bd-shelf', 'bd-bed', 'bd-fan', 'bd-nightstand',
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
  // 방 팔레트(--rg* 러그 등)까지 넘긴다 — 거실과 동일. 없으면 러그가 #f0f 로 뜬다.
  // state.override: v4 편집 패널의 컬러피커·강도 슬라이더가 특정 슬롯을 덮어쓴다(검수용).
  //   색 슬롯(--rg2 등) 또는 알파 슬롯(--wl-a 창광 세기)을 임시로 바꾼다. 기본은 원본.
  const pal = { ...resolve(state, ROOM_DATA.palette), ...(state.override || {}) };
  // 이전 버전 토글 — state.variant==='prev' 이면 오늘 4건 수정 전 상태로 그린다.
  //   현재: 절차 바닥·절차 러그·전방감쇠 창광·스펙클제거 가구
  //   이전: 추출 바닥·추출(구운) 러그·균일 창광·비스펙클 가구
  const prev = state.variant === 'prev';
  const ART = prev ? PREV.BD_ART : BD_ART;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal['--page-bg'] || '#1a1330';
  ctx.fillRect(0, 0, GX, GY);

  // [1] 창밖 풍경 — **캔버스 전체**. 벽[2]이 덮어 개구부로만 보인다.
  //     벽(bd-wall)을 끄면 풍경이 통째로 드러난다(검수용).
  for (const id of SCENERY) if (groups[id] && !off.has(id)) paint(ctx, groups[id], pal);

  // [2] 벽·창틀(유리 구멍) → 바닥
  //     바닥은 **거실 절차 바닥(g-floor)** 을 그대로 쓴다. 추출 바닥(BD_ART['bd-floor'])은
  //     ① 디테일이 거실과 다르고 ② 창햇빛 명암이 구워져 있었다(질감만 있어야 함).
  //     절차 바닥은 무광원 알베도(팔레트 슬롯)라 두 문제를 동시에 없앤다. 영역도 y49~ 로 같다.
  if (!off.has('g-wall')) paint(ctx, ART['bd-wall'], pal);
  if (!off.has('g-floor')) paint(ctx, prev ? ART['bd-floor'] : groups['g-floor'], pal);
  // 러그 — 현재는 절차 생성(무광원). 이전 버전은 추출 러그를 가구 z에서 그린다.
  if (!prev && !off.has('bd-rug')) paint(ctx, bedroomRug(), pal);

  // [2.5] 접지 그림자 (multiply) — 소품 밑, SCENE-RULES §3.4. state.shadowK = 세기 배율.
  if (!off.has('shadow')) {
    const shK = state.shadowK ?? 1;
    ctx.globalCompositeOperation = 'multiply';
    for (const r of groundShadows(off)) { ctx.globalAlpha = r[5] * shK; ctx.fillStyle = r[4]; ctx.fillRect(r[0], r[1], r[2], r[3]); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // [3] 가구 (무광원 알베도 base). 게이팅.
  for (const id of (prev ? Z_FURNITURE_PREV : Z_FURNITURE))
    if (!off.has(id) && ART[id]) paint(ctx, ART[id], pal);
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
    const { rects, alphaSlot } = windowPool(sunOn ? '--wl' : '--ml', sunOn ? '--wl-a' : '--ml-a', prev);
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

  // [7] 비네트 — 거실 것 재사용. state.vigK = 세기 배율.
  if (!off.has('shadow')) {
    const vigK = state.vigK ?? 1;
    ctx.globalCompositeOperation = 'multiply';
    for (const v of VIGNETTE) { ctx.globalAlpha = v.alpha * vigK; ctx.fillStyle = v.fill; ctx.fillRect(...v.r); }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export { GX, GY };
