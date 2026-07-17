/**
 * 레이어드 사운드 엔진 (M9) — 원하는 레이어 셋과 현재 재생분을 diff해
 * 시작/정지한다. 마스터는 기존 noiseOn, 레이어별 음소거는 settings.noiseMuted.
 * AudioContext는 효과음(sound.ts)과 공유 — iOS 언락 경로 재사용.
 */
import { ensureAudioContext } from '../sound';
import type { LayerId } from './layers';
import { startLayer, type LayerHandle } from './synths';

const active = new Map<LayerId, LayerHandle>();
let master: GainNode | null = null;

function ensureMaster(ctx: AudioContext): GainNode {
  if (!master) {
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);
  }
  return master;
}

/**
 * 소리풍경 동기화 — 호출 시점의 상황으로 수렴시킨다 (멱등).
 * on=false면 전부 정지. muted 레이어는 시작하지 않고, 재생 중이면 정지.
 */
export function syncSoundscape(opts: {
  on: boolean;
  layers: readonly LayerId[];
  muted: readonly string[];
}): void {
  const wanted = opts.on
    ? new Set(opts.layers.filter((l) => !opts.muted.includes(l)))
    : new Set<LayerId>();

  for (const [layer, handle] of active) {
    if (!wanted.has(layer)) {
      handle.stop();
      active.delete(layer);
    }
  }
  if (wanted.size === 0) return;

  const ctx = ensureAudioContext();
  if (!ctx) return;
  const out = ensureMaster(ctx);
  for (const layer of wanted) {
    if (!active.has(layer)) active.set(layer, startLayer(ctx, layer, out));
  }
}

/** 전체 정지 (언마운트 등) */
export function stopSoundscape(): void {
  for (const [, handle] of active) handle.stop();
  active.clear();
}
