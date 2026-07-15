/**
 * UI 효과음 — Web Audio로 즉석 합성(에셋 파일 없음). 칩튠 질감.
 * 브라우저 자동재생 정책상 AudioContext는 첫 사용자 제스처에서 깨어난다(playSound 내부에서 lazy).
 * 미지원/비활성/컨텍스트 실패 시 조용히 무시한다.
 */

export type SoundName =
  | 'click'
  | 'toggleOn'
  | 'toggleOff'
  | 'confirm'
  | 'rest'
  | 'talk';

let ctx: AudioContext | null = null;
let enabled = true;

type ACtor = typeof AudioContext;

function audioCtor(): ACtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: ACtor;
    webkitAudioContext?: ACtor;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

/** 효과음 on/off — 설정과 동기화. off면 이후 playSound가 무음. */
export function setSoundEnabled(on: boolean): void {
  enabled = on;
}

/** 사용자 제스처에서 오디오 컨텍스트를 준비/재개. 실패는 무시. */
function ensureCtx(): AudioContext | null {
  const Ctor = audioCtor();
  if (!Ctor) return null;
  try {
    if (!ctx) ctx = new Ctor();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/**
 * 공유 오디오 컨텍스트 접근자 — 효과음과 화이트노이즈가 같은 컨텍스트를 쓴다.
 * iOS 등에서 첫 사용자 제스처에 호출해 resume되도록 한다.
 */
export function ensureAudioContext(): AudioContext | null {
  return ensureCtx();
}

interface BlipOpts {
  freq: number;
  type?: OscillatorType;
  dur?: number;
  vol?: number;
  glideTo?: number | null;
  delay?: number;
}

function blip(c: AudioContext, o: BlipOpts): void {
  const { freq, type = 'square', dur = 0.06, vol = 0.2, glideTo = null, delay = 0 } = o;
  const t = c.currentTime + delay;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.linearRampToValueAtTime(vol, t + 0.006);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.03);
}

function bell(c: AudioContext, freq: number, dur = 0.75, vol = 0.22): void {
  const t = c.currentTime;
  const partials: [number, number][] = [
    [freq, vol],
    [freq * 2, vol * 0.4],
    [freq * 3.01, vol * 0.16],
  ];
  for (const [f, v] of partials) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.linearRampToValueAtTime(v, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

const VOICES: Record<SoundName, (c: AudioContext) => void> = {
  click: (c) => blip(c, { freq: 1500, type: 'square', dur: 0.035, vol: 0.14 }),
  toggleOn: (c) => {
    blip(c, { freq: 660, type: 'square', dur: 0.05, vol: 0.14 });
    blip(c, { freq: 990, type: 'square', dur: 0.08, vol: 0.14, delay: 0.06 });
  },
  toggleOff: (c) => {
    blip(c, { freq: 880, type: 'square', dur: 0.05, vol: 0.14 });
    blip(c, { freq: 520, type: 'square', dur: 0.09, vol: 0.14, delay: 0.06 });
  },
  confirm: (c) => {
    blip(c, { freq: 523, type: 'triangle', dur: 0.07, vol: 0.18 });
    blip(c, { freq: 659, type: 'triangle', dur: 0.07, vol: 0.18, delay: 0.08 });
    blip(c, { freq: 784, type: 'triangle', dur: 0.14, vol: 0.18, delay: 0.16 });
  },
  rest: (c) => bell(c, 784),
  talk: (c) => blip(c, { freq: 620, type: 'triangle', dur: 0.16, vol: 0.18, glideTo: 990 }),
};

/**
 * 효과음 재생. force=true면 enabled 무시(효과음을 '켜는' 순간의 피드백용).
 */
export function playSound(name: SoundName, force = false): void {
  if (!enabled && !force) return;
  const c = ensureCtx();
  if (!c) return;
  try {
    VOICES[name](c);
  } catch {
    /* 무시 */
  }
}
