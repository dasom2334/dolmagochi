/** design/livingroom/scene/render.js 의 타입 선언.
 *  씬 모듈은 design 워크트리에서 그대로 가져온 **원본 .js** 다 — 손대지 않는다.
 *  (v3.html 미리보기와 앱이 같은 파일을 쓰게 해서 둘이 갈라지는 걸 막는다.) */
import type { SceneState } from './types';

/** 상점에서 사기 전까지 없는 소품 — 기본으로 꺼 둘 대상 */
export const SHOP_PROPS: readonly string[];

/**
 * 씬 한 프레임을 canvas 에 그린다.
 * @param canvas  128×72 캔버스 (CSS 로 정수배 확대할 것)
 * @param st      씬 상태
 * @param layerOff 끌 레이어 id 집합
 * @param t       ms — 애니메이션·팔레트 전환(.6s)에 쓰인다
 */
export function render(
  canvas: HTMLCanvasElement,
  st: SceneState,
  layerOff?: ReadonlySet<string>,
  t?: number,
): void;
