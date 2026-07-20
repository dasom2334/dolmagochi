// 애니메이션 — v2 의 CSS keyframes 를 시간 함수로 옮긴 것.
// canvas 는 CSS 애니메이션이 없으니 매 프레임 t(ms)를 받아 변환값을 계산한다.
//
// 반환: { dx, dy, alpha, scaleY } — 렌더러가 그리기 직전에 적용한다.

const TAU = Math.PI * 2;
/** ease-in-out 왕복 0→1→0 (CSS 의 ease-in-out infinite 근사) */
const pingpong = (t, period, delay = 0) => {
  const p = (((t - delay) % period) + period) % period / period;
  return (1 - Math.cos(p * TAU)) / 2;
};
/** steps(n) — 픽셀아트의 뚝뚝 끊기는 낙하감. 부드럽게 하면 도트가 흐려 보인다 */
const stepped = (t, period, steps, dist, delay = 0) => {
  const p = (((t - delay) % period) + period) % period / period;
  return Math.floor(p * steps) / steps * dist;
};

/** 파티클 타일 높이 — v2 는 <use y="-30"> 로 한 벌 더 얹어 무한 낙하를 만들었다 */
export const TILE_H = 30;

export const ANIM = {
  // ── 낙하: 타일을 30px 내리면 위쪽 복제본이 그 자리를 메운다
  'rain-fall':   (t) => ({ dy: stepped(t, 700, 15, TILE_H), tile: true }),
  'snow-fall-a': (t) => ({ dy: stepped(t, 3800, 30, TILE_H), tile: true }),
  'snow-fall-b': (t) => ({ dy: stepped(t, 5400, 30, TILE_H, -2100), tile: true }),
  'drift-a':     (t) => ({ dy: stepped(t, 6500, 30, TILE_H), tile: true }),
  'drift-b':     (t) => ({ dy: stepped(t, 8000, 30, TILE_H, -3500), tile: true }),

  // ── 반짝임: 투명도 1 ↔ .2
  'twinkle-a': (t) => ({ alpha: 1 - 0.8 * pingpong(t, 2400) }),
  'twinkle-b': (t) => ({ alpha: 1 - 0.8 * pingpong(t, 3100, -1200) }),
  'firefly-a': (t) => ({ alpha: 1 - 0.8 * pingpong(t, 1800) }),
  'firefly-b': (t) => ({ alpha: 1 - 0.8 * pingpong(t, 2600, -900) }),

  // ── 구름: 좌우로 아주 느리게 (-2 ↔ 3)
  'cloud-drift': (t) => ({ dx: Math.round(-2 + 5 * pingpong(t, 68000)) }),

  // ── 불꽃: 아래를 축으로 세로 수축. 3단이 서로 다른 주기라 일렁여 보인다
  'f-out':  (t) => ({ scaleY: 1 - 0.07 * pingpong(t, 900) }),
  'f-mid':  (t) => ({ scaleY: 1 - 0.07 * pingpong(t, 700, -300) }),
  'f-core': (t) => ({ scaleY: 1 - 0.16 * pingpong(t, 500),
                      alpha: 1 - 0.15 * pingpong(t, 500) }),
  'c-flame': (t) => ({ scaleY: 1 - 0.22 * pingpong(t, 1700),
                       alpha: 1 - 0.2 * pingpong(t, 1700) }),

  // ── 광원 숨쉬기: 세기 1 ↔ .72
  'glow-flicker':      (t) => ({ alpha: 1 - 0.28 * pingpong(t, 1300) }),
  'glow-flicker-slow': (t) => ({ alpha: 1 - 0.28 * pingpong(t, 2200, -800) }),
};

/** 어느 그룹에 어떤 애니메이션이 붙는지 (props.js 가 스스로 아는 것 외) */
export const GROUP_ANIM = {
  'fire-out': 'f-out', 'fire-mid': 'f-mid', 'fire-core': 'f-core',
  'candle-flame': 'c-flame',
  'lp-fire': 'glow-flicker', 'lp-candle': 'glow-flicker-slow',
};

export const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
