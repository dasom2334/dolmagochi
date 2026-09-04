/**
 * 레이어 재생 진입점 (M9) — 에셋 0MB 정책.
 *
 * 합성 파라미터는 params.ts(데이터), 합성 자체는 models.ts(엔진)로 옮겼다.
 * 여기는 게임(engine.ts)이 부르는 얇은 껍데기만 남는다 — 튜닝 페이지와
 * 게임이 같은 테이블·같은 엔진을 쓰게 하려는 것이 목적이다.
 */
import type { LayerId } from './layers';
import { startModels, type LayerHandle } from './models';
import { findLayer } from './params';

export type { LayerHandle };

/** 레이어 시작 — 핸들의 stop()으로 정리. 정의가 없으면 무음 핸들. */
export function startLayer(
  ctx: AudioContext,
  layer: LayerId,
  out: GainNode,
): LayerHandle {
  const def = findLayer(layer);
  if (!def) return { stop() {} };
  try {
    return startModels(ctx, def.models, out);
  } catch {
    return { stop() {} };
  }
}
