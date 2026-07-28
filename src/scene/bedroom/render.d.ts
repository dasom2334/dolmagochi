/** src/scene/bedroom/render.js 의 타입 선언.
 *  geom.js·geom-art-v3.js 는 design/bedroom 에서 그대로 가져온 원본 .js 다(경로만 수정).
 *  render.js 는 확정본(v3) 경로만 남긴 이식판 — 자세한 차이는 그 파일 머리말에. */
import type { BedroomSceneState } from './types';

/** 상점에서 사기 전까지 없는 소품 — 기본으로 꺼 둘 대상 */
export const SHOP_PROPS: readonly string[];

/**
 * 씬 한 프레임을 canvas 에 그린다.
 * @param canvas  128×72 캔버스 (CSS 로 정수배 확대할 것)
 * @param st      씬 상태
 * @param layerOff 끌 레이어 id 집합
 * @param t       ms — 김·선풍기 애니메이션과 팔레트 전환(.6s)에 쓰인다
 */
export function render(
  canvas: HTMLCanvasElement,
  st: BedroomSceneState,
  layerOff?: ReadonlySet<string>,
  t?: number,
): void;
