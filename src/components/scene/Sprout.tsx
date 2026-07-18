import type { SproutStage } from '../../game/sprout';

/**
 * 엔딩 분기 이후 돌 위에 돋는 나무 새싹 — 개별 씬 요소(추후 PNG 교체 대비).
 * RockSprite 컨테이너 안에서 돌 정수리 위(top 음수)로 자라 오른다.
 * image-rendering: pixelated 유지(box-shadow 도트).
 *
 * - 'thriving'(빈자리): 곧게 선 무성한 초록 새싹.
 * - 시듦 단계(동거): 의존도 단계가 오를수록 색이 바래고 잎이 처진다.
 *   0 싱싱한 초록 → 1 누렇게 뜬 잎 → 2 갈색으로 시든 채 늘어짐.
 *
 * ⚠ WITHER 항목 수는 dialogues.cohabitStages 수(현재 3)와 1:1로 맞물린다.
 *   동거 단계를 늘리면 여기 시듦 그림도 그만큼 늘려야 한다 — 부족하면 상위 단계가
 *   전부 마지막(가장 시든) 그림으로 뭉개지고, DEV 빌드에서 아래 경고가 뜬다.
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

/** 1차 전조 (M19b) — 티어 6부터 정수리의 아주 작은 싹. 알아채는 사람만 안다 */
const BUDDING = {
  core: '#7fa066',
  shadow: '0 -6px 0 #8fb075',
};

/** 뿌리내림기 (M19b, v5 §6) — 갈색 뿌리가 돌 쪽(아래)으로 뻗는다. 불가역 */
const ROOTING1 = {
  core: '#6f8f5a',
  shadow:
    '0 -6px 0 #7fa066,-6px -6px 0 #7fa066,6px -6px 0 #7fa066,0 -12px 0 #8fb075,' +
    '0 6px 0 #6f5e3a,-6px 12px 0 #6f5e3a,6px 12px 0 #7c6a44',
};

/** 뒤덮임 — 뿌리가 넓게 감싸고, 위는 오히려 무성하다. 돌은 더는 반응하지 않는다 */
const ROOTING2 = {
  core: '#5f7f4d',
  shadow:
    '0 -6px 0 #6f8f5a,-6px -6px 0 #7fa066,6px -6px 0 #7fa066,0 -12px 0 #8fb075,' +
    '-6px -12px 0 #8fb075,6px -12px 0 #8fb075,0 -18px 0 #9fc085,' +
    '0 6px 0 #6f5e3a,-6px 6px 0 #6f5e3a,6px 6px 0 #6f5e3a,' +
    '-12px 12px 0 #7c6a44,12px 12px 0 #7c6a44,-6px 18px 0 #6f5e3a,6px 18px 0 #6f5e3a,' +
    '-18px 18px 0 #7c6a44,18px 18px 0 #7c6a44',
};

const THRIVING = {
  core: '#6f8f5a',
  shadow:
    '0 -6px 0 #6f8f5a,-6px -6px 0 #7fa066,6px -6px 0 #7fa066,-6px -12px 0 #8fb075,6px -12px 0 #8fb075,0 -12px 0 #8fb075,0 -18px 0 #9fc085',
};

export function Sprout({ stage }: { stage: SproutStage }) {
  if (
    import.meta.env.DEV &&
    typeof stage === 'number' &&
    stage > WITHER.length - 1
  ) {
    // 조용한 뭉갬 방지 — 동거 단계가 준비된 시듦 그림 수를 넘으면 개발 중 눈치채게 한다
    console.warn(
      `[Sprout] 시듦 단계 ${stage}가 준비된 새싹 그림 수(${WITHER.length})를 초과 — 마지막 단계로 대체됨. WITHER를 cohabitStages 수에 맞춰 확장하세요.`,
    );
  }
  const look =
    stage === 'budding'
      ? BUDDING
      : stage === 'rooting1'
        ? ROOTING1
        : stage === 'rooting2'
          ? ROOTING2
          : stage === 'thriving'
            ? THRIVING
            : WITHER[Math.min(stage, WITHER.length - 1)];
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
