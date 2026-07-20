// canvas 렌더러 — 레이어를 z-순서대로 합성한다.
// SVG 의 mix-blend-mode → globalCompositeOperation,
//    <mask> → 오프스크린 + destination-out 으로 옮겼다.
// 그룹 격리(자식의 blend 가 그룹 blend 에 먹히는 문제)는 오프스크린으로 명시 처리한다.
// CSS keyframes 는 없으니 매 프레임 t(ms)를 받아 anim.js 가 변환값을 준다.

import { generateGroups, GX, GY, OX, FLAME_N } from './generate.js';
import { resolve } from './palette.js';
import { PROPS } from './props.js';
import { OVERLAYS, LIGHTS, OCCLUDERS, VIGNETTE, AO, RUG_MARK, contactShadow } from './lights.js';
import { ROOM_DATA } from './room-data.js';
import { ANIM, GROUP_ANIM, TILE_H, flameIdx } from './anim.js';

// 지오메트리는 상태와 무관 — 한 번만 만든다. 벽 여백은 측정된 벽 텍스처로 채운다.
const GEN = generateGroups(ROOM_DATA.groups);

/** 측정·수작화 데이터는 아트 좌표(96 폭)라 캔버스로 옮긴다 */
const shifted = new Map();
function toCanvas(rects) {
  if (!shifted.has(rects)) shifted.set(rects, rects.map((r) => [r[0] + OX, ...r.slice(1)]));
  return shifted.get(rects);
}

// ─────────────── 팔레트 전환 (v2 의 CSS transition: .6s 대체) ───────────────
// canvas 는 CSS 트랜지션이 없으니 팔레트 값을 직접 보간한다.
// 지오메트리는 그대로고 색만 넘어가므로, 팔레트 한 장만 섞으면 씬 전체가 함께 넘어간다.
const TRANS_MS = 600;
const stateKey = (st) => `${st.time}|${st.season}|${st.weather}`;

const hex2rgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const rgb2hex = (c) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
/** CSS 기본 ease 근사 */
const ease = (p) => p * p * (3 - 2 * p);

function lerpVal(a, b, p) {
  if (typeof a === 'string' && a[0] === '#' && typeof b === 'string' && b[0] === '#') {
    const A = hex2rgb(a), B = hex2rgb(b);
    return rgb2hex([0, 1, 2].map((i) => A[i] + (B[i] - A[i]) * p));
  }
  const na = parseFloat(a), nb = parseFloat(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return String(na + (nb - na) * p);
  return p < 0.5 ? a : b;                      // 보간 불가능한 값은 중간에 스냅
}

let lastKey = null, fromPal = null, blended = null, transStart = -1;
let fromTime = null, fromWeather = null;       // 오버레이도 함께 교차 페이드해야 색이 안 튄다
function currentPalette(st, t) {
  const target = resolve(st, ROOM_DATA.palette);
  const k = stateKey(st);
  if (k !== lastKey) {
    fromPal = blended || target;               // 전환 중이면 현재 보간값에서 이어간다
    if (lastKey) [fromTime, fromWeather] = lastKey.split('|');
    lastKey = k;
    transStart = t;
  }
  const p = transStart < 0 ? 1 : Math.min(1, (t - transStart) / TRANS_MS);
  if (p >= 1) { blended = target; return { pal: target, p: 1 }; }
  const e = ease(p), out = {};
  for (const key of Object.keys(target)) out[key] = lerpVal(fromPal[key] ?? target[key], target[key], e);
  blended = out;
  return { pal: out, p: e, fromTime, fromWeather };
}

/** rgba(...) 의 알파에 배수를 건다 — 오버레이 교차 페이드용 */
function scaleAlpha(css, k) {
  const m = css.match(/^rgba\(([^)]+)\)$/);
  if (!m) return css;
  const v = m[1].split(',').map((s) => s.trim());
  return `rgba(${v[0]},${v[1]},${v[2]},${(parseFloat(v[3] ?? 1) * k).toFixed(4)})`;
}

/** z-순서 (뒤 → 앞). 배열 순서가 곧 그리는 순서다 — 문자열 조작이 필요 없다 */
const Z = [
  // [1] 창밖: 벽 뒤까지 그린 뒤 벽이 덮는다
  'base-scenery', 'halo-sun', 'halo-moon', 'sun', 'moon', 'stars', 'clouds',
  'tree-v1-trunk', 'tree-v1-leaves', 'tree-v2-trunk', 'tree-v2-leaves', 'tree-bare',
  'rain', 'downpour', 'snow', 'pt-leaves', 'pt-petals', 'pt-fireflies', 'fx-drops', 'fx-frost',
  // [2] 방 구조. g-wall 은 측정 질감과 메움을 합친 벽 한 장(generate.js wallPlane)
  'g-wall',
  // [2.5] 창턱 눈 — 벽 위, 창틀 뒤. 창밖에 쌓인 게 아니라 창턱에 쌓인 것으로 읽혀야 한다
  'fx-snowcap',
  // 바닥이 벽난로·책장보다 **먼저** 와야 한다 — 둘은 이제 벽면이 아니라 바닥에
  // 서 있어서(generate.js boxFaces) 밑동이 바닥선 아래로 내려온다.
  // 순서가 반대면 바닥이 밑동을 지워, 불만 바닥에 덩그러니 남는다.
  'g-winframe', 'win-sash', 'win-sash-open', 'g-floor', 'g-fireplace', 'g-shelf',
  // [3] 소품 (선반 안 → 맨틀 → 창턱 → 바닥 깔개 → 바닥 스탠딩)
  'bk-1', 'bk-2', 'bk-3', 'bk-4', 'bk-5', 'bk-6',
  'p-waterglass',                                         // 맨틀 위
  'p-windchime', 'p-windchime-tubes',                     // 창 오른쪽 벽
  // 창턱 선반 → 그 위 소품 → 돌 방석 → 돌 → 찻잔(돌 방석 옆)
  'sill-shelf', 'sill-plant', 'p-cushion', 'orb', 'p-cushion-front', 'p-bird',
  'p-cup', 'p-cup-tea', 'p-cup-steam',
  'rug', 'p-blanket', 'orb-rug',
  // 펼친 책은 러그 돌 **앞**에 — 돌이 읽고 있는 것처럼 보여야 하므로 돌보다 나중
  ...[1, 2, 3, 4, 5, 6].map((n) => `p-openbook-${n}`),
  'lamp', 'p-rockingchair',
];

/** 상점에서 사기 전까지는 없는 것 — 패널에서 기본으로 꺼 둔다 */
export const SHOP_PROPS = ['p-cushion', 'p-rockingchair', 'p-cup',
  'p-windchime', 'p-blanket', 'p-waterglass', 'p-bird'];

/** 발광체 — 오버레이 위라 밤에도 어두워지지 않는다 */
// 향초는 상점에서 '책'으로 교체됐다 → 씬에서 제거(촛대·촛불·촛불광원 전부)
const EMISSION = ['fire-body', 'lamp-glow'];

/** 프레임 교체 애니메이션 — 그룹 id → [프레임 그룹 접두어, 프레임 수] */
const FRAMED = { 'fire-body': 'fire-f' };

/** 소품 토글 → 그 오클루더도 함께 끈다 */
const OCC_OF = { orb: 'occ-orb', 'orb-rug': 'occ-orb2', 'sill-plant': 'occ-plant',
                 'floor-props': 'occ-props' };
/** 발광 부품 → 그것을 가진 소품. 소품을 끄면 화염·전구도 함께 꺼진다 */
const FIRE_PARTS = { 'fire-body': 'fire', 'lamp-glow': 'lamp',
                     'p-windchime-tubes': 'p-windchime',
                     'p-cushion-front': 'p-cushion' };
/** 광원 → 그 광원을 내는 소품. 소품이 없으면(=아직 안 샀으면) 빛도 없어야 한다 */
const LIGHT_SOURCE = { 'lp-fire': ['g-fireplace', 'fire'], 'lp-lamp': ['lamp'] };

/** 접지 그림자를 붙일 소품 — 바닥·선반에 **놓이는** 것들.
 *  벽에 걸린 것(풍경)과 그림자 자체(돌 자국)는 뺀다. */
const GROUNDED = ['p-cushion', 'p-cup', 'p-blanket', 'p-rockingchair', 'p-bird',
  'p-waterglass', 'p-openbook-1', 'p-openbook-2', 'p-openbook-3',
  'p-openbook-4', 'p-openbook-5', 'p-openbook-6'];
const CONTACT = Object.fromEntries(GROUNDED.map((id) => [id, null]));

/** 상태별 표시 여부 — CSS 셀렉터 조합 대신 평범한 조건식으로 */
function visible(id, st) {
  const { time, season, weather, orb, tree } = st;
  // 게임 날씨 6종 + 씬 고유 흐림 2종.
  //  cloud(구름낀 흐림) — 구름은 끼지만 그 사이로 해가 보인다
  //  fog(안개낀 흐림)   — 해가 완전히 가려진다
  // 꽃잎·낙엽은 맑은 날의 연출이라 해·달·별이 그대로 보인다.
  const CLOUDY = ['cloud', 'fog', 'rain', 'downpour', 'snow'];
  const SUN_HIDDEN = ['fog', 'rain', 'downpour', 'snow'];
  const hidden = SUN_HIDDEN.includes(weather);
  const clear = !CLOUDY.includes(weather);
  switch (id) {
    case 'sun': case 'halo-sun':   return time !== 'night' && !hidden;
    case 'moon': case 'halo-moon': return time === 'night' && !hidden;
    case 'stars': return time === 'night' && clear;
    case 'clouds': return CLOUDY.includes(weather);
    case 'rain': return weather === 'rain';
    case 'downpour': return weather === 'downpour';
    case 'fx-drops': return weather === 'rain' || weather === 'downpour';
    case 'snow':  case 'fx-snowcap': return weather === 'snow';
    case 'fx-frost': return season === 'winter';
    // 계절이 정하는 파티클(기존 규칙)은 그대로 두고, 날씨로 직접 지정하는 길도 연다
    case 'pt-leaves': return weather === 'leaves' || (season === 'autumn' && clear);
    case 'pt-petals': return weather === 'petals' || (season === 'spring' && clear);
    case 'pt-fireflies': return time === 'night' && season === 'summer' && clear;
    // 겨울엔 잎만 떨어지고 줄기는 남는다
    case 'tree-v1-trunk': return tree === 'v1';
    case 'tree-v2-trunk': return tree === 'v2';
    case 'tree-v1-leaves': return tree === 'v1' && season !== 'winter';
    case 'tree-v2-leaves': return tree === 'v2' && season !== 'winter';
    case 'tree-bare': return season === 'winter';
    // 펼친 책은 꺼내 온 한 권만. 그 권의 책장 칸은 비어야 한다 —
    // 같은 책이 책장과 바닥에 동시에 있으면 안 되므로.
    case 'p-openbook-1': case 'p-openbook-2': case 'p-openbook-3':
    case 'p-openbook-4': case 'p-openbook-5': case 'p-openbook-6':
      return +id.slice(-1) === st.readBook;
    case 'bk-1': case 'bk-2': case 'bk-3':
    case 'bk-4': case 'bk-5': case 'bk-6':
      return +id.slice(-1) !== st.readBook;
    // 여닫이 창 — 닫히면 문설주가 제자리, 열리면 양옆에 접힌다
    case 'win-sash':      return st.window !== 'open';
    case 'win-sash-open': return st.window === 'open';
    // 찻잔 내용물·김은 '채움' 상태에만
    case 'p-cup-tea': case 'p-cup-steam': return st.cup === 'full';
    case 'orb':     return orb === 'sill';
    case 'orb-rug': return orb === 'rug';
    default: return true;
  }
}

const entry = (id) => {
  if (GEN[id]) return { rects: GEN[id] };                    // 이미 캔버스 좌표
  const p = PROPS[id];
  if (p) return { ...p, rects: p.rects && toCanvas(p.rects),
                  layers: p.layers?.map((L) => ({ ...L, rects: toCanvas(L.rects) })) };
  if (ROOM_DATA.groups[id]) return { rects: toCanvas(ROOM_DATA.groups[id]) };
  return null;
};

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
function drawGroup(ctx, id, pal, t, animOn, st) {
  // 프레임 교체형(불꽃)은 t 로 실루엣 한 장을 고른다. 멈추면 0번 프레임.
  const fx = FRAMED[id];
  const e = fx ? { rects: GEN[fx + (animOn ? flameIdx(t, FLAME_N) : 0)], anim: GROUP_ANIM[id] }
               : entry(id);
  if (!e) return;
  const base = e.opacity ?? 1;
  // 풍경 대롱은 창이 열려 바람이 들어올 때만 흔들린다
  const own = (id === 'p-windchime-tubes' && st?.window !== 'open')
    ? null : (GROUP_ANIM[id] || e.anim);
  const tf = animOn && own && ANIM[own] ? ANIM[own](t) : {};
  if (e.rects) drawLayer(ctx, e.rects, pal, tf, base);
  for (const L of e.layers || []) {
    const lt = animOn && ANIM[L.anim] ? ANIM[L.anim](t) : {};
    drawLayer(ctx, L.rects, pal, { ...tf, ...lt }, base);
  }
}

/** 광원 한 장 — 오프스크린에 그리고 오클루더로 파낸 뒤 screen 으로 합성.
 *  오프스크린은 (상태, 가려진 소품) 이 같으면 재사용한다 — 매 프레임 새로 만들면 낭비 */
const lightCache = new Map();
function lightCanvas(id, def, pal, hidden) {
  const key = id + '|' + (def.rects[0] ? pal[def.rects[0].slot] : '') + '|' + [...hidden].sort();
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
  const animOn = !layerOff.has('anim');
  // 상태가 바뀌면 .6s 에 걸쳐 넘어간다 (팔레트 보간 + 오버레이 교차 페이드)
  const { pal, p: tp, fromTime, fromWeather } = currentPalette(st, t);
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
  for (const id of Z) if (on(id)) drawGroup(ctx, id, pal, t, animOn, st);

  // [4] 색감 오버레이 — 시간 → 날씨. 전환 중엔 나가는 쪽·들어오는 쪽을 가중 합성한다
  const ovs = tp >= 1
    ? [[`light-${st.time}`, 1], [`light-${st.weather}`, 1]]
    : [[`light-${fromTime}`, 1 - tp], [`light-${st.time}`, tp],
       [`light-${fromWeather}`, 1 - tp], [`light-${st.weather}`, tp]];
  for (const [oid, w] of ovs) {
    if (!OVERLAYS[oid] || layerOff.has(oid) || w <= 0) continue;
    for (const { r, fill, blend } of OVERLAYS[oid]) {
      ctx.globalCompositeOperation = blend;
      ctx.globalAlpha = 1;
      ctx.fillStyle = w >= 1 ? fill : scaleAlpha(fill, w);
      ctx.fillRect(...r);
    }
  }
  ctx.globalCompositeOperation = 'source-over';

  if (!layerOff.has('shadow')) {
    ctx.globalCompositeOperation = 'multiply';
    // 소품 접지 그림자 — 보이는 것만. 이게 있어야 방에 놓인 것으로 읽힌다
    for (const id of GROUNDED) {
      if (!on(id)) continue;
      if (!CONTACT[id]) CONTACT[id] = contactShadow(entry(id)?.rects);
      for (const c of CONTACT[id]) { ctx.globalAlpha = c.alpha; ctx.fillStyle = c.fill; ctx.fillRect(...c.r); }
    }
    // 돌이 자리를 비웠을 때만 눌린 자국이 드러난다
    if (st.orb !== 'rug' && !layerOff.has('rug-mark'))
      for (const m of RUG_MARK) { ctx.globalAlpha = m.alpha; ctx.fillStyle = m.fill; ctx.fillRect(...m.r); }
    for (const a of AO) { ctx.globalAlpha = a.alpha; ctx.fillStyle = a.fill; ctx.fillRect(...a.r); }
    ctx.globalCompositeOperation = 'source-over';
  }

  // [5] 광원 — 셰이프는 고정, 색·세기만 상태를 따른다
  const hidden = new Set(Object.entries(OCC_OF).filter(([g]) => !on(g)).map(([, c]) => c));
  const sunOn = st.time !== 'night';
  for (const [id, def] of Object.entries(LIGHTS)) {
    if (layerOff.has(id)) continue;
    if (LIGHT_SOURCE[id]?.some((g) => layerOff.has(g))) continue;   // 소품이 꺼지면 빛도 꺼진다
    if ((id === 'lp-sun' && !sunOn) || (id === 'lp-moon' && sunOn)) continue;
    let alpha = parseFloat(pal[def.alphaSlot] ?? 1);
    if (!alpha) continue;
    const fl = GROUP_ANIM[id];                     // 벽난로·촛불 빛은 숨쉰다
    if (animOn && fl && ANIM[fl]) alpha *= ANIM[fl](t).alpha ?? 1;
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
  for (const id of EMISSION) if (on(id)) drawGroup(ctx, id, pal, t, animOn, st);

  // 비네트 — 가장자리를 눌러 광원 쪽으로 시선을 모은다
  if (!layerOff.has('shadow')) {
    ctx.globalCompositeOperation = 'multiply';
    for (const v of VIGNETTE) { ctx.globalAlpha = v.alpha; ctx.fillStyle = v.fill; ctx.fillRect(...v.r); }
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}

export { Z, GX, GY };
