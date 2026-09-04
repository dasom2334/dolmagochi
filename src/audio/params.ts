/**
 * 레이어 파라미터 — 소리를 코드가 아니라 **데이터**로 적는다.
 *
 * 지금까지는 대역·간격·게인이 synths.ts 함수 안에 박혀 있어서, 숫자 하나
 * 바꾸려면 코드를 고치고 게임을 그 상황까지 진행해야 했다. 여기로 빼내면
 * 튜닝 페이지(/tune)와 게임이 **같은 테이블**을 읽으므로 두 벌로 갈라지지 않고,
 * 새 레이어 하나가 함수가 아니라 데이터 한 줄이 된다.
 *
 * 모델 7종의 조합으로 27개 레이어를 전부 표현한다:
 *   bed(지속 노이즈) burst(원샷·클러스터) chirp(피치 프레이즈)
 *   tone(단발 피치 램프) buzz(지속 버즈+게이트) bell(비조화 부분음) drone(지속 톤)
 */
import type { SourceKind, WaveKind } from './dsp';

export type FilterKind = 'lowpass' | 'bandpass' | 'highpass' | 'none';

/**
 * LFO 변조 대상. depth는 **비율**이라 단위가 없다 —
 * gain이면 게인의 ±비율, filter면 컷오프의 ±비율, pitch면 재생속도의 ±비율.
 */
export type LfoTarget = 'gain' | 'filter' | 'pitch';

export interface Bed {
  kind: 'bed';
  src: SourceKind;
  /** 재생 속도 — LFSR 소스에서는 이게 곧 음높이 */
  rate: number;
  filter: FilterKind;
  freq: number;
  q: number;
  gain: number;
  lfoRate: number;
  lfoDepth: number;
  lfoTarget: LfoTarget;
}

export interface Burst {
  kind: 'burst';
  src: SourceKind;
  filter: FilterKind;
  freq: number;
  q: number;
  /** 0이 아니면 발화할 때마다 freq와 이 값을 번갈아 쓴다 (좌우 발, 빗자루 왕복) */
  altFreq: number;
  durMin: number;
  durMax: number;
  volMin: number;
  volMax: number;
  attack: number;
  everyMin: number;
  everyMax: number;
  countMin: number;
  countMax: number;
  spacingMin: number;
  spacingMax: number;
  grid: boolean;
}

export interface Chirp {
  kind: 'chirp';
  wave: WaveKind;
  duty: number;
  freqMin: number;
  freqMax: number;
  /** 음 하나 안에서의 피치 배율 — 1보다 작으면 하강, 크면 상승 */
  sweep: number;
  dur: number;
  volMin: number;
  volMax: number;
  attack: number;
  notesMin: number;
  notesMax: number;
  spacingMin: number;
  spacingMax: number;
  /** 프레이즈 안에서 음마다 흔들리는 폭(비율) */
  detune: number;
  everyMin: number;
  everyMax: number;
  scale: boolean;
  grid: boolean;
}

export interface Tone {
  kind: 'tone';
  wave: WaveKind;
  duty: number;
  freqMin: number;
  freqMax: number;
  /** 피치 배율 — 물방울·기포는 1보다 크다(상승 처프) */
  ramp: number;
  rampTime: number;
  dur: number;
  vol: number;
  attack: number;
  everyMin: number;
  everyMax: number;
  grid: boolean;
}

export interface Buzz {
  kind: 'buzz';
  src: SourceKind;
  rate: number;
  filter: FilterKind;
  freq: number;
  q: number;
  gain: number;
  tremRate: number;
  tremDepth: number;
  swellRate: number;
  swellDepth: number;
  /** 게이트 — 0이면 끊김 없이 지속. 귀뚜라미의 트릴이 이걸로 만들어진다 */
  gateOn: number;
  gateOff: number;
  gateGroup: number;
  gateRest: number;
}

export interface Bell {
  kind: 'bell';
  freqMin: number;
  freqMax: number;
  /** 부분음 배수 — 금속은 정수배가 아니다(비조화). 정수로 두면 오르간이 된다 */
  p2: number;
  p3: number;
  decay: number;
  vol: number;
  everyMin: number;
  everyMax: number;
  scale: boolean;
}

export interface Drone {
  kind: 'drone';
  wave: WaveKind;
  duty: number;
  freq: number;
  gain: number;
  lfoRate: number;
  lfoDepth: number;
  lfoTarget: LfoTarget;
}

export type Model = Bed | Burst | Chirp | Tone | Buzz | Bell | Drone;
export type ModelKind = Model['kind'];

// ── UI 스키마 (슬라이더 자동 생성) ───────────────────────────────

export type Field =
  | {
      key: string;
      label: string;
      kind: 'num';
      min: number;
      max: number;
      step: number;
      unit?: string;
    }
  | { key: string; label: string; kind: 'opt'; options: readonly string[] }
  | { key: string; label: string; kind: 'bool' };

const SRC: readonly string[] = ['white', 'pink', 'brown', 'lfsr', 'lfsrShort'];
const WAVE: readonly string[] = [
  'sine',
  'triangle',
  'square',
  'sawtooth',
  'pulse',
];
const FILT: readonly string[] = ['lowpass', 'bandpass', 'highpass', 'none'];
const TGT: readonly string[] = ['gain', 'filter', 'pitch'];

const n = (
  key: string,
  label: string,
  min: number,
  max: number,
  step: number,
  unit?: string,
): Field => ({ key, label, kind: 'num', min, max, step, unit });

export const MODEL_FIELDS: Record<ModelKind, readonly Field[]> = {
  bed: [
    { key: 'src', label: '소스', kind: 'opt', options: SRC },
    n('rate', '재생속도(LFSR 음높이)', 0.1, 4, 0.01, '×'),
    { key: 'filter', label: '필터', kind: 'opt', options: FILT },
    n('freq', '주파수', 40, 12000, 10, 'Hz'),
    n('q', 'Q(좁을수록 음정처럼)', 0.3, 30, 0.1),
    n('gain', '게인', 0, 0.3, 0.001),
    n('lfoRate', 'LFO 속도', 0, 20, 0.01, 'Hz'),
    n('lfoDepth', 'LFO 깊이(비율)', 0, 1, 0.01),
    { key: 'lfoTarget', label: 'LFO 대상', kind: 'opt', options: TGT },
  ],
  burst: [
    { key: 'src', label: '소스', kind: 'opt', options: SRC },
    { key: 'filter', label: '필터', kind: 'opt', options: FILT },
    n('freq', '주파수', 40, 12000, 10, 'Hz'),
    n('q', 'Q', 0.3, 30, 0.1),
    n('altFreq', '교대 주파수(0=없음)', 0, 12000, 10, 'Hz'),
    n('durMin', '길이 최소', 0.005, 8, 0.005, 's'),
    n('durMax', '길이 최대', 0.005, 8, 0.005, 's'),
    n('volMin', '음량 최소', 0, 0.4, 0.005),
    n('volMax', '음량 최대', 0, 0.4, 0.005),
    n('attack', '어택', 0, 3, 0.001, 's'),
    n('everyMin', '간격 최소', 20, 40000, 10, 'ms'),
    n('everyMax', '간격 최대', 20, 40000, 10, 'ms'),
    n('countMin', '묶음 개수 최소', 1, 16, 1),
    n('countMax', '묶음 개수 최대', 1, 16, 1),
    n('spacingMin', '묶음 내 간격 최소', 10, 600, 5, 'ms'),
    n('spacingMax', '묶음 내 간격 최대', 10, 600, 5, 'ms'),
    { key: 'grid', label: '60Hz 프레임 스냅', kind: 'bool' },
  ],
  chirp: [
    { key: 'wave', label: '파형', kind: 'opt', options: WAVE },
    n('duty', '듀티비(pulse)', 0.05, 0.5, 0.005),
    n('freqMin', '기준음 최소', 60, 8000, 10, 'Hz'),
    n('freqMax', '기준음 최대', 60, 8000, 10, 'Hz'),
    n('sweep', '피치 배율(<1 하강)', 0.3, 3, 0.01, '×'),
    n('dur', '음 길이', 0.01, 1, 0.005, 's'),
    n('volMin', '음량 최소', 0, 0.3, 0.005),
    n('volMax', '음량 최대', 0, 0.3, 0.005),
    n('attack', '어택', 0, 0.2, 0.001, 's'),
    n('notesMin', '음 수 최소', 1, 12, 1),
    n('notesMax', '음 수 최대', 1, 12, 1),
    n('spacingMin', '음 간격 최소', 20, 600, 5, 'ms'),
    n('spacingMax', '음 간격 최대', 20, 600, 5, 'ms'),
    n('detune', '음마다 흔들림', 0, 0.6, 0.01),
    n('everyMin', '프레이즈 간격 최소', 200, 40000, 100, 'ms'),
    n('everyMax', '프레이즈 간격 최대', 200, 40000, 100, 'ms'),
    { key: 'scale', label: '음계 스냅', kind: 'bool' },
    { key: 'grid', label: '60Hz 프레임 스냅', kind: 'bool' },
  ],
  tone: [
    { key: 'wave', label: '파형', kind: 'opt', options: WAVE },
    n('duty', '듀티비(pulse)', 0.05, 0.5, 0.005),
    n('freqMin', '기준음 최소', 60, 6000, 10, 'Hz'),
    n('freqMax', '기준음 최대', 60, 6000, 10, 'Hz'),
    n('ramp', '피치 배율(>1 상승)', 0.3, 4, 0.01, '×'),
    n('rampTime', '램프 시간', 0.01, 2, 0.01, 's'),
    n('dur', '길이', 0.02, 3, 0.01, 's'),
    n('vol', '음량', 0, 0.3, 0.005),
    n('attack', '어택', 0, 0.5, 0.001, 's'),
    n('everyMin', '간격 최소', 100, 40000, 50, 'ms'),
    n('everyMax', '간격 최대', 100, 40000, 50, 'ms'),
    { key: 'grid', label: '60Hz 프레임 스냅', kind: 'bool' },
  ],
  buzz: [
    { key: 'src', label: '소스', kind: 'opt', options: SRC },
    n('rate', '재생속도(LFSR 음높이)', 0.1, 4, 0.01, '×'),
    { key: 'filter', label: '필터', kind: 'opt', options: FILT },
    n('freq', '주파수', 40, 12000, 10, 'Hz'),
    n('q', 'Q', 0.3, 30, 0.1),
    n('gain', '게인', 0, 0.3, 0.001),
    n('tremRate', '트레몰로 속도', 0, 80, 0.5, 'Hz'),
    n('tremDepth', '트레몰로 깊이', 0, 1, 0.01),
    n('swellRate', '스웰 속도', 0, 2, 0.01, 'Hz'),
    n('swellDepth', '스웰 깊이', 0, 1, 0.01),
    n('gateOn', '게이트 켜짐(0=지속)', 0, 500, 1, 'ms'),
    n('gateOff', '게이트 꺼짐', 0, 500, 1, 'ms'),
    n('gateGroup', '묶음 반복 수', 1, 12, 1),
    n('gateRest', '묶음 뒤 쉼', 0, 5000, 10, 'ms'),
  ],
  bell: [
    n('freqMin', '기음 최소', 100, 4000, 10, 'Hz'),
    n('freqMax', '기음 최대', 100, 4000, 10, 'Hz'),
    n('p2', '2번째 부분음 배수', 1.2, 8, 0.01, '×'),
    n('p3', '3번째 부분음 배수', 1.2, 12, 0.01, '×'),
    n('decay', '감쇠', 0.1, 6, 0.05, 's'),
    n('vol', '음량', 0, 0.3, 0.005),
    n('everyMin', '간격 최소', 200, 40000, 100, 'ms'),
    n('everyMax', '간격 최대', 200, 40000, 100, 'ms'),
    { key: 'scale', label: '음계 스냅', kind: 'bool' },
  ],
  drone: [
    { key: 'wave', label: '파형', kind: 'opt', options: WAVE },
    n('duty', '듀티비(pulse)', 0.05, 0.5, 0.005),
    n('freq', '주파수', 20, 2000, 1, 'Hz'),
    n('gain', '게인', 0, 0.2, 0.001),
    n('lfoRate', 'LFO 속도', 0, 30, 0.1, 'Hz'),
    n('lfoDepth', 'LFO 깊이(비율)', 0, 1, 0.01),
    { key: 'lfoTarget', label: 'LFO 대상', kind: 'opt', options: TGT },
  ],
};

// ── 레이어 테이블 ────────────────────────────────────────────────

/** 어느 축으로 만들 소리인지 — 튜닝 페이지의 분류이자 작업 목록 */
export type Track = '노이즈' | '칩튠' | '녹음';

export type Status = '기존' | '전환' | '신규';

export interface LayerDef {
  id: string;
  name: string;
  track: Track;
  status: Status;
  /** 어떤 상황에서 울리는가 (deriveLayers 연결은 별도 작업) */
  trigger: string;
  note?: string;
  models: Model[];
}

// 자주 쓰는 기본값 — 반복을 줄이되 값 자체는 각 레이어에서 다 보이게 둔다
const bed = (o: Partial<Bed>): Bed => ({
  kind: 'bed',
  src: 'brown',
  rate: 1,
  filter: 'lowpass',
  freq: 500,
  q: 1,
  gain: 0.04,
  lfoRate: 0,
  lfoDepth: 0,
  lfoTarget: 'gain',
  ...o,
});

const burst = (o: Partial<Burst>): Burst => ({
  kind: 'burst',
  src: 'white',
  filter: 'bandpass',
  freq: 2000,
  q: 1,
  altFreq: 0,
  durMin: 0.05,
  durMax: 0.05,
  volMin: 0.06,
  volMax: 0.06,
  attack: 0.01,
  everyMin: 1000,
  everyMax: 3000,
  countMin: 1,
  countMax: 1,
  spacingMin: 120,
  spacingMax: 160,
  grid: false,
  ...o,
});

const chirp = (o: Partial<Chirp>): Chirp => ({
  kind: 'chirp',
  wave: 'pulse',
  duty: 0.125,
  freqMin: 2200,
  freqMax: 3800,
  sweep: 0.95,
  dur: 0.09,
  volMin: 0.03,
  volMax: 0.05,
  attack: 0.01,
  notesMin: 2,
  notesMax: 4,
  spacingMin: 90,
  spacingMax: 150,
  detune: 0.2,
  everyMin: 2800,
  everyMax: 9000,
  scale: true,
  grid: true,
  ...o,
});

const tone = (o: Partial<Tone>): Tone => ({
  kind: 'tone',
  wave: 'sine',
  duty: 0.5,
  freqMin: 180,
  freqMax: 420,
  ramp: 1.6,
  rampTime: 0.06,
  dur: 0.08,
  vol: 0.035,
  attack: 0.015,
  everyMin: 350,
  everyMax: 1100,
  grid: false,
  ...o,
});

const buzz = (o: Partial<Buzz>): Buzz => ({
  kind: 'buzz',
  src: 'white',
  rate: 1,
  filter: 'bandpass',
  freq: 5300,
  q: 2.4,
  gain: 0.02,
  tremRate: 0,
  tremDepth: 0,
  swellRate: 0,
  swellDepth: 0,
  gateOn: 0,
  gateOff: 0,
  gateGroup: 1,
  gateRest: 0,
  ...o,
});

const bell = (o: Partial<Bell>): Bell => ({
  kind: 'bell',
  freqMin: 700,
  freqMax: 1400,
  // 원형 막대의 굽힘 모드 — 1 : 2.76 : 5.40. 정수배가 아니라서 '금속'으로 들린다
  p2: 2.76,
  p3: 5.4,
  decay: 2.2,
  vol: 0.05,
  everyMin: 3000,
  everyMax: 14000,
  scale: true,
  ...o,
});

/**
 * 전체 레이어. 기존 13종은 synths.ts의 값을 그대로 옮겼다(소리 변화 없음).
 * bandpass는 원래 [저, 고] 대역으로 적혀 있었고 중심=(저+고)/2, Q=중심/폭 이었으므로
 * 그 계산 결과를 숫자로 박아 둔다.
 */
export const LAYERS: readonly LayerDef[] = [
  // ── 기존 (게임에서 이미 울리는 것) ──
  {
    id: 'roomBase',
    name: '방 안의 공기',
    track: '노이즈',
    status: '기존',
    trigger: '실내 상시',
    note: '청취 절충: pink + lp1500 — 2500은 귀가 가장 민감한 대역에 히스가 걸려 쏘았다. 마스킹은 조금 줄고 편안함이 는다',
    models: [bed({ src: 'pink', freq: 1500, gain: 0.042 })],
  },
  {
    id: 'fireplace',
    name: '벽난로 타닥임',
    track: '녹음',
    status: '기존',
    trigger: 'fireplace 보유 + 실내',
    note: '녹음으로 교체 예정(todo #5). 이 합성본은 다운로드 전 fallback',
    models: [
      bed({ src: 'brown', freq: 260, gain: 0.03 }),
      burst({
        freq: 2700,
        q: 0.9,
        durMin: 0.03,
        durMax: 0.08,
        volMin: 0.06,
        volMax: 0.16,
        attack: 0.004,
        everyMin: 180,
        everyMax: 900,
      }),
    ],
  },
  {
    id: 'footsteps',
    name: '발소리',
    track: '노이즈',
    status: '기존',
    trigger: 'walk',
    note: '녹음/칩튠 결정 대기(todo #11). grid를 켜보면 칩튠 쪽 감이 온다',
    models: [
      burst({
        filter: 'lowpass',
        freq: 220,
        altFreq: 260,
        durMin: 0.09,
        durMax: 0.09,
        volMin: 0.2,
        volMax: 0.2,
        attack: 0.004,
        everyMin: 620,
        everyMax: 780,
      }),
    ],
  },
  {
    id: 'birdsWind',
    name: '새와 바람 (합본)',
    track: '노이즈',
    status: '기존',
    trigger: 'walk / sun',
    note: '게임이 지금 쓰는 합본. 아래 birds·wind가 분리안이다',
    models: [
      bed({ freq: 420, gain: 0.035, lfoRate: 0.09, lfoDepth: 0.51 }),
      chirp({ wave: 'sine', scale: false, grid: false }),
    ],
  },
  {
    id: 'pageTurn',
    name: '책장 넘기는 소리',
    track: '녹음',
    status: '기존',
    trigger: 'read',
    note: '종이 섬유는 합성이 어렵다 — 녹음 예정(todo #8)',
    models: [
      burst({
        freq: 2050,
        q: 0.89,
        durMin: 0.22,
        durMax: 0.22,
        volMin: 0.06,
        volMax: 0.06,
        attack: 0.05,
        everyMin: 9000,
        everyMax: 22000,
      }),
    ],
  },
  {
    id: 'pageWriting',
    name: '연필과 종이',
    track: '노이즈',
    status: '기존',
    trigger: 'free + desk',
    note: '청취 피드백 "빗자루 같다" 반영 확정 — 대역을 올리고 좁히고 음량을 낮춰 긁힘으로',
    models: [
      burst({
        freq: 5200,
        q: 2.2,
        durMin: 0.18,
        durMax: 0.5,
        volMin: 0.016,
        volMax: 0.024,
        attack: 0.06,
        everyMin: 900,
        everyMax: 3200,
      }),
      burst({
        freq: 2050,
        q: 0.89,
        durMin: 0.22,
        durMax: 0.22,
        volMin: 0.07,
        volMax: 0.07,
        attack: 0.05,
        everyMin: 14000,
        everyMax: 30000,
      }),
    ],
  },
  {
    id: 'blanket',
    name: '담요 스치는 소리',
    track: '노이즈',
    status: '기존',
    trigger: 'read + blanket',
    note: '이 음량대는 녹음하면 노이즈 플로어가 소리보다 크다 — 합성이 유일한 답',
    models: [
      burst({
        freq: 3500,
        q: 1.03,
        durMin: 0.34,
        durMax: 0.34,
        volMin: 0.03,
        volMax: 0.03,
        attack: 0.14,
        everyMin: 4000,
        everyMax: 9000,
      }),
    ],
  },
  {
    id: 'cooking',
    name: '도마와 냄비',
    track: '칩튠',
    status: '전환',
    trigger: 'cook',
    note: '기포는 이미 오실레이터. 도마 burst의 grid를 켜면 "부엌의 박자"가 된다',
    models: [
      bed({ freq: 340, gain: 0.025 }),
      tone({}),
      burst({
        filter: 'lowpass',
        freq: 900,
        durMin: 0.05,
        durMax: 0.05,
        volMin: 0.11,
        volMax: 0.11,
        attack: 0.003,
        everyMin: 5000,
        everyMax: 12000,
        countMin: 4,
        countMax: 8,
        spacingMin: 120,
        spacingMax: 160,
      }),
    ],
  },
  {
    id: 'sweeping',
    name: '비질',
    track: '노이즈',
    status: '기존',
    trigger: 'chore + broom',
    note: '정체성이 필터 스윕이라 칩튠으로 가면 손해. 왕복 리듬이 동조를 유발해 집중용으로 게인을 낮췄다',
    models: [
      burst({
        freq: 910,
        q: 0.93,
        altFreq: 660,
        durMin: 0.3,
        durMax: 0.3,
        volMin: 0.065,
        volMax: 0.065,
        attack: 0.08,
        everyMin: 640,
        everyMax: 820,
      }),
    ],
  },
  {
    id: 'rainSoft',
    name: '창밖의 비',
    track: '녹음',
    status: '기존',
    trigger: '비/장대비 + 실내',
    note: '녹음 예정(todo #2)',
    models: [bed({ freq: 900, gain: 0.038, lfoRate: 0.05, lfoDepth: 0.27 })],
  },
  {
    id: 'rainHard',
    name: '빗속',
    track: '녹음',
    status: '기존',
    trigger: '비/장대비 + 야외 + 우산 없음',
    note: '녹음 예정(todo #3)',
    models: [
      bed({ src: 'white', freq: 2400, gain: 0.033 }),
      burst({
        freq: 1650,
        q: 0.87,
        durMin: 0.02,
        durMax: 0.05,
        volMin: 0.03,
        volMax: 0.065,
        attack: 0.004,
        everyMin: 90,
        everyMax: 260,
      }),
    ],
  },
  {
    id: 'umbrellaRain',
    name: '우산 위 빗방울',
    track: '녹음',
    status: '기존',
    trigger: '비/장대비 + 야외 + 우산',
    note: '녹음 예정(todo #4)',
    models: [
      bed({ src: 'white', freq: 1400, gain: 0.039 }),
      burst({
        freq: 3500,
        q: 1.03,
        durMin: 0.015,
        durMax: 0.035,
        volMin: 0.05,
        volMax: 0.1,
        attack: 0.003,
        everyMin: 70,
        everyMax: 200,
      }),
    ],
  },
  {
    id: 'cicadas',
    name: '여름 매미',
    track: '칩튠',
    status: '전환',
    trigger: '여름 낮·황혼',
    note: 'LFSR 버즈는 청취에서 불쾌 판정 — white+트레몰로로 되돌림. 집중 중에도 울리므로 질감 레벨(저게인·얕은 트레몰로) 유지',
    models: [
      buzz({
        src: 'white',
        freq: 5300,
        q: 2.4,
        gain: 0.016,
        tremRate: 27,
        tremDepth: 0.25,
        swellRate: 0.06,
        swellDepth: 0.3,
      }),
      burst({
        freq: 6000,
        q: 2.5,
        durMin: 0.8,
        durMax: 1.7,
        volMin: 0.025,
        volMax: 0.025,
        attack: 0.15,
        everyMin: 9000,
        everyMax: 22000,
      }),
    ],
  },

  // ── 분리안 (birdsWind → birds + wind) ──
  {
    id: 'birds',
    name: '새 (분리안)',
    track: '칩튠',
    status: '신규',
    trigger: 'walk / sun',
    note: '청취 피드백 반영 — 12.5% 펄스는 고배음이 쏘아서 triangle로. 배음 몇 개는 남아 sine보다는 또렷하다',
    models: [
      chirp({
        wave: 'triangle',
        freqMin: 1800,
        freqMax: 3200,
        volMin: 0.05,
        volMax: 0.08,
        detune: 0.1,
      }),
    ],
  },
  {
    id: 'wind',
    name: '바람 (분리안)',
    track: '노이즈',
    status: '신규',
    trigger: 'walk / sun / 강풍',
    note: '돌풍 구조 확정 — 청취 피드백 "항상 불어올 리 없다". 잔잔한 바닥 + 이따금 긴 스웰',
    models: [
      bed({ src: 'brown', freq: 420, gain: 0.021 }),
      burst({
        src: 'brown',
        filter: 'lowpass',
        freq: 550,
        durMin: 2.5,
        durMax: 6,
        volMin: 0.025,
        volMax: 0.045,
        attack: 1.4,
        everyMin: 3000,
        everyMax: 12000,
      }),
    ],
  },

  // ── 신규 칩튠 ──
  {
    id: 'crickets',
    name: '귀뚜라미',
    track: '칩튠',
    status: '신규',
    trigger: '여름·가을 밤',
    note: '청취 피드백 "불쾌하다" 반영 — LFSR 게이트 버즈를 버리고 순음 트릴로. 실제 귀뚜라미도 4kHz대 거의 순음이라 이쪽이 실체에도 가깝다',
    models: [
      chirp({
        wave: 'triangle',
        freqMin: 4100,
        freqMax: 4500,
        sweep: 0.98,
        dur: 0.035,
        volMin: 0.05,
        volMax: 0.07,
        attack: 0.008,
        notesMin: 3,
        notesMax: 4,
        spacingMin: 40,
        spacingMax: 55,
        detune: 0.02,
        everyMin: 600,
        everyMax: 1800,
        scale: false,
        grid: false,
      }),
    ],
  },
  {
    id: 'frogs',
    name: '개구리',
    track: '칩튠',
    status: '신규',
    trigger: '봄·여름 밤, 비 온 뒤',
    models: [
      chirp({
        wave: 'triangle',
        freqMin: 180,
        freqMax: 320,
        sweep: 0.85,
        dur: 0.12,
        volMin: 0.05,
        volMax: 0.075,
        notesMin: 2,
        notesMax: 3,
        spacingMin: 110,
        spacingMax: 170,
        detune: 0.15,
        everyMin: 1500,
        everyMax: 5000,
        scale: false,
      }),
    ],
  },
  {
    id: 'dawnBirds',
    name: '새벽 새',
    track: '칩튠',
    status: '신규',
    trigger: 'twilight(아침)',
    note: 'twilight 전용 소리가 하나도 없었다. 펄스 → triangle (청취 피드백)',
    models: [
      chirp({
        wave: 'triangle',
        freqMin: 2400,
        freqMax: 4000,
        sweep: 1.15,
        volMin: 0.05,
        volMax: 0.075,
        notesMin: 3,
        notesMax: 6,
        spacingMin: 70,
        spacingMax: 120,
        everyMin: 1200,
        everyMax: 4000,
      }),
    ],
  },
  {
    id: 'windchime',
    name: '풍경',
    track: '칩튠',
    status: '신규',
    trigger: 'windchime 보유',
    note: '비조화 부분음(1 : 2.76 : 5.40). 측정에서 기준선보다 13dB 컸다 — 음량을 내리고 간격을 벌렸다',
    models: [bell({ vol: 0.02, everyMin: 6000, everyMax: 20000 })],
  },
  {
    id: 'typing',
    name: '타자',
    track: '칩튠',
    status: '신규',
    trigger: 'free + laptop',
    note: '지금 free는 desk만 보고 laptop은 안 본다 — 명백한 구멍',
    models: [
      burst({
        freq: 2600,
        q: 1.6,
        durMin: 0.018,
        durMax: 0.028,
        volMin: 0.09,
        volMax: 0.16,
        attack: 0.002,
        everyMin: 220,
        everyMax: 900,
        countMin: 3,
        countMax: 9,
        spacingMin: 90,
        spacingMax: 160,
        grid: true,
      }),
    ],
  },
  {
    id: 'eaveDrips',
    name: '처마 물방울',
    track: '칩튠',
    status: '신규',
    trigger: '비 그친 뒤 / 눈 녹을 때',
    note: '갇힌 기포의 진동이라 거의 순음. 작은 방울일수록 높다(f₀ ≈ 3.3/R) — 그리고 피치는 상승한다',
    models: [
      tone({
        freqMin: 800,
        freqMax: 2500,
        ramp: 1.5,
        rampTime: 0.04,
        dur: 0.12,
        vol: 0.05,
        attack: 0.004,
        everyMin: 2000,
        everyMax: 6000,
      }),
    ],
  },
  {
    id: 'feederPecks',
    name: '모이통 쪼기',
    track: '칩튠',
    status: '신규',
    trigger: 'birdfeeder 보유',
    models: [
      burst({
        freq: 3800,
        q: 3,
        durMin: 0.012,
        durMax: 0.02,
        volMin: 0.16,
        volMax: 0.22,
        attack: 0.001,
        everyMin: 1800,
        everyMax: 6000,
        countMin: 2,
        countMax: 5,
        spacingMin: 70,
        spacingMax: 130,
      }),
    ],
  },
  {
    id: 'teaClink',
    name: "잔 놓는 '팅'",
    track: '칩튠',
    status: '신규',
    trigger: 'sun + cup/teaset',
    models: [
      bell({
        freqMin: 1600,
        freqMax: 2400,
        p2: 2.4,
        p3: 4.1,
        decay: 0.9,
        vol: 0.028,
        everyMin: 12000,
        everyMax: 30000,
        scale: false,
      }),
    ],
  },
  // 탄산은 삭제 — 청취 피드백: 탄산이 이렇게 오래 들릴 리 없다. 지속 레이어가 아니라
  // 소다를 '사용'하는 순간의 효과음(sound.ts) 소관이다.
  {
    id: 'mothTaps',
    name: '나방 톡',
    track: '칩튠',
    status: '신규',
    trigger: '밤 + lamp/lanternpost',
    models: [
      burst({
        freq: 1800,
        q: 2,
        durMin: 0.025,
        durMax: 0.04,
        volMin: 0.18,
        volMax: 0.26,
        attack: 0.002,
        everyMin: 4000,
        everyMax: 15000,
        countMin: 1,
        countMax: 3,
        spacingMin: 120,
        spacingMax: 220,
      }),
    ],
  },

  // ── 신규 노이즈 ──
  {
    id: 'fan',
    name: '선풍기',
    track: '노이즈',
    status: '신규',
    trigger: 'fan 보유 + 여름',
    note: '험 배음(55+110Hz) + 공기만. 날개 진폭 변조는 15Hz가 플러터(거칠기) 대역이라 제거',
    models: [
      { kind: 'drone', wave: 'sine', duty: 0.5, freq: 55, gain: 0.008, lfoRate: 0, lfoDepth: 0, lfoTarget: 'gain' },
      { kind: 'drone', wave: 'sine', duty: 0.5, freq: 110, gain: 0.0032, lfoRate: 0, lfoDepth: 0, lfoTarget: 'gain' },
      bed({ src: 'pink', freq: 1400, gain: 0.011 }),
    ],
  },
  {
    id: 'winterDraft',
    name: '겨울 문틈 바람',
    track: '노이즈',
    status: '신규',
    trigger: '겨울',
    note: '청취 피드백 반영 확정 — Q12 휘슬은 피치라 실격, Q3으로 낮춰 "바람 기색"만',
    models: [
      bed({
        src: 'white',
        filter: 'bandpass',
        freq: 700,
        q: 3,
        gain: 0.09,
        lfoRate: 0.07,
        lfoDepth: 0.15,
        lfoTarget: 'filter',
      }),
    ],
  },
  {
    id: 'teaPour',
    name: '차 따르는 음정',
    track: '노이즈',
    status: '신규',
    trigger: 'sun + cup',
    note: '물줄기는 녹음(todo #9), 잔이 채워지며 음정이 올라가는 부분만 합성',
    models: [
      tone({
        freqMin: 300,
        freqMax: 500,
        ramp: 2.2,
        rampTime: 1.4,
        dur: 1.6,
        vol: 0.032,
        attack: 0.15,
        everyMin: 9000,
        everyMax: 20000,
      }),
    ],
  },
  {
    id: 'snowHush',
    name: '눈 오는 날의 고요',
    track: '녹음',
    status: '신규',
    trigger: 'weather = snow',
    note: '눈에 흡음된 환경음이라 녹음이 맞다(todo #6). 이건 대략적인 근사치일 뿐',
    models: [bed({ src: 'pink', freq: 700, gain: 0.039 })],
  },

];

export function findLayer(id: string): LayerDef | undefined {
  return LAYERS.find((l) => l.id === id);
}

/** 깊은 복사 — 튜닝 페이지가 원본 테이블을 건드리지 않도록 */
export function cloneModels(models: readonly Model[]): Model[] {
  return models.map((m) => ({ ...m }) as Model);
}
