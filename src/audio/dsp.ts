/**
 * 합성 원재료 — 노이즈 소스 버퍼, 듀티 펄스 파형, 칩튠 양자화, 음계 스냅.
 *
 * synths.ts에 흩어져 있던 whiteBuffer/brownBuffer를 여기로 모으고
 * 핑크노이즈와 LFSR(칩튠 노이즈 채널)을 추가한다. 버퍼는 컨텍스트당 1개씩
 * 캐시 — 노이즈라 같은 버퍼를 재사용해도 청감 차이가 없다.
 *
 * 길이 8초 — 2초 루프는 노이즈에도 숨은 리듬을 만든다(특히 브라운의 저역
 * 흔들림이 0.5Hz 패턴으로 들린다). 8초 모노 float ≈ 1.5MB × 3, 감당 가능.
 */

/** 노이즈 색. lfsr/lfsrShort는 칩튠 노이즈 채널 (주기가 짧을수록 금속성) */
export type SourceKind = 'white' | 'pink' | 'brown' | 'lfsr' | 'lfsrShort';

/** pulse는 duty로 폭을 조절하는 사각파 — NES의 12.5/25/50% 듀티 */
export type WaveKind = 'sine' | 'triangle' | 'square' | 'sawtooth' | 'pulse';

export const SOURCE_KINDS: readonly SourceKind[] = [
  'white',
  'pink',
  'brown',
  'lfsr',
  'lfsrShort',
];

export const WAVE_KINDS: readonly WaveKind[] = [
  'sine',
  'triangle',
  'square',
  'sawtooth',
  'pulse',
];

// ── 버퍼 캐시 ────────────────────────────────────────────────────

const buffers = new WeakMap<AudioContext, Map<string, AudioBuffer>>();

function cached(
  ctx: AudioContext,
  key: string,
  make: () => AudioBuffer,
): AudioBuffer {
  let byKey = buffers.get(ctx);
  if (!byKey) {
    byKey = new Map();
    buffers.set(ctx, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const made = make();
  byKey.set(key, made);
  return made;
}

// ── 노이즈 소스 ──────────────────────────────────────────────────

function whiteBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 8);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * 핑크노이즈 — 옥타브당 3dB 감쇠(S(f) ∝ 1/f, f는 주파수(Hz)).
 * Paul Kellett의 7항 필터: 시상수가 다른 1극 저역통과 여러 개를 겹쳐
 * 1/f 기울기를 근사한다. 화이트보다 귀에 균형 있게 들려 오래 들어도 덜 피로하다.
 */
function pinkBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 8);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.075076;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  return buf;
}

/**
 * 브라운노이즈 — 옥타브당 6dB (S(f) ∝ 1/f²). 난수를 누적해 만든다.
 * 그냥 더하기만 하면 값이 한쪽으로 표류해 찌그러지므로 매 샘플 1/1.02배로
 * 조금씩 0으로 끌어당긴다(leaky integrator). 결과가 작아져 3.5배로 보정.
 */
function brownBuffer(ctx: AudioContext): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * 8);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    last = (last + 0.02 * w) / 1.02;
    d[i] = last * 3.5;
  }
  return buf;
}

/**
 * LFSR 노이즈 — NES 노이즈 채널. 15비트 시프트 레지스터를 돌려 만든다.
 *
 * 피드백 탭이 bit0⊕bit1이면 주기 32767(사실상 백색), bit0⊕bit6이면 주기 93.
 * 93샘플짜리 짧은 주기는 난수가 아니라 **주기 파형**이라 금속성 버즈로 들린다
 * — 매미·귀뚜라미처럼 실체가 주기 펄스열인 소리에 이게 맞는다.
 *
 * 한 주기를 그대로 버퍼에 담아 루프시키므로, 재생 속도(playbackRate)가 곧
 * 음높이다. 기본 속도에서 기음은 sampleRate/93 ≈ 500Hz 부근.
 */
function lfsrBuffer(ctx: AudioContext, short: boolean): AudioBuffer {
  const period = short ? 93 : 32767;
  const buf = ctx.createBuffer(1, period, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let reg = 1;
  for (let i = 0; i < period; i++) {
    const fb = (reg & 1) ^ ((reg >> (short ? 6 : 1)) & 1);
    reg = (reg >> 1) | (fb << 14);
    d[i] = reg & 1 ? -1 : 1;
  }
  return buf;
}

export function sourceBuffer(ctx: AudioContext, kind: SourceKind): AudioBuffer {
  return cached(ctx, `src:${kind}`, () => {
    switch (kind) {
      case 'pink':
        return pinkBuffer(ctx);
      case 'brown':
        return brownBuffer(ctx);
      case 'lfsr':
        return lfsrBuffer(ctx, false);
      case 'lfsrShort':
        return lfsrBuffer(ctx, true);
      case 'white':
      default:
        return whiteBuffer(ctx);
    }
  });
}

// ── 듀티 펄스 ────────────────────────────────────────────────────

const waves = new WeakMap<AudioContext, Map<string, PeriodicWave>>();

/**
 * 듀티비 d의 사각파를 푸리에 계수로 만든다 (Web Audio에 펄스 오실레이터가 없다).
 * 차수 n(=1,2,3…)에 대해
 *   aₙ = (2/πn)·sin(2πnd)      ← 코사인 항 (real)
 *   bₙ = (2/πn)·(1−cos 2πnd)   ← 사인 항  (imag)
 * d=0.5면 통상 사각파, d=0.125면 NES의 12.5% 펄스(가늘고 코맹맹이한 소리).
 */
export function pulseWave(ctx: AudioContext, duty: number): PeriodicWave {
  const key = `pulse:${duty.toFixed(3)}`;
  let byKey = waves.get(ctx);
  if (!byKey) {
    byKey = new Map();
    waves.set(ctx, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const N = 32;
  const real = new Float32Array(N + 1);
  const imag = new Float32Array(N + 1);
  for (let n = 1; n <= N; n++) {
    real[n] = (2 / (Math.PI * n)) * Math.sin(2 * Math.PI * n * duty);
    imag[n] = (2 / (Math.PI * n)) * (1 - Math.cos(2 * Math.PI * n * duty));
  }
  const made = ctx.createPeriodicWave(real, imag);
  byKey.set(key, made);
  return made;
}

/** 오실레이터에 파형 지정 — pulse만 PeriodicWave, 나머지는 기본 타입 */
export function setWave(
  ctx: AudioContext,
  osc: OscillatorNode,
  wave: WaveKind,
  duty: number,
): void {
  if (wave === 'pulse') osc.setPeriodicWave(pulseWave(ctx, duty));
  else osc.type = wave;
}

// ── 칩튠 양자화 ──────────────────────────────────────────────────

/** 칩튠의 서명은 파형이 아니라 이 두 격자다 — 진폭 16단계, 시간 60Hz */
export const FRAME = 1 / 60;
const LEVELS = 15;

/** 이벤트 발화 시각을 60Hz 프레임 격자에 스냅 */
export function snapFrame(t: number, on: boolean): number {
  return on ? Math.ceil(t * 60) / 60 : t;
}

/**
 * 엔벨로프 — 칩튠 모드면 프레임마다 계단으로, 아니면 매끄러운 램프로.
 *
 * 볼륨 양자화는 절대 게인이 아니라 **정규화된 엔벨로프 모양**에 건다.
 * 레이어 게인이 0.03인데 [0,1]을 16등분하면 최소 단계가 0.067이라 소리가
 * 통째로 뭉개진다 — 실제 칩에서도 16단계는 그 채널의 최대치 기준이다.
 */
export function applyEnv(
  param: AudioParam,
  t0: number,
  peak: number,
  attack: number,
  dur: number,
  stepped: boolean,
): void {
  const floor = 0.0001;
  if (!stepped) {
    param.setValueAtTime(floor, t0);
    param.linearRampToValueAtTime(Math.max(floor, peak), t0 + attack);
    param.exponentialRampToValueAtTime(floor, t0 + dur);
    return;
  }
  const steps = Math.max(1, Math.ceil(dur / FRAME));
  const decay = Math.max(0.001, dur - attack);
  for (let i = 0; i <= steps; i++) {
    const x = i * FRAME;
    // attack 구간은 직선, 이후는 지수 감쇠(끝에서 1/1000)
    const shape =
      x < attack
        ? attack > 0
          ? x / attack
          : 1
        : Math.pow(0.001, (x - attack) / decay);
    const q = Math.round(Math.min(1, Math.max(0, shape)) * LEVELS) / LEVELS;
    param.setValueAtTime(Math.max(floor, q * peak), t0 + x);
  }
  param.setValueAtTime(floor, t0 + dur);
}

// ── 음계 스냅 ────────────────────────────────────────────────────

/**
 * 5음 음계(펜타토닉) 반음 오프셋. 어느 두 음을 골라도 잘 부딪히지 않아
 * 무리로 우는 소리(새·풍경·개구리)를 겹쳐도 불협이 안 생긴다.
 * BGM(M13)이 붙으면 조성에 맞춰야 하므로 root를 밖에서 준다.
 */
const PENTATONIC = [0, 2, 4, 7, 9];

/**
 * 주파수를 음계 위로 끌어당긴다.
 * f는 대상 주파수(Hz), root는 조성의 으뜸음(Hz, 기본 261.63 = 가운데 다).
 * 반음 거리 s = 12·log₂(f/root)를 구해 옥타브와 옥타브 내 위치로 쪼갠 뒤,
 * 펜타토닉 다섯 자리 중 가장 가까운 곳으로 보낸다.
 */
export function snapScale(f: number, root = 261.63): number {
  if (f <= 0) return f;
  const s = 12 * Math.log2(f / root);
  const oct = Math.floor(s / 12);
  const within = s - oct * 12;
  let best = PENTATONIC[0];
  let bestDist = Infinity;
  for (const p of PENTATONIC) {
    const d = Math.abs(p - within);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return root * Math.pow(2, oct + best / 12);
}

/** min~max 균등 난수 */
export function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** min~max 정수 난수 (양끝 포함) */
export function randInt(min: number, max: number): number {
  return Math.floor(min + Math.random() * (max - min + 1));
}
