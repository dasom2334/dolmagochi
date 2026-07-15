import { ensureAudioContext } from '../sound';

/**
 * 화이트노이즈(사실은 브라운노이즈) 앰비언트 — 디자인 데모 이식.
 * 브라운노이즈 생성 + lowpass 500Hz + gain 0.05, 루프. 효과음과 오디오 컨텍스트 공유.
 * 미지원/실패 시 조용히 무시.
 */
let source: AudioBufferSourceNode | null = null;

function makeBrownNoise(ctx: AudioContext, seconds = 2): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.5; // 브라운노이즈는 저역 편중이라 게인 보정
  }
  return buffer;
}

export function startWhiteNoise(): void {
  if (source) return; // 이미 재생 중
  const ctx = ensureAudioContext();
  if (!ctx) return;
  try {
    const src = ctx.createBufferSource();
    src.buffer = makeBrownNoise(ctx);
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    const gain = ctx.createGain();
    gain.gain.value = 0.05;
    src.connect(lp).connect(gain).connect(ctx.destination);
    src.start();
    source = src;
  } catch {
    /* 무시 */
  }
}

export function stopWhiteNoise(): void {
  if (!source) return;
  try {
    source.stop();
    source.disconnect();
  } catch {
    /* 무시 */
  }
  source = null;
}
