/**
 * 침실 씬 — src/scene/bedroom 의 canvas 렌더러를 그대로 띄운다.
 * 구조는 LivingRoomScene 과 같다: 128×72 로 그리고 CSS 로 확대(픽셀 격자 유지),
 * 루프는 애니메이션이 꺼져 있어도 돈다(팔레트 전환 .6s 가 계속 보여야 한다).
 */
import { useEffect, useRef, useState } from 'react';
import { render } from '../../scene/bedroom/render.js';
import { reduceMotion } from '../../scene/livingroom/anim.js';
import type { BedroomSceneState } from '../../scene/bedroom/types';

/** 렌더러가 그리는 논리 해상도 — render.js 의 GX/GY 와 같아야 한다 */
const GX = 128;
const GY = 72;

/** 눌러서 반응하는 자리. 좌표는 씬 그룹의 bbox 를 잰 값이다.
 *  씬 지오메트리가 바뀌면 여기도 어긋나므로, 그룹을 옮기면 같이 고쳐야 한다. */
export type BedroomHotspotId = 'window' | 'lamp';
const HOTSPOTS: Record<BedroomHotspotId, { x: number; y: number; w: number; h: number }> = {
  window: { x: 22, y: 7, w: 33, h: 25 },  // 유리 개구부 (glass.js BD_GLASS 의 외곽)
  lamp: { x: 49, y: 21, w: 7, h: 14 },    // 책상 스탠드 (geom.js lampArt: 갓~받침)
};

/** 클릭 좌표 → 눌린 자리. 캔버스는 CSS 로 확대돼 있으니 화면 크기로 나눈다 */
function hotspotAt(
  cv: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  enabled: ReadonlySet<BedroomHotspotId>,
): BedroomHotspotId | null {
  const r = cv.getBoundingClientRect();
  // 레이아웃 전이거나 탭이 가려져 있으면 rect 가 0×0 — 나누면 NaN 이라 조용히 죽는다
  if (!r.width || !r.height) return null;
  const x = ((clientX - r.left) / r.width) * GX;
  const y = ((clientY - r.top) / r.height) * GY;
  const ids = [...enabled].sort(
    (a, b) => HOTSPOTS[a].w * HOTSPOTS[a].h - HOTSPOTS[b].w * HOTSPOTS[b].h,
  );
  for (const id of ids) {
    const h = HOTSPOTS[id];
    if (x >= h.x && x < h.x + h.w && y >= h.y && y < h.y + h.h) return id;
  }
  return null;
}

export function BedroomScene({
  scene,
  off,
  hotspots,
  onHotspot,
}: {
  scene: BedroomSceneState;
  /** 끌 레이어. 안 주면 전부 켜진다 */
  off?: ReadonlySet<string>;
  /** 지금 누를 수 있는 자리. 없는 소품(안 산 스탠드 등)은 빼서 넘긴다 */
  hotspots?: ReadonlySet<BedroomHotspotId>;
  onHotspot?: (id: BedroomHotspotId) => void;
}) {
  const enabled = hotspots ?? new Set<BedroomHotspotId>();
  const cvRef = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<BedroomHotspotId | null>(null);
  // 매 프레임 최신 값을 읽어야 하므로 ref 로 넘긴다 — 상태가 바뀔 때마다
  // rAF 를 다시 걸면 전환 애니메이션이 처음부터 다시 시작한다.
  const sceneRef = useRef(scene);
  const offRef = useRef(off);
  sceneRef.current = scene;
  offRef.current = off;

  // 루프 시작 시각 — 즉시 그리기와 루프가 같은 t 를 써야 전환이 안 튄다
  const t0Ref = useRef(0);

  const draw = (nowMs: number) => {
    const cv = cvRef.current;
    if (!cv) return;
    const layerOff = new Set<string>(offRef.current ?? []);
    if (reduceMotion()) layerOff.add('anim');
    render(cv, sceneRef.current, layerOff, nowMs - t0Ref.current);
  };

  useEffect(() => {
    t0Ref.current = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      draw(now);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 상태가 바뀌면 **그 자리에서** 한 번 그린다 — rAF 는 탭이 가려져 있으면 안 돈다
  // (LivingRoomScene 과 같은 이유: 탭 이탈 중 방을 바꾸고 돌아오는 일이 실제로 있다)
  useEffect(() => {
    draw(performance.now());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene, off]);

  return (
    <canvas
      ref={cvRef}
      width={GX}
      height={GY}
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        display: 'block',
        imageRendering: 'pixelated',
        cursor: hover ? 'pointer' : 'default',
      }}
      onMouseMove={(e) => {
        const cv = cvRef.current;
        if (cv) setHover(hotspotAt(cv, e.clientX, e.clientY, enabled));
      }}
      onMouseLeave={() => setHover(null)}
      onClick={(e) => {
        const cv = cvRef.current;
        if (!cv || !onHotspot) return;
        const id = hotspotAt(cv, e.clientX, e.clientY, enabled);
        if (id) onHotspot(id);
      }}
    />
  );
}
