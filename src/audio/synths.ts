/**
 * 레이어별 프로시저럴 합성기 (M9) — 에셋 0MB 정책.
 * 전부 노이즈 셰이핑 + 필터 + 엔벨로프. 지속음은 루프 버퍼, 이벤트성 소리는
 * setTimeout 체인으로 랜덤 간격 원샷(앰비언트라 샘플 정밀도 불요).
 * 실패/미지원은 조용히 무시 — 게임 로직과 완전 분리.
 */
import type { LayerId } from './layers';

export interface LayerHandle {
  stop(): void;
}

/**
 * 공용 화이트노이즈 버퍼 — 컨텍스트당 1개를 만들어 재사용한다.
 * noiseBurst가 발소리·비질처럼 ~0.7초 간격으로 도는 레이어에서 호출마다
 * 새 AudioBuffer를 만들면 모바일 장시간 세션에서 GC 압박이 된다.
 * 노이즈라 같은 버퍼를 재사용해도 청감 차이가 없다 (리뷰 반영).
 */
const sharedWhite = new WeakMap<AudioContext, AudioBuffer>();

function whiteBuffer(ctx: AudioContext): AudioBuffer {
  const cached = sharedWhite.get(ctx);
  if (cached) return cached;
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  sharedWhite.set(ctx, buf);
  return buf;
}

function brownBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    d[i] = last * 3.5; // 저역 편중 게인 보정
  }
  return buf;
}

interface Ambience {
  ctx: AudioContext;
  out: GainNode;
  nodes: AudioNode[];
  timers: ReturnType<typeof setTimeout>[];
  stopped: boolean;
}

function ambience(ctx: AudioContext, out: GainNode): Ambience {
  return { ctx, out, nodes: [], timers: [], stopped: false };
}

function finish(a: Ambience): LayerHandle {
  return {
    stop() {
      a.stopped = true;
      for (const t of a.timers) clearTimeout(t);
      for (const n of a.nodes) {
        try {
          if (n instanceof AudioBufferSourceNode || n instanceof OscillatorNode)
            n.stop();
          n.disconnect();
        } catch {
          /* 무시 */
        }
      }
    },
  };
}

/** 지속 노이즈 루프: buffer → (bandpass?) lowpass → gain → out */
function noiseLoop(
  a: Ambience,
  buf: AudioBuffer,
  opts: { lowpass?: number; bandpass?: [number, number]; gain: number },
): GainNode {
  const src = a.ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  let node: AudioNode = src;
  if (opts.bandpass) {
    const bp = a.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = (opts.bandpass[0] + opts.bandpass[1]) / 2;
    bp.Q.value =
      bp.frequency.value / Math.max(1, opts.bandpass[1] - opts.bandpass[0]);
    node.connect(bp);
    node = bp;
    a.nodes.push(bp);
  }
  if (opts.lowpass) {
    const lp = a.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = opts.lowpass;
    node.connect(lp);
    node = lp;
    a.nodes.push(lp);
  }
  const g = a.ctx.createGain();
  g.gain.value = opts.gain;
  node.connect(g).connect(a.out);
  src.start();
  a.nodes.push(src, g);
  return g;
}

/** 노이즈 원샷: 필터 대역 + 엔벨로프 (attack/decay 초) */
function noiseBurst(
  a: Ambience,
  opts: {
    band: [number, number];
    dur: number;
    vol: number;
    attack?: number;
    lowpass?: boolean;
  },
): void {
  if (a.stopped) return;
  try {
    const { band, dur, vol, attack = 0.01 } = opts;
    const src = a.ctx.createBufferSource();
    src.buffer = whiteBuffer(a.ctx); // 공용 2초 버퍼 — dur에서 stop으로 잘라 쓴다
    const f = a.ctx.createBiquadFilter();
    if (opts.lowpass) {
      f.type = 'lowpass';
      f.frequency.value = band[1];
    } else {
      f.type = 'bandpass';
      f.frequency.value = (band[0] + band[1]) / 2;
      f.Q.value = f.frequency.value / Math.max(1, band[1] - band[0]);
    }
    const g = a.ctx.createGain();
    const t = a.ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(a.out);
    src.start(t);
    src.stop(t + dur + 0.05);
  } catch {
    /* 무시 */
  }
}

/** 랜덤 간격 반복 스케줄러 */
function every(
  a: Ambience,
  minMs: number,
  maxMs: number,
  fire: () => void,
): void {
  const next = () => {
    if (a.stopped) return;
    const delay = minMs + Math.random() * (maxMs - minMs);
    const id = setTimeout(() => {
      if (a.stopped) return;
      fire();
      next();
    }, delay);
    a.timers.push(id);
  };
  next();
}

// ── 레이어별 합성 ──────────────────────────────────────────────

function roomBase(a: Ambience): void {
  // 기존 화이트노이즈(브라운) 계승 — lowpass 500, 잔잔한 바닥음
  noiseLoop(a, brownBuffer(a.ctx), { lowpass: 500, gain: 0.05 });
}

function fireplace(a: Ambience): void {
  // 바닥 화염음(저역 노이즈) + 불규칙한 탁탁 팝
  noiseLoop(a, brownBuffer(a.ctx), { lowpass: 260, gain: 0.03 });
  every(a, 180, 900, () =>
    noiseBurst(a, {
      band: [1200, 4200],
      dur: 0.03 + Math.random() * 0.05,
      vol: 0.06 + Math.random() * 0.1,
      attack: 0.002,
    }),
  );
}

function footsteps(a: Ambience): void {
  // 흙길 발소리 — 둔탁한 저역 스텝, 좌우 발 미세 변화
  let leftFoot = true;
  every(a, 620, 780, () => {
    noiseBurst(a, {
      band: [60, leftFoot ? 220 : 260],
      dur: 0.09,
      vol: 0.16,
      attack: 0.004,
      lowpass: true,
    });
    leftFoot = !leftFoot;
  });
}

function birdsWind(a: Ambience): void {
  // 바람: 저역 노이즈에 느린 LFO 스웰
  const g = noiseLoop(a, brownBuffer(a.ctx), { lowpass: 420, gain: 0.035 });
  try {
    const lfo = a.ctx.createOscillator();
    const lfoGain = a.ctx.createGain();
    lfo.frequency.value = 0.09;
    lfoGain.gain.value = 0.018;
    lfo.connect(lfoGain).connect(g.gain);
    lfo.start();
    a.nodes.push(lfo, lfoGain);
  } catch {
    /* 무시 */
  }
  // 새: 이따금 2~4음 지저귐 (사인 글라이드 블립)
  every(a, 2800, 9000, () => {
    if (a.stopped) return;
    const notes = 2 + Math.floor(Math.random() * 3);
    const base = 2200 + Math.random() * 1600;
    for (let i = 0; i < notes; i++) {
      try {
        const t = a.ctx.currentTime + i * (0.09 + Math.random() * 0.06);
        const osc = a.ctx.createOscillator();
        const g2 = a.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), t);
        osc.frequency.exponentialRampToValueAtTime(
          base * (0.8 + Math.random() * 0.5),
          t + 0.07,
        );
        g2.gain.setValueAtTime(0.0001, t);
        g2.gain.linearRampToValueAtTime(0.03 + Math.random() * 0.02, t + 0.01);
        g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
        osc.connect(g2).connect(a.out);
        osc.start(t);
        osc.stop(t + 0.12);
      } catch {
        /* 무시 */
      }
    }
  });
}

function pageTurn(a: Ambience): void {
  // 책장 넘김 — 드문 종이 스치는 스위시
  every(a, 9000, 22000, () =>
    noiseBurst(a, { band: [900, 3200], dur: 0.22, vol: 0.08, attack: 0.05 }),
  );
}

function pageWriting(a: Ambience): void {
  // 페이지 + 필기 — 잦은 짧은 연필 긁힘, 가끔 종이
  every(a, 900, 3200, () =>
    noiseBurst(a, {
      band: [1800, 5200],
      dur: 0.12 + Math.random() * 0.25,
      vol: 0.035,
      attack: 0.02,
    }),
  );
  every(a, 14000, 30000, () =>
    noiseBurst(a, { band: [900, 3200], dur: 0.22, vol: 0.07, attack: 0.05 }),
  );
}

function rockingChair(a: Ambience): void {
  // 흔들의자 끼익 — 앞뒤 두 음이 번갈아, 흔들림 주기
  let forth = true;
  every(a, 1150, 1350, () => {
    noiseBurst(a, {
      band: forth ? [320, 620] : [260, 480],
      dur: 0.28,
      vol: 0.05,
      attack: 0.09,
    });
    forth = !forth;
  });
}

function cooking(a: Ambience): void {
  // 보글: 저역 보글거림 루프 + 랜덤 기포 블립, 도마: 이따금 리드미컬한 탁탁
  noiseLoop(a, brownBuffer(a.ctx), { lowpass: 340, gain: 0.025 });
  every(a, 350, 1100, () => {
    try {
      const t = a.ctx.currentTime;
      const osc = a.ctx.createOscillator();
      const g = a.ctx.createGain();
      osc.type = 'sine';
      const f = 180 + Math.random() * 240;
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f * 1.6, t + 0.06);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.035, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
      osc.connect(g).connect(a.out);
      osc.start(t);
      osc.stop(t + 0.1);
    } catch {
      /* 무시 */
    }
  });
  every(a, 5000, 12000, () => {
    const taps = 4 + Math.floor(Math.random() * 5);
    for (let i = 0; i < taps; i++) {
      const id = setTimeout(
        () =>
          noiseBurst(a, {
            band: [120, 900],
            dur: 0.05,
            vol: 0.11,
            attack: 0.003,
            lowpass: true,
          }),
        i * (120 + Math.random() * 40),
      );
      a.timers.push(id);
    }
  });
}

function sweeping(a: Ambience): void {
  // 빗자루 스윕 — 왕복 스위시
  let away = true;
  every(a, 640, 820, () => {
    noiseBurst(a, {
      band: away ? [420, 1400] : [320, 1000],
      dur: 0.3,
      vol: 0.06,
      attack: 0.08,
    });
    away = !away;
  });
}

function rainSoft(a: Ambience): void {
  // 창 너머의 비 — 좁은 대역, 낮은 게인, 느린 스웰
  const g = noiseLoop(a, brownBuffer(a.ctx), { lowpass: 900, gain: 0.03 });
  try {
    const lfo = a.ctx.createOscillator();
    const lg = a.ctx.createGain();
    lfo.frequency.value = 0.05;
    lg.gain.value = 0.008;
    lfo.connect(lg).connect(g.gain);
    lfo.start();
    a.nodes.push(lfo, lg);
  } catch {
    /* 무시 */
  }
}

function rainHard(a: Ambience): void {
  // 빗속 — 넓은 대역 노이즈 + 굵은 빗방울 틱
  noiseLoop(a, whiteBuffer(a.ctx), { lowpass: 2400, gain: 0.045 });
  every(a, 90, 260, () =>
    noiseBurst(a, {
      band: [700, 2600],
      dur: 0.02 + Math.random() * 0.03,
      vol: 0.04 + Math.random() * 0.05,
      attack: 0.002,
    }),
  );
}

function umbrellaRain(a: Ambience): void {
  // 우산 위 빗방울 — 가깝고 높은 톡톡 + 멀리 깔리는 비
  noiseLoop(a, whiteBuffer(a.ctx), { lowpass: 1400, gain: 0.025 });
  every(a, 70, 200, () =>
    noiseBurst(a, {
      band: [1800, 5200],
      dur: 0.015 + Math.random() * 0.02,
      vol: 0.05 + Math.random() * 0.06,
      attack: 0.001,
    }),
  );
}

const SYNTHS: Record<LayerId, (a: Ambience) => void> = {
  roomBase,
  fireplace,
  footsteps,
  birdsWind,
  pageTurn,
  pageWriting,
  rockingChair,
  cooking,
  sweeping,
  rainSoft,
  rainHard,
  umbrellaRain,
};

/** 레이어 시작 — 핸들의 stop()으로 정리. 실패 시 무음 핸들. */
export function startLayer(
  ctx: AudioContext,
  layer: LayerId,
  out: GainNode,
): LayerHandle {
  const a = ambience(ctx, out);
  try {
    SYNTHS[layer](a);
  } catch {
    /* 무시 — 무음 핸들 반환 */
  }
  return finish(a);
}
