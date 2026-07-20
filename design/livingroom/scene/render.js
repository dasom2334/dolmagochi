// canvas 렌더러 — 레이어를 z-순서대로 합성한다.
// SVG 의 mix-blend-mode → globalCompositeOperation,
//    <mask> → 오프스크린 + destination-out 으로 옮겼다.
// 그룹 격리(자식의 blend 가 그룹 blend 에 먹히는 문제)는 오프스크린으로 명시 처리한다.

import { generateGroups, GX, GY } from './generate.js';
import { resolve } from './palette.js';
import { PROPS } from './props.js';
import { OVERLAYS, LIGHTS, OCCLUDERS, VIGNETTE, AO } from './lights.js';
import { ROOM_DATA } from './room-data.js';

const GEN = generateGroups();   // 지오메트리는 상태와 무관 — 한 번만 만든다

/** z-순서 (뒤 → 앞). 배열 순서가 곧 그리는 순서다 — 문자열 조작이 필요 없다 */
const Z = [
  // [1] 창밖: 벽 뒤까지 그린 뒤 벽이 덮는다
  'base-scenery', 'sun', 'moon', 'stars', 'clouds',
  'tree-v1', 'tree-v2', 'tree-bare',
  'rain', 'snow', 'pt-leaves', 'pt-petals', 'pt-fireflies', 'fx-drops', 'fx-frost',
  // [2] 방 구조
  'g-wall', 'g-winframe', 'g-fireplace', 'g-shelf', 'g-floor',
  // [3] 소품 (선반 안 → 맨틀 → 창턱 → 바닥 깔개 → 바닥 스탠딩)
  'bk-1', 'bk-2', 'bk-3', 'bk-4', 'bk-5', 'bk-6',
  'candle', 'sill-plant', 'orb', 'rug', 'orb-rug', 'lamp', 'floor-props',
  // [3.5] 창틀 눈쌓임 — 날씨 틴트를 받도록 오버레이 앞
  'fx-snowcap',
];

/** 상태별 표시 여부 — CSS 셀렉터 조합 대신 평범한 조건식으로 */
function visible(id, st) {
  const { time, season, weather, orb, tree } = st;
  const clearish = weather === 'clear';
  const overcast = weather !== 'clear';
  switch (id) {
    case 'sun':   return time !== 'night' && !overcast;
    case 'moon':  return time === 'night' && !overcast;
    case 'stars': return time === 'night' && !overcast;
    case 'clouds': return overcast;
    case 'rain':  return weather === 'rain';
    case 'snow':  return weather === 'snow';
    case 'fx-drops':   return weather === 'rain';
    case 'fx-snowcap': return weather === 'snow';
    case 'fx-frost':   return season === 'winter';
    case 'pt-leaves':  return season === 'autumn' && (clearish || weather === 'cloud');
    case 'pt-petals':  return season === 'spring' && (clearish || weather === 'cloud');
    case 'pt-fireflies': return time === 'night' && season === 'summer' && clearish;
    case 'tree-v1': return tree === 'v1' && season !== 'winter';
    case 'tree-v2': return tree === 'v2' && season !== 'winter';
    case 'tree-bare': return season === 'winter';
    case 'orb':     return orb === 'sill';
    case 'orb-rug': return orb === 'rug';
    default: return true;
  }
}

const RECTS = (id) => GEN[id] || PROPS[id]?.rects || ROOM_DATA.groups[id] || [];

function paint(ctx, rects, pal, opt = {}) {
  ctx.save();
  ctx.globalCompositeOperation = opt.blend || 'source-over';
  for (const r of rects) {
    const [x, y, w, h, key, op] = r;
    ctx.globalAlpha = (opt.alpha ?? 1) * (op ?? 1);
    ctx.fillStyle = key[0] === '-' ? pal[key] || '#f0f' : key;
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

/** 광원 한 장 — 오프스크린에 그리고 오클루더로 파낸 뒤 screen 으로 합성 */
function paintLight(ctx, def, pal, st, hidden) {
  const alpha = parseFloat(pal[def.alphaSlot] ?? 1);
  if (!alpha) return;
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
      if (hidden.has(cls)) continue;               // 소품을 끄면 그림자도 사라진다
      for (const { r, g } of shapes) {
        o.globalAlpha = 1 - g;                     // 마스크 회색 = 투과율
        o.fillStyle = '#000';
        o.fillRect(...r);
      }
    }
  }
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.globalAlpha = alpha;
  ctx.drawImage(off, 0, 0);
  ctx.restore();
}

/** 소품 토글 → 그 오클루더도 함께 끈다 */
const OCC_OF = { orb: 'occ-orb', 'orb-rug': 'occ-orb2', 'sill-plant': 'occ-plant',
                 'floor-props': 'occ-props' };

export function render(canvas, st, layerOff = new Set()) {
  const ctx = canvas.getContext('2d');
  const pal = resolve(st, ROOM_DATA.palette);
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, GX, GY);
  ctx.fillStyle = pal['--page-bg'] || '#241627';
  ctx.fillRect(0, 0, GX, GY);

  const on = (id) => visible(id, st) && !layerOff.has(id);

  // [1~3.5] 베이스 아트
  for (const id of Z) if (on(id)) paint(ctx, RECTS(id), pal);

  // [4] 색감 오버레이 — 시간 → 날씨
  for (const id of [`light-${st.time}`, `light-${st.weather}`])
    if (OVERLAYS[id] && !layerOff.has(id))
      for (const { r, fill, blend } of OVERLAYS[id]) paint(ctx, [[...r, fill]], pal, { blend });

  if (!layerOff.has('shadow')) paint(ctx, AO.map(a => [...a.r, a.fill, a.alpha]), pal, { blend: 'multiply' });

  // [5] 광원 — 셰이프는 고정, 색·세기만 상태를 따른다
  const hidden = new Set(Object.entries(OCC_OF)
    .filter(([gid]) => !on(gid)).map(([, cls]) => cls));
  const sunOn = st.time !== 'night';
  for (const [id, def] of Object.entries(LIGHTS)) {
    if (layerOff.has(id)) continue;
    if (id === 'lp-sun' && !sunOn) continue;
    if (id === 'lp-moon' && sunOn) continue;
    paintLight(ctx, def, pal, st, hidden);
  }

  // 역광 림라이트 — 창문 광원에 종속 (밤엔 달빛 색을 쓴다)
  if (!layerOff.has('rim') && on(st.orb === 'sill' ? 'orb' : 'orb-rug')) {
    const rimPal = { ...pal, '--wl': sunOn ? pal['--wl'] : pal['--ml'] };
    const id = st.orb === 'sill' ? 'rim-orb' : 'rim-orb-rug';
    paint(ctx, RECTS(id), rimPal, { blend: 'screen' });
  }

  // [6] emission — 발광체는 오버레이 위라 밤에도 어두워지지 않는다
  for (const id of ['fire', 'candle-flame', 'lamp-glow'])
    if (on(id)) paint(ctx, RECTS(id), pal);

  // 비네트 — 가장자리를 눌러 광원 쪽으로 시선을 모은다
  if (!layerOff.has('shadow'))
    paint(ctx, VIGNETTE.map(v => [...v.r, v.fill, v.alpha]), pal, { blend: 'multiply' });
}

export { Z, GX, GY };
