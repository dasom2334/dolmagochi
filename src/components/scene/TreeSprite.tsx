/**
 * 3차 — 심은 나무 (M15). 단계별 도트 (0 심음 ~ 5 성목).
 * 씬 요소: 테마 미적용(B23), 추후 도트 에셋 교체 대상. 디자인 리워크 예정이라 러프.
 */
import type { TreeStage } from '../../game/tree';

const TRUNK = '#7a5a3a';
const LEAF = '#5d7d46';
const LEAF_HI = '#79a05c';
const BLOSSOM = '#e8a7c0';

/**
 * flowers: 나무 소품(피드백8)이 더해주는 꽃 수 — 정성이 모양새로 보인다.
 * 수관 둘레에 고르게 찍는다 (수관이 없는 0단계에는 안 핀다).
 */
export function TreeSprite({
  stage,
  flowers = 0,
}: {
  stage: TreeStage;
  flowers?: number;
}) {
  // 단계별 크기 — 몸통 높이(px)와 수관 반경
  const trunkH = [4, 8, 14, 22, 30, 40][stage];
  const canopy = [0, 4, 8, 14, 20, 28][stage];
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '24%',
        transform: 'translateX(-50%)',
      }}
    >
      {/* 흙무덤 (심은 자리 — 그 아래에 돌이 있다) */}
      <div
        style={{
          position: 'absolute',
          left: -10,
          bottom: -4,
          width: 20,
          height: 4,
          background: '#4a3b2e',
        }}
      />
      {/* 몸통 */}
      <div
        style={{
          position: 'absolute',
          left: -2,
          bottom: 0,
          width: 4,
          height: trunkH,
          background: TRUNK,
        }}
      />
      {/* 수관 — 단계 1부터 */}
      {canopy > 0 && (
        <div
          style={{
            position: 'absolute',
            left: -canopy,
            bottom: trunkH - 2,
            width: canopy * 2,
            height: canopy + 4,
            background: LEAF,
            boxShadow: `${-canopy / 2}px ${-canopy / 3}px 0 ${LEAF}, ${canopy / 2}px ${-canopy / 3}px 0 ${LEAF_HI}, 0 ${-canopy / 2}px 0 ${LEAF_HI}`,
          }}
        />
      )}
      {/* 꽃 — 수관 둘레에 고르게 (소품 보유량만큼) */}
      {canopy > 0 &&
        Array.from({ length: flowers }, (_, i) => {
          const a = (i / flowers) * Math.PI * 2;
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: Math.round(Math.cos(a) * canopy * 0.8) - 1,
                bottom: trunkH + canopy / 2 + Math.round(Math.sin(a) * canopy * 0.5),
                width: 2,
                height: 2,
                background: BLOSSOM,
              }}
            />
          );
        })}
    </div>
  );
}
