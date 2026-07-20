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
  'rain-fall':   (t) => ({ dy: stepped(t, 1000, 15, TILE_H), tile: true }),
  'rain-heavy':  (t) => ({ dy: stepped(t, 640, 15, TILE_H), tile: true }),
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

  // ── 불꽃: 프레임 교체(generate.js flameFrames). 실루엣 자체가 매 프레임 다르다.
  // 이전엔 정지 실루엣을 scaleY 로 눌렀다 폈다 한 게 전부라 "숨쉬는 삼각형"이었다.
  // 위에 미세한 세로 수축을 더해 프레임 사이 간격을 메운다.
  'f-body':  (t) => ({ scaleY: 1 - 0.035 * pingpong(t, 900) }),
  'c-flame': (t) => ({ scaleY: 1 - 0.06 * pingpong(t, 1400) }),

  // ── 풍경 대롱: 창을 열면 바람이 들어와 흔들린다. 매단 것이라 진자처럼 좌우로
  'chime-sway': (t) => ({ dx: Math.round(-1 + 2 * pingpong(t, 2600)) }),
  // ── 찻잔 김: 오르면서 옅어진다
  'steam-rise': (t) => ({ dy: -stepped(t, 2400, 4, 4), alpha: 0.75 - 0.5 * pingpong(t, 2400) }),

  // ── 광원 숨쉬기: 불꽃이 얌전해진 만큼 빛도 덜 출렁이게
  'glow-flicker':      (t) => ({ alpha: 1 - 0.16 * pingpong(t, 2100) }),
  'glow-flicker-slow': (t) => ({ alpha: 1 - 0.18 * pingpong(t, 2900, -800) }),
};

/** 불꽃 프레임 교체 속도(ms/프레임). 빠르면 불이 파닥거려 산만하다 — 느긋한 모닥불 */
export const FLAME_MS = 165;
export const flameIdx = (t, n, off = 0) => Math.floor(t / FLAME_MS + off) % n;

/** 어느 그룹에 어떤 애니메이션이 붙는지 (props.js 가 스스로 아는 것 외) */
export const GROUP_ANIM = {
  'fire-body': 'f-body',
  'lp-fire': 'glow-flicker',
  // 전폭 파티클은 절차 생성(generate.js)이라 props 의 하위 레이어를 못 쓴다 → 여기서 붙인다
  'p-cup-steam': 'steam-rise', clouds: 'cloud-drift', rain: 'rain-fall', downpour: 'rain-heavy',
  snow: 'snow-fall-a', 'pt-petals': 'drift-a', 'pt-leaves': 'drift-b',
};

export const reduceMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
