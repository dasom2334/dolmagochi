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
import { BD3_ART } from './geom-art-v3.js';   // v3 손작화 판 — 무테·두꺼운 색면
import { ORB_SPOTS, lampArt, lampGlowArt, screenGlowArt, windowPool, groundShadows, bedroomRug,
  bedroomScenery, BD_SUN, BD_MOON, BD_STARS } from './geom.js';
import { BD3_DRINKS, BD3_SASH_OPEN, steamArt, fanSpinArt } from './geom-art-v3.js';

const GX = 128, GY = 72;
const groups = generateGroups({});           // 거실 절차 그룹(바닥·구름·날씨 재사용)
const SCN = bedroomScenery();                // 침실 전용 창밖(하늘+나무 캐노피)

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

const slot = (pal, v) => (v[0] === '#' ? v : (pal[v] || '#f0f'));
function paint(ctx, rects, pal) {
  for (const r of rects) {
    ctx.globalAlpha = r[5] == null ? 1 : r[5];
    ctx.fillStyle = slot(pal, r[4]);
    ctx.fillRect(r[0], r[1], r[2], r[3]);
  }
  ctx.globalAlpha = 1;
}
// 픽셀 드로잉(Phase 3) — state.paintCells(Map "x,y"→hex) 를 1×1 로 그린다.
function drawPaintCells(ctx, cells) {
  ctx.globalAlpha = 1;
  for (const [k, hex] of cells) { const c = k.indexOf(','); ctx.fillStyle = hex; ctx.fillRect(+k.slice(0, c), +k.slice(c + 1), 1, 1); }
}
function scaleAlpha(css, k) {
  const m = css.match(/rgba?\(([^)]+)\)/); if (!m) return css;
  const p = m[1].split(',').map((s) => s.trim());
  const a = p.length > 3 ? parseFloat(p[3]) : 1;
  return `rgba(${p[0]},${p[1]},${p[2]},${a * k})`;
}

// 유리 구멍(4판) 클립 / 방 영역(유리 제외) 클립.
// exc = 유리 **앞을 가리는 물건**(랩탑)의 유리 겹침 영역 — 유리 블렌더에서 빼고
// 룸 블렌더에 넣는다. 안 빼면 멀리언 열(x37)만 룸 존이라 화면 정중앙에 세로선이 갈린다.
// open = 창 열림: 유리 존은 4판이 아니라 **개구부 전체 한 장**(격자 무늬 심 제거)
function glassPath(ctx, exc, open) {
  ctx.beginPath();
  if (open) ctx.rect(22, 7, 33, 25);
  else for (const [x0, y0, x1, y1] of BD_GLASS) ctx.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  if (exc) for (const r of exc) ctx.rect(r[0], r[1], r[2], r[3]);
}
function roomPath(ctx, exc, open) {
  ctx.beginPath();
  ctx.rect(0, 0, GX, GY);
  if (open) ctx.rect(22, 7, 33, 25);
  else for (const [x0, y0, x1, y1] of BD_GLASS) ctx.rect(x0, y0, x1 - x0 + 1, y1 - y0 + 1);
  if (exc) for (const r of exc) ctx.rect(r[0], r[1], r[2], r[3]);
}

// 색감 오버레이 — 거실 OVERLAYS 를 zone 태그째 재활용(§3.5)
function overlay(ctx, oid, pal, exc, open) {
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
    if (zone === 'glass') { glassPath(ctx, exc, open); ctx.clip('evenodd'); }
    else { roomPath(ctx, exc, open); ctx.clip('evenodd'); }
    ctx.fillRect(0, 0, GX, GY);
    ctx.restore();
  }
}

// 돌 자리 판정 — state.orb('none'/'chair'/'bed'/'rug'). v3 는 의자 시트가 낮아 state 를 넘긴다.
function orbSprite(state) {
  return (state.orb && state.orb !== 'none' && ORB_SPOTS[state.orb]) ? ORB_SPOTS[state.orb](state) : null;
}

export function render(cv, state, off = new Set(), t = 0) {
  const ctx = cv.getContext('2d');
  // 방 팔레트(--rg* 러그 등)까지 넘긴다 — 거실과 동일. 없으면 러그가 #f0f 로 뜬다.
  // state.override: v4 편집 패널의 컬러피커·강도 슬라이더가 특정 슬롯을 덮어쓴다(검수용).
  //   색 슬롯(--rg2 등) 또는 알파 슬롯(--wl-a 창광 세기)을 임시로 바꾼다. 기본은 원본.
  const pal = { ...resolve(state, ROOM_DATA.palette), ...(state.override || {}) };
  // 버전 토글 — state.variant:
  //   'current'(기본): 추출 가구 + 절차 바닥·러그 + 전방감쇠 창광
  //   'v3': 손작화 가구(geom-art-v3) + 절차 바닥·러그 + 전방감쇠 창광
  //   'prev': 오늘 4건 수정 전 — 추출 바닥·추출(구운) 러그·균일 창광
  const prev = state.variant === 'prev';
  const ART = prev ? PREV.BD_ART : state.variant === 'v3' ? BD3_ART : BD_ART;
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal['--page-bg'] || '#1a1330';
  ctx.fillRect(0, 0, GX, GY);

  // [1] 창밖 풍경 — **침실 전용**(하늘+나무 캐노피, 캔버스 전체). 벽[2]이 덮어
  //     개구부로만 보인다. 해/달은 창 안(x49,y13) — 시간이 가른다. 별은 밤에만.
  const sunUp = state.time !== 'night';
  if (!off.has('base-scenery')) paint(ctx, SCN, pal);
  if (sunUp) { if (!off.has('sun')) paint(ctx, BD_SUN, pal); }
  else {
    if (!off.has('stars')) paint(ctx, BD_STARS, pal);
    if (!off.has('moon')) paint(ctx, BD_MOON, pal);
  }
  // 구름은 **흐린 계열 날씨에만** — 맑음에 뜨던 버그 수정
  const cloudy = ['cloud', 'rain', 'downpour', 'snow'].includes(state.weather)
    && groups.clouds && !off.has('clouds');
  if (cloudy) paint(ctx, groups.clouds, pal);

  // [2] 벽·창틀(유리 구멍) → 바닥
  //     바닥은 **거실 절차 바닥(g-floor)** 을 그대로 쓴다. 추출 바닥(BD_ART['bd-floor'])은
  //     ① 디테일이 거실과 다르고 ② 창햇빛 명암이 구워져 있었다(질감만 있어야 함).
  //     절차 바닥은 무광원 알베도(팔레트 슬롯)라 두 문제를 동시에 없앤다. 영역도 y49~ 로 같다.
  if (!off.has('g-wall')) {
    if (state.paintLayer === 'bd-wall' && state.paintCells) drawPaintCells(ctx, state.paintCells);
    else paint(ctx, ART['bd-wall'], pal);
    // 열린 창 — 유리+격자 영역을 풍경으로 다시 덮고(활짝 열림) 접힌 창짝 두 짝
    if (state.window === 'open') {
      ctx.save(); ctx.beginPath(); ctx.rect(22, 7, 33, 25); ctx.clip();
      paint(ctx, SCN, pal);
      if (sunUp) { if (!off.has('sun')) paint(ctx, BD_SUN, pal); }
      else {
        if (!off.has('stars')) paint(ctx, BD_STARS, pal);
        if (!off.has('moon')) paint(ctx, BD_MOON, pal);
      }
      if (cloudy) paint(ctx, groups.clouds, pal);   // 열린 창에서도 구름 유지
      ctx.restore();
      paint(ctx, BD3_SASH_OPEN, pal);
    }
  }
  if (!off.has('g-floor')) paint(ctx, prev ? ART['bd-floor'] : groups['g-floor'], pal);
  // 러그 — 현재는 절차 생성(무광원). state.rug = 위치·크기 조절(Phase 2).
  // 이전 버전은 추출 러그를 가구 z에서 그린다.
  if (!prev && !off.has('bd-rug')) paint(ctx, bedroomRug(state.rug), pal);

  // [2.5] 접지 그림자 (multiply) — 소품 밑, SCENE-RULES §3.4. state.shadowK = 세기 배율.
  //       v3 는 가구 발이 바닥 안(y50~52)이라 그늘 기준선도 낮다.
  if (!off.has('shadow')) {
    const shK = state.shadowK ?? 1;
    ctx.globalCompositeOperation = 'multiply';
    for (const r of groundShadows(off, state.variant === 'v3')) { ctx.globalAlpha = r[5] * shK; ctx.fillStyle = r[4]; ctx.fillRect(r[0], r[1], r[2], r[3]); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // [3] 가구 (무광원 알베도 base). 게이팅. state.offset[id]=[dx,dy] 로 위치 조절(Phase 2).
  for (const id of (prev ? Z_FURNITURE_PREV : Z_FURNITURE)) {
    if (off.has(id) || !ART[id]) continue;
    if (state.paintLayer === id && state.paintCells) { drawPaintCells(ctx, state.paintCells); continue; }
    // 카페인 음료 — v3 는 **한 번에 하나만**(state.drink 가 고른다)
    if (id === 'bd-deskplant' && state.variant === 'v3') {
      paint(ctx, BD3_DRINKS[state.drink] || BD3_DRINKS.coffee, pal);
      continue;
    }
    const o = state.offset?.[id];
    if (o && (o[0] || o[1])) { ctx.save(); ctx.translate(o[0] | 0, o[1] | 0); paint(ctx, ART[id], pal); ctx.restore(); }
    else paint(ctx, ART[id], pal);
  }
  if (!off.has('bd-lamp')) paint(ctx, lampArt(), pal);

  // [3.2] 애니메이션 소품(v3) — 김(나이트드링크)·선풍기 날개. 애니 끄면 0프레임 고정
  if (!prev && state.variant === 'v3') {
    const animOn = !off.has('anim');
    if (!off.has('bd-nightstand')) paint(ctx, steamArt(animOn ? Math.floor(t / 450) % 3 : 0), pal);
    if (!off.has('bd-fan')) paint(ctx, fanSpinArt(animOn ? Math.floor(t / 120) % 3 : 0), pal);
  }

  // [3.5] 돌 base (의자 등받이는 오독이 반복돼 제거 — 스툴)
  const orb = orbSprite(state);
  if (orb && !off.has('orb')) paint(ctx, orb.base, pal);

  // [4] 색감 오버레이 — 시간 → 날씨
  // 랩탑이 유리 앞을 가리면 그 겹침 영역은 유리 블렌더에서 제외(룸 블렌더로 통일).
  // 닫힘 = 좌우 판 교집합 두 조각 / 열림 = 개구부 한 장이라 랩탑 전폭 한 조각.
  const winOpen = state.window === 'open';
  const exc = !off.has('bd-laptop')
    ? (winOpen ? [[32, 26, 12, 6]] : [[32, 26, 5, 6], [38, 26, 6, 6]])
    : null;
  const oids = [`light-${state.time}`];
  if (state.weather !== 'clear') oids.push(`light-${state.weather}`);
  for (const oid of oids) if (!off.has(oid)) overlay(ctx, oid, pal, exc, winOpen);

  // [5] 창광 = poolTrap. 낮·노을=햇빛(--wl), 밤=달빛(--ml). screen. 흐림·비·눈은 죽는다.
  const sunOn = state.time !== 'night';
  const poolId = sunOn ? 'lp-sun' : 'lp-moon';
  const wet = ['fog', 'rain', 'downpour', 'snow'].includes(state.weather);
  if (!off.has(poolId) && !wet) {
    // off 를 넘겨 **가구 차폐**(POOL_OCC) 활성화. 열린 창은 멀리언 그림자 없음.
    const { rects, alphaSlot } = windowPool(sunOn ? '--wl' : '--ml', sunOn ? '--wl-a' : '--ml-a', prev, off, winOpen,
      state.variant === 'v3' ? state.orb : null);
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

  // [6] 발광(emission) — 작업등을 켜면 스탠드·모니터가 켜진다. **각자 토글**(지적):
  //     스탠드=lamp-glow, 모니터=screen-glow.
  if (state.lamp === 'on') {
    ctx.globalCompositeOperation = 'lighter';
    if (!off.has('bd-lamp') && !off.has('lamp-glow')) paint(ctx, lampGlowArt(), pal);
    if (!off.has('bd-laptop') && !off.has('screen-glow')) paint(ctx, screenGlowArt(), pal);
    ctx.globalCompositeOperation = 'source-over';
  }

  // [7] 비네트 — 거실 것 재사용. **접지그림자(shadow)와 분리 토글**(vignette).
  if (!off.has('vignette')) {
    const vigK = state.vigK ?? 1;
    ctx.globalCompositeOperation = 'multiply';
    for (const v of VIGNETTE) { ctx.globalAlpha = v.alpha * vigK; ctx.fillStyle = v.fill; ctx.fillRect(...v.r); }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export { GX, GY };
