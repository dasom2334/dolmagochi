/**
 * 제네릭 합성 엔진 — params.ts의 **데이터**를 읽어 소리를 낸다.
 *
 * 레이어마다 함수를 하나씩 쓰던 것을 모델 7종으로 일반화했다. 새 레이어는
 * 이제 함수가 아니라 테이블 한 줄이고, 튜닝 페이지는 같은 엔진을 그대로 쓴다
 * (코드가 두 벌로 갈라지지 않는다).
 *
 * 실패/미지원은 조용히 무시 — 게임 로직과 완전 분리.
 */
import {
  applyEnv,
  rand,
  randInt,
  setWave,
  snapFrame,
  snapScale,
  sourceBuffer,
} from './dsp';
import type {
  Bed,
  Bell,
  Burst,
  Buzz,
  Chirp,
  Drone,
  Model,
  Tone,
} from './params';

export interface LayerHandle {
  stop(): void;
}

export interface SynthOpts {
  /** 4비트 볼륨 양자화 — 칩튠 서명. 시간 격자는 모델별 grid 플래그 */
  quantVol: boolean;
  /** 음계 스냅의 으뜸음(Hz). BGM이 붙으면 조성에 맞춘다 */
  scaleRoot: number;
}

export const DEFAULT_OPTS: SynthOpts = { quantVol: false, scaleRoot: 261.63 };

/** 시작·정지 클릭음 방지용 페이드 (초) */
const FADE_IN = 0.03;
const FADE_OUT = 0.04;

interface Rig {
  ctx: AudioContext;
  /** 레이어 전용 게인 — 여기서 페이드해야 정지할 때 딱 소리가 안 난다 */
  out: GainNode;
  opts: SynthOpts;
  nodes: AudioNode[];
  /** **대기 중인** 타이머만 담는다 — 끝난 id를 쌓아 두면 장시간 재생에서 무한정 자란다 */
  timers: Set<ReturnType<typeof setTimeout>>;
  stopped: boolean;
}

function later(r: Rig, ms: number, fire: () => void): void {
  const id = setTimeout(() => {
    r.timers.delete(id);
    if (r.stopped) return;
    try {
      fire();
    } catch {
      /* 무시 */
    }
  }, ms);
  r.timers.add(id);
}

/** 랜덤 간격 반복 스케줄러 */
function every(r: Rig, minMs: number, maxMs: number, fire: () => void): void {
  const next = () => {
    if (r.stopped) return;
    later(r, rand(Math.min(minMs, maxMs), Math.max(minMs, maxMs)), () => {
      fire();
      next();
    });
  };
  next();
}

// ── 공용 부품 ────────────────────────────────────────────────────

function makeFilter(
  r: Rig,
  kind: string,
  freq: number,
  q: number,
): BiquadFilterNode | null {
  if (kind === 'none') return null;
  const f = r.ctx.createBiquadFilter();
  f.type = kind as BiquadFilterType;
  f.frequency.value = Math.max(20, freq);
  if (kind === 'bandpass') f.Q.value = Math.max(0.0001, q);
  r.nodes.push(f);
  return f;
}

function loopSource(
  r: Rig,
  src: Bed['src'],
  rate: number,
): AudioBufferSourceNode {
  const node = r.ctx.createBufferSource();
  node.buffer = sourceBuffer(r.ctx, src);
  node.loop = true;
  node.playbackRate.value = Math.max(0.01, rate);
  r.nodes.push(node);
  return node;
}

/**
 * LFO 연결. depth는 비율이라 대상의 현재 값에 곱해 절대량으로 바꾼다
 * (게인 0.03에 깊이 0.5면 ±0.015). 단위가 다른 축을 같은 슬라이더로 만지려면
 * 이렇게 정규화해야 한다.
 */
function attachLfo(
  r: Rig,
  rateHz: number,
  depth: number,
  target: 'gain' | 'filter' | 'pitch',
  refs: { gain?: GainNode; filter?: BiquadFilterNode | null; src?: AudioBufferSourceNode },
  base: { gain: number; freq: number; rate: number },
): void {
  if (rateHz <= 0 || depth <= 0) return;
  const dest =
    target === 'gain'
      ? refs.gain?.gain
      : target === 'filter'
        ? refs.filter?.frequency
        : refs.src?.playbackRate;
  if (!dest) return;
  const amount =
    target === 'gain'
      ? base.gain * depth
      : target === 'filter'
        ? base.freq * depth
        : base.rate * depth;
  const lfo = r.ctx.createOscillator();
  const lg = r.ctx.createGain();
  lfo.frequency.value = rateHz;
  lg.gain.value = amount;
  lfo.connect(lg).connect(dest);
  lfo.start();
  r.nodes.push(lfo, lg);
}

// ── 모델별 렌더러 ────────────────────────────────────────────────

function renderBed(r: Rig, m: Bed): void {
  const src = loopSource(r, m.src, m.rate);
  const filter = makeFilter(r, m.filter, m.freq, m.q);
  const gain = r.ctx.createGain();
  gain.gain.value = m.gain;
  r.nodes.push(gain);
  (filter ? src.connect(filter).connect(gain) : src.connect(gain)).connect(
    r.out,
  );
  attachLfo(
    r,
    m.lfoRate,
    m.lfoDepth,
    m.lfoTarget,
    { gain, filter, src },
    { gain: m.gain, freq: m.freq, rate: m.rate },
  );
  src.start();
}

/** 노이즈 원샷 하나 — 대역 + 엔벨로프 */
function fireBurst(r: Rig, m: Burst, freq: number, at: number): void {
  const dur = rand(m.durMin, m.durMax);
  const t = snapFrame(Math.max(at, r.ctx.currentTime + 0.005), m.grid);
  const node = r.ctx.createBufferSource();
  const buf = sourceBuffer(r.ctx, m.src);
  node.buffer = buf;
  node.loop = true;
  const filter = r.ctx.createBiquadFilter();
  filter.type = (m.filter === 'none' ? 'lowpass' : m.filter) as BiquadFilterType;
  filter.frequency.value = Math.max(20, freq);
  if (m.filter === 'bandpass') filter.Q.value = Math.max(0.0001, m.q);
  const gain = r.ctx.createGain();
  applyEnv(
    gain.gain,
    t,
    rand(m.volMin, m.volMax),
    m.attack,
    dur,
    r.opts.quantVol,
  );
  node.connect(filter).connect(gain).connect(r.out);
  // 시작 지점을 매번 다르게 — 같은 버퍼라도 같은 파형이 반복되지 않는다
  node.start(t, Math.random() * Math.max(0, buf.duration - 0.05));
  node.stop(t + dur + 0.05);
}

function renderBurst(r: Rig, m: Burst): void {
  let alt = false;
  every(r, m.everyMin, m.everyMax, () => {
    const freq = alt && m.altFreq > 0 ? m.altFreq : m.freq;
    alt = !alt;
    const count = randInt(
      Math.min(m.countMin, m.countMax),
      Math.max(m.countMin, m.countMax),
    );
    const now = r.ctx.currentTime + 0.01;
    let offset = 0;
    for (let i = 0; i < count; i++) {
      fireBurst(r, m, freq, now + offset);
      offset += rand(m.spacingMin, m.spacingMax) / 1000;
    }
  });
}

function renderChirp(r: Rig, m: Chirp): void {
  every(r, m.everyMin, m.everyMax, () => {
    const notes = randInt(
      Math.min(m.notesMin, m.notesMax),
      Math.max(m.notesMin, m.notesMax),
    );
    const base = rand(m.freqMin, m.freqMax);
    let offset = 0;
    for (let i = 0; i < notes; i++) {
      const t = snapFrame(r.ctx.currentTime + 0.01 + offset, m.grid);
      offset += rand(m.spacingMin, m.spacingMax) / 1000;
      let f = base * (1 + (Math.random() * 2 - 1) * m.detune);
      if (m.scale) f = snapScale(f, r.opts.scaleRoot);
      const osc = r.ctx.createOscillator();
      setWave(r.ctx, osc, m.wave, m.duty);
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(
        Math.max(20, f * m.sweep),
        t + m.dur,
      );
      const gain = r.ctx.createGain();
      applyEnv(
        gain.gain,
        t,
        rand(m.volMin, m.volMax),
        m.attack,
        m.dur,
        r.opts.quantVol,
      );
      osc.connect(gain).connect(r.out);
      osc.start(t);
      osc.stop(t + m.dur + 0.03);
    }
  });
}

function renderTone(r: Rig, m: Tone): void {
  every(r, m.everyMin, m.everyMax, () => {
    const t = snapFrame(r.ctx.currentTime + 0.01, m.grid);
    const f = rand(m.freqMin, m.freqMax);
    const osc = r.ctx.createOscillator();
    setWave(r.ctx, osc, m.wave, m.duty);
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, f * m.ramp),
      t + m.rampTime,
    );
    const gain = r.ctx.createGain();
    applyEnv(gain.gain, t, m.vol, m.attack, m.dur, r.opts.quantVol);
    osc.connect(gain).connect(r.out);
    osc.start(t);
    osc.stop(t + m.dur + 0.05);
  });
}

function renderBuzz(r: Rig, m: Buzz): void {
  const src = loopSource(r, m.src, m.rate);
  const filter = makeFilter(r, m.filter, m.freq, m.q);
  const gain = r.ctx.createGain();
  r.nodes.push(gain);
  (filter ? src.connect(filter).connect(gain) : src.connect(gain)).connect(
    r.out,
  );

  const gated = m.gateOn > 0;
  gain.gain.value = gated ? 0 : m.gain;

  // 트레몰로(지글거림)와 스웰(무리 전체가 커졌다 작아졌다)은 게인에 더해진다
  attachLfo(r, m.tremRate, m.tremDepth, 'gain', { gain }, { gain: m.gain, freq: m.freq, rate: m.rate });
  attachLfo(r, m.swellRate, m.swellDepth, 'gain', { gain }, { gain: m.gain, freq: m.freq, rate: m.rate });

  src.start();

  if (!gated) return;
  // 게이트 — 켜짐/꺼짐을 gateGroup번 반복하고 gateRest만큼 쉰다.
  // 귀뚜라미의 "찌르르 찌르르 찌르르 …" 트릴이 이 구조다.
  const on = m.gateOn / 1000;
  const off = m.gateOff / 1000;
  const group = Math.max(1, Math.round(m.gateGroup));
  const cycleMs = group * (m.gateOn + m.gateOff) + m.gateRest;
  const cycle = () => {
    if (r.stopped) return;
    const t0 = r.ctx.currentTime + 0.02;
    for (let i = 0; i < group; i++) {
      const t = t0 + i * (on + off);
      gain.gain.setValueAtTime(m.gain, t);
      gain.gain.setValueAtTime(0, t + on);
    }
    later(r, cycleMs, cycle);
  };
  cycle();
}

function renderBell(r: Rig, m: Bell): void {
  every(r, m.everyMin, m.everyMax, () => {
    const t = r.ctx.currentTime + 0.01;
    let f = rand(m.freqMin, m.freqMax);
    if (m.scale) f = snapScale(f, r.opts.scaleRoot);
    const partials: [number, number][] = [
      [f, m.vol],
      [f * m.p2, m.vol * 0.4],
      [f * m.p3, m.vol * 0.16],
    ];
    for (const [pf, pv] of partials) {
      const osc = r.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = pf;
      const gain = r.ctx.createGain();
      applyEnv(gain.gain, t, pv, 0.008, m.decay, r.opts.quantVol);
      osc.connect(gain).connect(r.out);
      osc.start(t);
      osc.stop(t + m.decay + 0.05);
    }
  });
}

function renderDrone(r: Rig, m: Drone): void {
  const osc = r.ctx.createOscillator();
  setWave(r.ctx, osc, m.wave, m.duty);
  osc.frequency.value = m.freq;
  const gain = r.ctx.createGain();
  gain.gain.value = m.gain;
  r.nodes.push(osc, gain);
  osc.connect(gain).connect(r.out);
  if (m.lfoRate > 0 && m.lfoDepth > 0) {
    const dest = m.lfoTarget === 'pitch' ? osc.frequency : gain.gain;
    const amount =
      m.lfoTarget === 'pitch' ? m.freq * m.lfoDepth : m.gain * m.lfoDepth;
    const lfo = r.ctx.createOscillator();
    const lg = r.ctx.createGain();
    lfo.frequency.value = m.lfoRate;
    lg.gain.value = amount;
    lfo.connect(lg).connect(dest);
    lfo.start();
    r.nodes.push(lfo, lg);
  }
  osc.start();
}

function render(r: Rig, m: Model): void {
  switch (m.kind) {
    case 'bed':
      return renderBed(r, m);
    case 'burst':
      return renderBurst(r, m);
    case 'chirp':
      return renderChirp(r, m);
    case 'tone':
      return renderTone(r, m);
    case 'buzz':
      return renderBuzz(r, m);
    case 'bell':
      return renderBell(r, m);
    case 'drone':
      return renderDrone(r, m);
  }
}

// ── 진입점 ───────────────────────────────────────────────────────

/**
 * 모델 목록을 재생하고 정지 핸들을 돌려준다.
 * 정지는 즉시 끊지 않고 40ms 페이드 후 노드를 버린다 — 튜닝 페이지에서
 * 슬라이더를 움직일 때마다 재시작되므로, 안 그러면 딸깍거려서 못 듣는다.
 */
export function startModels(
  ctx: AudioContext,
  models: readonly Model[],
  out: AudioNode,
  opts: SynthOpts = DEFAULT_OPTS,
): LayerHandle {
  const layerGain = ctx.createGain();
  layerGain.connect(out);
  const r: Rig = {
    ctx,
    out: layerGain,
    opts,
    nodes: [],
    timers: new Set(),
    stopped: false,
  };
  const t = ctx.currentTime;
  layerGain.gain.setValueAtTime(0.0001, t);
  layerGain.gain.linearRampToValueAtTime(1, t + FADE_IN);

  for (const m of models) {
    try {
      render(r, m);
    } catch {
      /* 무시 — 나머지 모델은 계속 */
    }
  }

  return {
    stop() {
      if (r.stopped) return;
      r.stopped = true;
      for (const id of r.timers) clearTimeout(id);
      r.timers.clear();
      const now = ctx.currentTime;
      try {
        layerGain.gain.cancelScheduledValues(now);
        layerGain.gain.setValueAtTime(layerGain.gain.value, now);
        layerGain.gain.linearRampToValueAtTime(0.0001, now + FADE_OUT);
      } catch {
        /* 무시 */
      }
      // 페이드가 끝난 뒤에 실제로 버린다
      setTimeout(
        () => {
          for (const node of r.nodes) {
            try {
              if (
                node instanceof AudioBufferSourceNode ||
                node instanceof OscillatorNode
              )
                node.stop();
              node.disconnect();
            } catch {
              /* 무시 */
            }
          }
          try {
            layerGain.disconnect();
          } catch {
            /* 무시 */
          }
        },
        FADE_OUT * 1000 + 40,
      );
    },
  };
}
