/**
 * 거실 휴식 씬 — 확정 PNG 레이어 렌더 (design/generated/confirmed/ 반입분).
 * 좌표계는 논리 160×120, 기준 좌표는 design/tools/verify_scene.py의 SCENE 매니페스트.
 * 씬 박스(480×270) 안에 정수 2배(320×240)로 중앙 배치해 픽셀 그리드를 지킨다.
 *
 * 확정 범위의 한계 (미확정 wip 확정 시 해소):
 * - 창밖 통짜 배경 미확정 → 유리 구멍 뒤는 glassColor(시간대·날씨 반응)로 채운다.
 * - 소품 분리 미확정 → 방 레이어에 구워진 소품(벽난로·책장·러그 등)은 배치 여부와
 *   무관하게 항상 보인다. 분리 컷 확정 시 placed() 토글로 전환.
 * - 돌 상태 오버레이(이끼·젖음·새싹)와 림 라이트는 아직 미적용 — 중립 돌만.
 */
const LOGICAL = { w: 160, h: 120 };
const SCALE = 2;

/** SCENE 매니페스트 좌표 (verify_scene.py와 동일하게 유지할 것) */
const ART = {
  rock: { w: 22, h: 16, anchor: { x: 82, y: 102 } }, // anchor = 바닥 중앙
  plant: { x: 47, y: 50 },
  tree: { x: 49, y: 2 },
};

const px = (v: number) => v * SCALE;

export function LivingRoomArt({
  glassColor,
  showRock,
  showTree,
  showPlant,
}: {
  glassColor: string;
  showRock: boolean;
  showTree: boolean;
  showPlant: boolean;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        width: px(LOGICAL.w),
        height: px(LOGICAL.h),
        imageRendering: 'pixelated',
      }}
    >
      {/* 창밖(백드롭 미확정) — 유리 구멍으로 비치는 하늘색 */}
      <div style={{ position: 'absolute', inset: 0, background: glassColor }} />
      {showTree && (
        <img
          src="assets/rooms/living/tree.png"
          alt=""
          style={layer(ART.tree.x, ART.tree.y)}
        />
      )}
      <img src="assets/rooms/living/room.png" alt="" style={layer(0, 0)} />
      {showPlant && (
        <img
          src="assets/rooms/living/plant.png"
          alt=""
          style={layer(ART.plant.x, ART.plant.y)}
        />
      )}
      {showRock && (
        <img
          src="assets/rock/neutral.png"
          alt=""
          style={layer(ART.rock.anchor.x - ART.rock.w / 2, ART.rock.anchor.y - ART.rock.h)}
        />
      )}
    </div>
  );
}

function layer(x: number, y: number): React.CSSProperties {
  return {
    position: 'absolute',
    left: px(x),
    top: px(y),
    width: 'auto',
    height: 'auto',
    transform: `scale(${SCALE})`,
    transformOrigin: 'top left',
    imageRendering: 'pixelated',
  };
}
