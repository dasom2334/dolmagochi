// canvas 렌더러 — 레이어를 z-순서대로 합성한다.
// SVG 의 mix-blend-mode → globalCompositeOperation,
//    <mask> → 오프스크린 + destination-out 으로 옮겼다.
// 그룹 격리(자식의 blend 가 그룹 blend 에 먹히는 문제)는 오프스크린으로 명시 처리한다.
// CSS keyframes 는 없으니 매 프레임 t(ms)를 받아 anim.js 가 변환값을 준다.

import { generateGroups, GX, GY } from './generate.js';
import { resolve } from './palette.js';
import { PROPS } from './props.js';
import { OVERLAYS, LIGHTS, OCCLUDERS, VIGNETTE, AO } from './lights.js';
import { ROOM_DATA } from './room-data.js';
import { ANIM, GROUP_ANIM, TILE_H } from './anim.js';

const GEN = generateGroups();   // 지오메트리는 상태와 무관 — 한 번만 만든다

/** z-순서 (뒤 → 앞). 배열 순서가 곧 그리는 순서다 — 문자열 조작이 필요 없다 */
const Z = [
  // [1] 창밖: 벽 뒤까지 그린 뒤 벽이 덮는다
  'base-scenery', 'sun', 'moon', 'stars', 'clouds',
  'tree-v1-trunk', 'tree-v1-leaves', 'tree-v2-trunk', 'tree-v2-leaves', 'tree-bare',
  'rain', 'snow', 'pt-leaves', 'pt-petals', 'pt-fireflies', 'fx-drops', 'fx-frost',
  // [2] 방 구조
  'g-wall', 'g-winframe', 'g-fireplace', 'g-shelf', 'g-floor',
  // [3] 소품 (선반 안 → 맨틀 → 창턱 → 바닥 깔개 → 바닥 스탠딩)
  'bk-1', 'bk-2', 'bk-3', 'bk-4', 'bk-5', 'bk-6',
  'candle', 'sill-plant', 'orb', 'rug', 'orb-rug', 'lamp', 'floor-props',
  // [3.5] 창틀 눈쌓임 — 날씨 틴트를 받도록 오버레이 앞
  'fx-snowcap',
];

/** 발광체 — 오버레이 위라 밤에도 어두워지지 않는다 */
const EMISSION = ['fire-out', 'fire-mid', 'fire-core', 'candle-flame', 'lamp-glow'];

/** 소품 토글 → 그 오클루더도 함께 끈다 */
const OCC_OF = { orb: 'occ-orb', 'orb-rug': 'occ-orb2', 'sill-plant': 'occ-plant',
                 'floor-props': 'occ-props' };
/** 불꽃 토글은 3단을 한꺼번에 */
const FIRE_PARTS = { 'fire-out': 'fire', 'fire-mid': 'fire', 'fire-core': 'fire' };

/** 상태별 표시 여부 — CSS 셀렉터 조합 대신 평범한 조건식으로 */
function visible(id, st) {
  const { time, season, weather, orb, tree } = st;
  const clear = weather === 'clear';
  const overcast = weather !== 'clear';
  switch (id) {
    case 'sun':   return time !== 'night' && !overcast;
    case 'moon':  case 'stars': return time === 'night' && !overcast;
    case 'clouds': return overcast;
    case 'rain':  case 'fx-drops': return weather === 'rain';
    case 'snow':  case 'fx-snowcap': return weather === 'snow';
    case 'fx-frost': return season === 'winter';
    case 'pt-leaves': return season === 'autumn' && (clear || weather === 'cloud');
    case 'pt-petals': return season === 'spring' && (clear || weather === 'cloud');
    case 'pt-fireflies': return time === 'night' && season === 'summer' && clear;
    // 겨울엔 잎만 떨어지고 줄기는 남는다
    case 'tree-v1-trunk': return tree === 'v1';
    case 'tree-v2-trunk': return tree === 'v2';
    case 'tree-v1-leaves': return tree === 'v1' && season !== 'winter';
    case 'tree-v2-leaves': return tree === 'v2' && season !== 'winter';
    case 'tree-bare': return season === 'winter';
    case 'orb':     return orb === 'sill';
    case 'orb-rug': return orb === 'rug';
    default: return true;
  }
}

const entry = (id) =>
  GEN[id] ? { rects: GEN[id] }
  : PROPS[id] ? PROPS[id]
  : ROOM_DATA.groups[id] ? { rects: ROOM_DATA.groups[id] }
  : null;

function drawRects(ctx, rects, pal, alpha) {
  for (const [x, y, w, h, key, op] of rects) {
    ctx.globalAlpha = alpha * (op ?? 1);
    ctx.fillStyle = key[0] === '-' ? pal[key] || '#f0f' : key;
    ctx.fillRect(x, y, w, h);
  }
}

/** 변환(이동·세로수축·투명도)을 적용해 그린다. scaleY 는 밑변을 축으로 — 불꽃이 위로만 줄어든다 */
function drawLayer(ctx, rects, pal, tf = {}, baseAlpha = 1) {
  if (!rects.length) return;
  const alpha = baseAlpha * (tf.alpha ?? 1);
  ctx.save();
  if (tf.dx || tf.dy) ctx.translate(tf.dx || 0, tf.dy || 0);
  if (tf.scaleY && tf.scaleY !== 1) {
    const bottom = Math.max(...rects.map((r) => r[1] + r[3]));
    ctx.translate(0, bottom);
    ctx.scale(1, tf.scaleY);
    ctx.translate(0, -bottom);
  }
  drawRects(ctx, rects, pal, alpha);
  if (tf.tile) {                       // 무한 낙하: 한 벌 위에 더 얹는다
    ctx.translate(0, -TILE_H);
    drawRects(ctx, rects, pal, alpha);
  }
  ctx.restore();
}

/** 그룹 하나 — 정적 rects + 각자 다른 주기의 애니메이션 레이어 */
function drawGroup(ctx, id, pal, t) {
  const e = entry(id);
  if (!e) return;
  const base = e.opacity ?? 1;
  const own = GROUP_ANIM[id] || e.anim;
  const tf = own && ANIM[own] ? ANIM[own](t) : {};
  if (e.rects) drawLayer(ctx, e.rects, pal, tf, base);
  for (const L of e.layers || []) {
    const lt = ANIM[L.anim] ? ANIM[L.anim](t) : {};
    drawLayer(ctx, L.rects, pal, { ...tf, ...lt }, base);
  }
}

/** 광원 한 장 — 오프스크린에 그리고 오클루더로 파낸 뒤 screen 으로 합성.
 *  오프스크린은 (상태, 가려진 소품) 이 같으면 재사용한다 — 매 프레임 새로 만들면 낭비 */
const lightCache = new Map();
function lightCanvas(id, def, pal, hidden) {
  const key = id + '|' + def.rects.length + '|' + pal[def.rects[0]?.slot] + '|' + [...hidden].sort();
  if (lightCache.has(key)) return lightCache.get(key);
  const off = new OffscreenCanvas(GX, GY);
  const o = off.getContext('2d');
  for (const { r, slot, alpha: a } of def.rects) {
    o.globalAlpha = a ?? 1;
    o.fillStyle = pal[slot] || '#fff';
    o.fillRect(...r);
  }
  if (def.mask) {
    o.globalCompositeOperation = 'destination-out';
    for (const [cls, shapes] of Object.entries(OCCLUDERS[def.mask])) {
      if (hidden.has(cls)) continue;          // 소품을 끄면 그림자도 사라진다
      for (const { r, g } of shapes) {
        o.globalAlpha = 1 - g;                // 마스크 회색 = 투과율
        o.fillStyle = '#000';
        o.fillRect(...r);
      }
    }
  }
  if (lightCache.size > 40) lightCache.clear();
  lightCache.set(key, off);
  return off;
}

export function render(canvas, st, layerOff = new Set(), t = 0) {
  const ctx = canvas.getContext('2d');
  const pal = resolve(st, ROOM_DATA.palette);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = pal['--page-bg'] || '#241627';
  ctx.fillRect(0, 0, GX, GY);

    // 패널의 '나무v1/v2' 토글은 줄기·잎을 한꺼번에 끈다
  const TREE_OF = { 'tree-v1-trunk':'tree-v1', 'tree-v1-leaves':'tree-v1',
                    'tree-v2-trunk':'tree-v2', 'tree-v2-leaves':'tree-v2' };
  const on = (id) => visible(id, st) && !layerOff.has(id)
                     && !layerOff.has(FIRE_PARTS[id]) && !layerOff.has(TREE_OF[id]);

  // [1~3.5] 베이스 아트
  for (const id of Z) if (on(id)) drawGroup(ctx, id, pal, t);

  // [4] 색감 오버레이 — 시간 → 날씨
  for (const oid of [`light-${st.time}`, `light-${st.weather}`]) {
    if (!OVERLAYS[oid] || layerOff.has(oid)) continue;
    for (const { r, fill, blend } of OVERLAYS[oid]) {
      ctx.globalCompositeOperation = blend;
      ctx.globalAlpha = 1;
      ctx.fillStyle = fill;
      ctx.fillRect(...r);
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  if (!layerOff.has('shadow')) {
    ctx.globalCompositeOperation = 'multiply';
    for (const a of AO) { ctx.globalAlpha = a.alpha; ctx.fillStyle = a.fill; ctx.fillRect(...a.r); }
    ctx.globalCompositeOperation = 'source-over';
  }

  // [5] 광원 — 셰이프는 고정, 색·세기만 상태를 따른다
  const hidden = new Set(Object.entries(OCC_OF).filter(([g]) => !on(g)).map(([, c]) => c));
  const sunOn = st.time !== 'night';
  for (const [id, def] of Object.entries(LIGHTS)) {
    if (layerOff.has(id)) continue;
    if ((id === 'lp-sun' && !sunOn) || (id === 'lp-moon' && sunOn)) continue;
    let alpha = parseFloat(pal[def.alphaSlot] ?? 1);
    if (!alpha) continue;
    const fl = GROUP_ANIM[id];                     // 벽난로·촛불 빛은 숨쉰다
    if (fl && ANIM[fl]) alpha *= ANIM[fl](t).alpha ?? 1;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha;
    ctx.drawImage(lightCanvas(id, def, pal, hidden), 0, 0);
    ctx.restore();
  }

  // 역광 림라이트 — 창문 광원에 종속 (밤엔 달빛 색을 쓴다)
  const orbId = st.orb === 'sill' ? 'orb' : 'orb-rug';
  if (!layerOff.has('rim') && on(orbId)) {
    const rimPal = { ...pal, '--wl': sunOn ? pal['--wl'] : pal['--ml'] };
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    drawRects(ctx, GEN[st.orb === 'sill' ? 'rim-orb' : 'rim-orb-rug'], rimPal, 1);
    ctx.restore();
  }

  // [6] emission
  for (const id of EMISSION) if (on(id)) drawGroup(ctx, id, pal, t);

  // 비네트 — 가장자리를 눌러 광원 쪽으로 시선을 모은다
  if (!layerOff.has('shadow')) {
    ctx.globalCompositeOperation = 'multiply';
    for (const v of VIGNETTE) { ctx.globalAlpha = v.alpha; ctx.fillStyle = v.fill; ctx.fillRect(...v.r); }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export { Z, GX, GY };
