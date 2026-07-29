// 침실 렌더러 — design/bedroom/render.js 의 **확정본(v3 손작화) 경로만** 옮긴 판.
// 거실 scene/render.js 의 패스 구조를 그대로 따른다(SCENE-RULES §1):
//   [1] 창밖 풍경(전체) → [2] 벽·바닥 → [2.5] 접지그림자 → [3] 가구(알베도)
//   → [4] 색감 오버레이(시간→날씨) → [5] 창광(poolTrap) → [5.5] 돌 역광
//   → [6] 스탠드·모니터 발광 → [7] 비네트
// 색·오버레이·비네트·AMBIENT 는 거실 모듈을 그대로 공유한다.
//
// 원본과 다른 점 (거실처럼 통째 복사가 아닌 이유):
//   · 뷰어 전용 변형('현재' 추출판 BD_ART 85KB, '이전' PREV 98KB)과 v4 편집 패널
//     훅(override·offset·paintCells·vigK·shadowK)을 뺐다 — 앱은 확정본만 그린다.
//   · 그래서 state.variant 분기가 없다(항상 v3). 그 밖의 패스·수치는 원본과 같아야
//     하며, 침실 그림을 고칠 땐 **design 쪽을 고치고 여기 반영**한다(거실 정책과 동일).
import { generateGroups } from '../livingroom/generate.js';
import { resolve } from '../livingroom/palette.js';
import { ROOM_DATA } from '../livingroom/room-data.js';
import { OVERLAYS, AMBIENT, VIGNETTE } from '../livingroom/lights.js';
import { ANIM, GROUP_ANIM, TILE_H } from '../livingroom/anim.js';
import { BD_GLASS } from './glass.js';
import { BD3_ART, BD3_DRINKS, BD3_SASH_OPEN, BD3_PILLOW_BED, BD3_PILLOW_FLOOR,
  BD3_FRAME_SHOTS, steamArt, fanSpinArt } from './geom-art-v3.js';
import { ORB_SPOTS, lampArt, lampGlowArt, screenGlowArt, windowPool, groundShadows, bedroomRug,
  bedroomScenery, BD_SUN, BD_MOON, BD_STARS } from './geom.js';

const GX = 128, GY = 72;
const groups = generateGroups({});           // 거실 절차 그룹(바닥·구름 재사용)
const SCN = bedroomScenery();                // 침실 전용 창밖(하늘+나무 캐노피)
const RUG = bedroomRug();                    // 절차 러그(무광원) — 상태와 무관해 한 번만

// 상점 소품 — 안 산 상태로 시작(거실 SHOP_PROPS 대응)
export const SHOP_PROPS = ['bd-desk', 'bd-chair', 'bd-laptop', 'bd-deskplant',
  'bd-nightstand', 'bd-bed', 'bd-pillow', 'bd-fan', 'bd-lamp'];

// z-순서 (뒤→앞) — 창밖은 [1]에서 따로, 여기는 방 구조·가구.
// bd-rug 는 추출본을 안 쓰고 절차 러그(bedroomRug)로 대체 → 목록에서 뺀다.
const Z_FURNITURE = ['bd-frames', 'bd-shelf', 'bd-bed', 'bd-fan', 'bd-nightstand',
  'bd-desk', 'bd-laptop', 'bd-deskplant', 'bd-chair'];

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

// ── 창밖 강수 — 비·폭우·눈·꽃잎. 거실이 절차 생성한 입자를 그대로 쓴다.
// 입자는 캔버스 전폭(x0~127, y0~29)이라 침실 창(x22~54) 자리에도 이미 깔려 있고,
// 벽[2]이 유리 구멍만 남기고 덮으므로 따로 자를 필요가 없다.
// 이게 빠져 있어서 날씨를 비로 바꿔도 창밖이 흐려지기만 하고 아무것도 안 떨어졌다.
const WEATHER_GROUP = { rain: 'rain', downpour: 'downpour', snow: 'snow', petals: 'pt-petals' };
function paintWeather(ctx, pal, state, off, t, animOn) {
  const id = WEATHER_GROUP[state.weather];
  if (!id || !groups[id] || off.has(id)) return;
  const tf = animOn && ANIM[GROUP_ANIM[id]] ? ANIM[GROUP_ANIM[id]](t) : {};
  ctx.save();
  if (tf.dy) ctx.translate(0, tf.dy);
  paint(ctx, groups[id], pal);
  if (tf.tile) { ctx.translate(0, -TILE_H); paint(ctx, groups[id], pal); }   // 무한 낙하
  ctx.restore();
}

// 돌 자리 판정 — state.orb('none'/'chair'/'bed'/'rug').
// ORB_SPOTS 는 뷰어의 변형 토글 때문에 state 를 받는다 — 앱은 항상 v3 좌표.
function orbSprite(state) {
  return (state.orb && state.orb !== 'none' && ORB_SPOTS[state.orb])
    ? ORB_SPOTS[state.orb]({ variant: 'v3' }) : null;
}

export function render(cv, state, off = new Set(), t = 0) {
  const ctx = cv.getContext('2d');
  // 방 팔레트(--rg* 러그 등)까지 넘긴다 — 거실과 동일. 없으면 러그가 #f0f 로 뜬다.
  const pal = resolve(state, ROOM_DATA.palette);
  ctx.imageSmoothingEnabled = false;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.fillStyle = pal['--page-bg'] || '#1a1330';
  ctx.fillRect(0, 0, GX, GY);

  // [1] 창밖 풍경 — **침실 전용**(하늘+나무 캐노피, 캔버스 전체). 벽[2]이 덮어
  //     개구부로만 보인다. 해/달은 창 왼판 — 시간이 가른다. 별은 밤에만.
  const sunUp = state.time !== 'night';
  if (!off.has('base-scenery')) paint(ctx, SCN, pal);
  if (sunUp) { if (!off.has('sun')) paint(ctx, BD_SUN, pal); }
  else {
    if (!off.has('stars')) paint(ctx, BD_STARS, pal);
    if (!off.has('moon')) paint(ctx, BD_MOON, pal);
  }
  // 구름은 **흐린 계열 날씨에만**
  const cloudy = ['cloud', 'rain', 'downpour', 'snow'].includes(state.weather)
    && groups.clouds && !off.has('clouds');
  if (cloudy) paint(ctx, groups.clouds, pal);
  paintWeather(ctx, pal, state, off, t, !off.has('anim'));

  // [2] 벽·창틀(유리 구멍) → 바닥
  //     바닥은 **거실 절차 바닥(g-floor)** 을 그대로 쓴다 — 무광원 알베도(팔레트 슬롯).
  if (!off.has('g-wall')) {
    paint(ctx, BD3_ART['bd-wall'], pal);
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
      paintWeather(ctx, pal, state, off, t, !off.has('anim'));
      ctx.restore();
      paint(ctx, BD3_SASH_OPEN, pal);
    }
  }
  if (!off.has('g-floor')) paint(ctx, groups['g-floor'], pal);
  if (!off.has('bd-rug')) paint(ctx, RUG, pal);

  // [2.5] 접지 그림자 (multiply) — 소품 밑, SCENE-RULES §3.4.
  //       v3 는 가구 발이 바닥 안(y50~52)이라 그늘 기준선도 낮다.
  if (!off.has('shadow')) {
    ctx.globalCompositeOperation = 'multiply';
    for (const r of groundShadows(off, true)) { ctx.globalAlpha = r[5]; ctx.fillStyle = r[4]; ctx.fillRect(r[0], r[1], r[2], r[3]); }
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }

  // [3] 가구 (무광원 알베도 base). 게이팅 — 안 산 소품은 off 로 꺼져 들어온다.
  for (const id of Z_FURNITURE) {
    if (off.has(id) || !BD3_ART[id]) continue;
    // 액자 — 호감도만큼 앞에서부터 n 장. 벽에 추억이 한 장씩 걸린다.
    if (id === 'bd-frames') {
      const n = state.frames == null ? BD3_FRAME_SHOTS.length : state.frames;
      for (let k = 0; k < Math.min(n, BD3_FRAME_SHOTS.length); k++) paint(ctx, BD3_FRAME_SHOTS[k], pal);
      continue;
    }
    // 카페인 음료 — **한 번에 하나만**(state.drink 가 고른다)
    if (id === 'bd-deskplant') {
      paint(ctx, BD3_DRINKS[state.drink] || BD3_DRINKS.coffee, pal);
      continue;
    }
    paint(ctx, BD3_ART[id], pal);
  }
  // 베개 — 침대가 있으면 헤드보드 앞, 없으면 러그 위. 베개를 침대보다 먼저 사기 때문에
  // (shop: bed requires pillow) 침대 없이 베개만 있는 판이 실제로 있다.
  if (!off.has('bd-pillow'))
    paint(ctx, off.has('bd-bed') ? BD3_PILLOW_FLOOR : BD3_PILLOW_BED, pal);
  if (!off.has('bd-lamp')) paint(ctx, lampArt(), pal);

  // [3.2] 애니메이션 소품 — 김(나이트드링크)·선풍기 날개. 애니 끄면 0프레임 고정
  const animOn = !off.has('anim');
  if (!off.has('bd-nightstand')) paint(ctx, steamArt(animOn ? Math.floor(t / 450) % 3 : 0), pal);
  // 선풍기는 눌러서 따로 멈춘다 — 전역 anim 과 별개 게이트
  if (!off.has('bd-fan')) paint(ctx, fanSpinArt(animOn && !off.has('anim-fan') ? Math.floor(t / 120) % 3 : 0), pal);

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
    // orb 를 넘기면 의자에 앉은 돌도 창광을 막는다.
    const { rects, alphaSlot } = windowPool(sunOn ? '--wl' : '--ml', sunOn ? '--wl-a' : '--ml-a',
      false, off, winOpen, state.orb);
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

  // [6] 발광(emission) — 작업등을 켜면 스탠드·모니터가 켜진다. **각자 토글**:
  //     스탠드=lamp-glow, 모니터=screen-glow.
  //     창광 그림자는 남는다(창빛이 막히는 건 그대로) — 대신 스탠드의 바닥 스필이
  //     그 자리를 웜톤으로 되메운다(lampGlowArt 스필 4행).
  // 스탠드와 모니터는 **각자** 켜고 끈다 — 하나로 묶여 있어 램프를 끄면 화면도 꺼졌다
  const screenOn = state.screen === 'on';
  if (state.lamp === 'on' || screenOn) {
    ctx.globalCompositeOperation = 'lighter';
    if (state.lamp === 'on' && !off.has('bd-lamp') && !off.has('lamp-glow')) paint(ctx, lampGlowArt(), pal);
    if (screenOn && !off.has('bd-laptop') && !off.has('screen-glow')) paint(ctx, screenGlowArt(), pal);
    ctx.globalCompositeOperation = 'source-over';
  }

  // [7] 비네트 — 거실 것 재사용. 접지그림자(shadow)와 분리 토글(vignette).
  if (!off.has('vignette')) {
    ctx.globalCompositeOperation = 'multiply';
    for (const v of VIGNETTE) { ctx.globalAlpha = v.alpha; ctx.fillStyle = v.fill; ctx.fillRect(...v.r); }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export { GX, GY };
