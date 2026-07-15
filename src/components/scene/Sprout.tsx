import type { SproutStage } from '../../game/sprout';

/**
 * 엔딩 분기 이후 돌 위에 돋는 나무 새싹 — 개별 씬 요소(추후 PNG 교체 대비).
 * RockSprite 컨테이너 안에서 돌 정수리 위(top 음수)로 자라 오른다.
 * image-rendering: pixelated 유지(box-shadow 도트).
 *
 * - 'thriving'(빈자리): 곧게 선 무성한 초록 새싹.
 * - 시듦 단계(동거): 의존도 단계가 오를수록 색이 바래고 잎이 처진다.
 *   0 싱싱한 초록 → 1 누렇게 뜬 잎 → 2 갈색으로 시든 채 늘어짐.
 */
const WITHER: { core: string; shadow: string }[] = [
  {
    // 0 — 싱싱함 (동거 초기)
    core: '#6f8f5a',
    shadow:
      '-6px 0 0 #7fa066,6px 0 0 #7fa066,0 -6px 0 #7fa066,-6px -6px 0 #8fb075,6px -6px 0 #8fb075,0 -12px 0 #8fb075',
  },
  {
    // 1 — 누렇게 뜸 (의존도 중기), 한쪽 잎이 처진다
    core: '#8f9a55',
    shadow:
      '-6px 0 0 #9a9a5a,6px 6px 0 #9a9a5a,0 -6px 0 #9a9a5a,-6px -6px 0 #a5a05f,0 -12px 0 #a5a05f',
  },
  {
    // 2 — 갈색으로 시듦 (의존도 후기), 잎이 아래로 늘어짐
    core: '#7c6a44',
    shadow:
      '-6px 6px 0 #8a7a4a,6px 6px 0 #8a7a4a,0 -6px 0 #7c6a44,-6px 0 0 #6f5e3a',
  },
];

const THRIVING = {
  core: '#6f8f5a',
  shadow:
    '0 -6px 0 #6f8f5a,-6px -6px 0 #7fa066,6px -6px 0 #7fa066,-6px -12px 0 #8fb075,6px -12px 0 #8fb075,0 -12px 0 #8fb075,0 -18px 0 #9fc085',
};

export function Sprout({ stage }: { stage: SproutStage }) {
  const look =
    stage === 'thriving' ? THRIVING : WITHER[Math.min(stage, WITHER.length - 1)];
  return (
    <div
      style={{
        position: 'absolute',
        left: 26,
        top: -30,
        width: 6,
        height: 6,
        background: look.core,
        boxShadow: look.shadow,
        imageRendering: 'pixelated',
      }}
    />
  );
}
