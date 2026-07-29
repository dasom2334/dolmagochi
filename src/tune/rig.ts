/**
 * 튜닝 페이지 전용 오디오 리그 — 게임의 engine.ts와 별개로,
 * 아무 레이어나 골라 동시에 울릴 수 있는 단순한 믹서.
 *
 * 그래프: 레이어들 → master → fog(lowpass) → analyser → destination
 * fog는 안개 연출 실험용 전역 저역통과다 (안개는 소리를 더하는 게 아니라 먹는 것).
 * analyser는 레벨 미터용 — 레이어끼리 상대 음량을 맞추려면 귀만으로는 부족하다.
 */
import { startModels, type LayerHandle, type SynthOpts } from '../audio/models';
import type { Model } from '../audio/params';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let fog: BiquadFilterNode | null = null;
let analyser: AnalyserNode | null = null;
let scratch: Float32Array<ArrayBuffer> | null = null;
const handles = new Map<string, LayerHandle>();

type ACtor = typeof AudioContext;

/** 첫 사용자 제스처에서 호출 — 자동재생 정책상 그 전에는 소리가 안 난다 */
export function ensure(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    AudioContext?: ACtor;
    webkitAudioContext?: ACtor;
  };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctor) return null;
  try {
    if (!ctx) {
      ctx = new Ctor();
      master = ctx.createGain();
      master.gain.value = 0.8;
      fog = ctx.createBiquadFilter();
      fog.type = 'lowpass';
      fog.frequency.value = 20000;
      analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      scratch = new Float32Array(analyser.fftSize);
      master.connect(fog).connect(analyser).connect(ctx.destination);
    }
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

export function setMasterGain(v: number): void {
  if (master) master.gain.value = v;
}

/** 20000이면 사실상 통과 = 안개 없음 */
export function setFogCutoff(hz: number): void {
  if (fog) fog.frequency.value = hz;
}

export function play(id: string, models: readonly Model[], opts: SynthOpts): void {
  const c = ensure();
  if (!c || !master) return;
  stop(id);
  try {
    handles.set(id, startModels(c, models, master, opts));
  } catch {
    /* 무시 */
  }
}

export function stop(id: string): void {
  const h = handles.get(id);
  if (!h) return;
  h.stop();
  handles.delete(id);
}

export function stopAll(): void {
  for (const [, h] of handles) h.stop();
  handles.clear();
}

/**
 * 현재 출력 레벨(dBFS). 조용하면 -Infinity 대신 -90을 돌려준다.
 * RMS = √(평균 x²)로 재고, dB = 20·log₁₀(RMS) — x는 −1~1 사이의 샘플값.
 */
export function level(): number {
  if (!analyser || !scratch) return -90;
  analyser.getFloatTimeDomainData(scratch);
  let sum = 0;
  for (let i = 0; i < scratch.length; i++) sum += scratch[i] * scratch[i];
  const rms = Math.sqrt(sum / scratch.length);
  return rms <= 0 ? -90 : Math.max(-90, 20 * Math.log10(rms));
}
