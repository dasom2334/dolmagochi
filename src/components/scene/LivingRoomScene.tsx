/**
 * 거실 휴식 씬 — design/livingroom 의 canvas 렌더러를 그대로 띄운다.
 *
 * 씬은 128×72 로 그리고 CSS 로 확대한다(image-rendering: pixelated). 확대를 CSS 에
 * 맡기는 이유는 캔버스를 크게 잡으면 rect 마다 좌표에 배율이 붙어 픽셀 격자가
 * 어긋나기 때문이다 — 렌더러는 정수 좌표만 다루게 두는 게 안전하다.
 *
 * 루프는 애니메이션이 꺼져 있어도 돈다: 팔레트 전환(.6s)이 계속 보여야 한다.
 */
import { useEffect, useRef, useState } from 'react';
import { render } from '../../scene/livingroom/render.js';
import { reduceMotion } from '../../scene/livingroom/anim.js';
import type { SceneState } from '../../scene/livingroom/types';

/** 렌더러가 그리는 논리 해상도 — generate.js 의 GX/GY 와 같아야 한다 */
const GX = 128;
const GY = 72;
/** 유리 구멍 — lights.js 의 GLASS_RECT 와 같아야 한다. 여기를 누르면 창이 열린다 */
const GLASS = { x: 43, y: 4, w: 40, h: 30 };

/** 클릭 좌표를 캔버스 좌표로. 캔버스는 CSS 로 확대돼 있으니 화면 크기로 나눈다 */
function hitGlass(cv: HTMLCanvasElement, clientX: number, clientY: number) {
  const r = cv.getBoundingClientRect();
  // 레이아웃 전이거나 탭이 가려져 있으면 rect 가 0×0 으로 읽힌다 → 나누면 NaN 이라
  // 비교가 조용히 전부 false 가 된다. 눌러도 아무 일이 없어 원인을 찾기 어렵다.
  if (!r.width || !r.height) return false;
  const x = ((clientX - r.left) / r.width) * GX;
  const y = ((clientY - r.top) / r.height) * GY;
  return (
    x >= GLASS.x && x < GLASS.x + GLASS.w && y >= GLASS.y && y < GLASS.y + GLASS.h
  );
}

export function LivingRoomScene({
  scene,
  off,
  onWindowToggle,
}: {
  scene: SceneState;
  /** 끌 레이어. 안 주면 전부 켜진다 */
  off?: ReadonlySet<string>;
  /** 유리를 눌렀을 때. 창문 열림은 아직 게임 축이 아니라 씬 조작이다 */
  onWindowToggle?: () => void;
}) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  // 유리 위에서만 손가락 커서를 띄운다 — 창 말고는 누를 게 없다는 걸 알려야 한다
  const [overGlass, setOverGlass] = useState(false);
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

  // 상태가 바뀌면 **그 자리에서** 한 번 그린다.
  // rAF 는 탭이 가려져 있으면(document.hidden) 아예 안 돈다 — 이 앱은 탭 이탈 시
  // 타이머를 멈추므로 그 상태로 방을 바꾸거나 소품을 사고 돌아오는 일이 실제로 생긴다.
  // 루프에만 맡기면 그동안 화면이 옛 프레임에 멈춰 있다.
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
        cursor: onWindowToggle && overGlass ? 'pointer' : 'default',
      }}
      onMouseMove={(e) => {
        const cv = cvRef.current;
        if (cv && onWindowToggle) setOverGlass(hitGlass(cv, e.clientX, e.clientY));
      }}
      onMouseLeave={() => setOverGlass(false)}
      onClick={(e) => {
        const cv = cvRef.current;
        if (cv && onWindowToggle && hitGlass(cv, e.clientX, e.clientY)) onWindowToggle();
      }}
    />
  );
}
