// 광원·오버레이 — assemble_v2.py 의 포팅.
// 광원은 "셰이프 1장 + 상태별 색·세기"다. 셰이프는 시간이 바뀌어도 변하지 않고,
// 팔레트의 --wl/--ml/--fl/--cl/--ll 과 그 -a(세기)만 바뀐다.

// ─────────────────── 색감 오버레이 (시간 / 날씨) ───────────────────
// 방 영역만 덮는 4조각 + 창유리 1조각. 창은 벽의 구멍이라 따로 다룬다.
const strips = (fill, blend) => [
  { r: [0, 0, 96, 4], fill, blend },
  { r: [0, 34, 96, 38], fill, blend },
  { r: [0, 4, 27, 30], fill, blend },
  { r: [67, 4, 29, 30], fill, blend },
];
const glass = (fill, blend) => [{ r: [27, 4, 40, 30], fill, blend }];

export const OVERLAYS = {
  // 낮은 multiply만으로는 실내가 밤과 구분이 안 된다 → screen 앰비언트로 방을 들어올린다
  'light-day': [
    ...strips('rgba(255,246,230,.06)', 'multiply'),
    ...strips('rgba(140,170,208,.30)', 'screen'),
    ...glass('rgba(255,252,245,.05)', 'screen'),
  ],
  // 하늘 팔레트가 이미 그 시간의 색이라 유리 틴트는 약하게 (이중 착색 방지)
  'light-sunset': [
    ...strips('rgba(255,148,84,.30)', 'multiply'),
    ...strips('rgba(255,120,40,.10)', 'screen'),
    ...glass('rgba(255,140,80,.16)', 'multiply'),
  ],
  'light-night': [
    ...strips('rgba(72,82,150,.52)', 'multiply'),
    ...strips('rgba(25,30,70,.28)', 'multiply'),
    ...glass('rgba(30,38,90,.09)', 'multiply'),
  ],
  'light-cloud': [...strips('rgba(158,165,180,.28)', 'multiply'), ...glass('rgba(165,172,188,.22)', 'multiply')],
  'light-rain': [...strips('rgba(105,116,142,.36)', 'multiply'), ...glass('rgba(95,105,132,.28)', 'multiply')],
  'light-snow': [...strips('rgba(182,190,208,.26)', 'multiply'), ...glass('rgba(195,203,220,.20)', 'multiply')],
};

// ─────────────────── 창문 빛: 앞으로 퍼지는 사다리꼴 ───────────────────
// 창(27..66, 멀리언 46..47)을 창턱 상단과 바닥에 투영한다. 창 밑 벽은 그림자.
// **셰이프는 낮·노을·밤 하나로 통일** — 바뀌는 건 색과 세기뿐(README §3.3).
const WIN_SPREAD = 0.035, WIN_SKEW = 0.55;
const WIN_ZONES = [[35, 36, 0.9], [49, 55, 1], [56, 62, 0.75], [63, 69, 0.5]];

function poolTrap(slot) {
  const CX = 46.5, out = [];
  for (const [zy0, zy1, op] of WIN_ZONES) {
    for (let y = zy0; y <= zy1; y++) {
      const t = y <= 36 ? 0 : y - 48;
      const s = 1 + WIN_SPREAD * t, sh = -WIN_SKEW * t;
      const a = CX + (27 - CX) * s + sh, b = CX + (67 - CX) * s + sh;
      const m0 = CX + (46 - CX) * s + sh, m1 = CX + (48 - CX) * s + sh;
      for (const [p0, q0] of [[a, m0 - 1], [m1, b - 1]]) {
        const p = Math.max(1, Math.round(p0)), q = Math.min(94, Math.round(q0));
        if (q >= p) out.push({ r: [p, y, q - p + 1, 1], slot, alpha: op, blend: 'screen' });
      }
    }
  }
  return out;
}

// ─────────────────── 점광원: 역제곱 감쇠 3단 링 ───────────────────
function rings(cx, cy, ysquash, bands, yr, xclamp, slot) {
  const out = [];
  for (let y = yr[0]; y <= yr[1]; y++) {
    const dy = (y - cy) * ysquash;
    for (const [rIn, rOut, op] of bands) {
      const w2o = rOut * rOut - dy * dy;
      if (w2o <= 0) continue;
      const xo = Math.sqrt(w2o);
      const w2i = rIn * rIn - dy * dy;
      const xi = w2i > 0 ? Math.sqrt(w2i) : 0;
      const segs = xi > 0 ? [[cx - xo, cx - xi], [cx + xi, cx + xo]] : [[cx - xo, cx + xo]];
      for (const [a0, b0] of segs) {
        const a = Math.max(xclamp[0], Math.round(a0)), b = Math.min(xclamp[1], Math.round(b0));
        if (b > a) out.push({ r: [a, y, b - a, 1], slot, alpha: op, blend: 'screen' });
      }
    }
  }
  return out;
}

export const LIGHTS = {
  'lp-sun':  { rects: poolTrap('--wl'), alphaSlot: '--wl-a', mask: 'm-win' },
  'lp-moon': { rects: poolTrap('--ml'), alphaSlot: '--ml-a', mask: 'm-win' },
  'lp-fire': {
    rects: [...rings(11.5, 45, 1.6, [[0, 10, 1], [10, 16, 0.55], [16, 22, 0.28]], [49, 62], [1, 94], '--fl'),
            ...rings(11.5, 43, 1.0, [[0, 8, 0.45], [8, 14, 0.28], [14, 20, 0.14]], [28, 48], [1, 24], '--fl')],
    alphaSlot: '--fl-a', mask: 'm-fire', anim: 'glow-flicker',
  },
  'lp-candle': {
    rects: rings(5, 26, 1.0, [[0, 3, 0.9], [3, 5, 0.45], [5, 7, 0.2]], [20, 32], [1, 13], '--cl'),
    alphaSlot: '--cl-a', anim: 'glow-flicker-slow',
  },
  'lp-lamp': {
    rects: [...rings(74, 35, 1.0, [[0, 5, 0.55], [5, 9, 0.32], [9, 13, 0.16]], [26, 48], [62, 94], '--ll'),
            ...rings(74, 47, 1.5, [[0, 7, 0.8], [7, 12, 0.4], [12, 16, 0.2]], [49, 58], [62, 94], '--ll')],
    alphaSlot: '--ll-a',
  },
};

// ─────────────────── 그림자: Light Mask + 오클루더 ───────────────────
// 소품을 끄면 그 그림자도 사라지고 빛이 통과한다. 회색 단계 = 반그림자.
function occStrip(x0, w, y0, y1, skew, base, grow = 0.03, sill = null) {
  const r = [];
  if (sill) r.push({ r: [sill[0], 35, sill[1], 2], g: 0 });
  const n = Math.max(1, y1 - y0);
  for (let y = y0; y <= y1; y++) {
    const sh = -Math.round(skew * (y - base));
    const gw = Math.round(w * (1 + grow * (y - y0)));
    const f = (y - y0) / n;
    const g = f < 0.4 ? 0 : f < 0.75 ? 0.4 : 0.667;   // #000 / #666 / #aaa
    r.push({ r: [x0 + sh - Math.floor((gw - w) / 2), y, gw, 1], g });
  }
  return r;
}

export const OCCLUDERS = {
  'm-win': {
    'occ-orb':   occStrip(54, 9, 49, 56, 0.55, 48, 0.03, [54, 9]),
    'occ-plant': occStrip(28, 5, 49, 52, 0.55, 48, 0.03, [28, 5]),
    'occ-props': occStrip(21, 8, 49, 52, 0.55, 48, 0),
    // 러그 돌은 밑면(y61/x42-51)에서 시작해야 발밑에 붙는다
    'occ-orb2':  occStrip(42, 10, 62, 68, 0.55, 61, 0.05),
  },
  'm-fire': {
    'occ-props': [{ r: [29, 44, 3, 5], g: 0.5 }, { r: [32, 45, 3, 4], g: 0.69 },
                  { r: [35, 46, 2, 3], g: 0.82 }, { r: [10, 61, 12, 3], g: 0.6 }],
    'occ-orb2':  [{ r: [53, 54, 5, 8], g: 0.53 }, { r: [58, 56, 4, 6], g: 0.73 }],
  },
};

// ─────────────────── 대비 강화 그림자 레이어 ───────────────────
// 비네트: 가장자리를 눌러 창·불 쪽으로 시선을 모은다 (도트답게 계단식)
export const VIGNETTE = ['.34', '.24', '.16', '.09', '.04'].flatMap((op, i) => {
  const m = i + 1, a = parseFloat(op), f = '#0b0710';
  return [
    { r: [0, m - 1, 96, 1], fill: f, alpha: a, blend: 'multiply' },
    { r: [0, 72 - m, 96, 1], fill: f, alpha: a, blend: 'multiply' },
    { r: [m - 1, 0, 1, 72], fill: f, alpha: a, blend: 'multiply' },
    { r: [96 - m, 0, 1, 72], fill: f, alpha: a, blend: 'multiply' },
  ];
});

// 구석·벽 하단 앰비언트 오클루전 — 광원이 닿지 않는 곳을 더 눌러 대비를 벌린다
export const AO = [
  { r: [0, 34, 24, 15], fill: '#150c18', alpha: 0.22, blend: 'multiply' },
  { r: [0, 34, 14, 15], fill: '#150c18', alpha: 0.18, blend: 'multiply' },
  { r: [72, 34, 24, 15], fill: '#150c18', alpha: 0.2, blend: 'multiply' },
  { r: [82, 34, 14, 15], fill: '#150c18', alpha: 0.16, blend: 'multiply' },
  { r: [24, 44, 48, 5], fill: '#150c18', alpha: 0.16, blend: 'multiply' },
];
