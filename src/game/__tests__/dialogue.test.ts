import { describe, expect, it } from 'vitest';
import {
  affectionTier,
  trustStep,
  drawEligibleLine,
  drawNonReplacing,
  selectDialoguePool,
} from '../dialogue';
import { mulberry32 } from '../rng';
import { BALANCE } from '../balance';
import { SYS } from '../text';
import { gameData } from '../../store/gameStore';
import { createInitialState } from '../stateMachine';
import type { DialogueContext } from '../dialogue';
import type { Era } from '../types';
import type { DialogueLine } from '../../data/schema';

// 안정(급성 아님) baseline 컨텍스트 — 필요한 필드만 덮어쓴다
function ctx(over: Partial<DialogueContext> & { era: Era }): DialogueContext {
  return {
    needsLevel: 1,
    dependence: 0,
    tier: 1,
    abandonment: 0,
    intimacyThreat: 30, // 안정(급성 아님): 합산·각 축 모두 임계 미만
    preferRelation: false,
    ...over,
  };
}

describe('selectDialoguePool — 이원화(관계/상태/4분면) 라우팅', () => {
  const d = gameData.dialogues;

  it('안정 · 상태 선호 → 욕구 단계 풀', () => {
    expect(selectDialoguePool(d, ctx({ era: 'raising', needsLevel: 1 }))?.poolId).toBe('stage1');
    expect(selectDialoguePool(d, ctx({ era: 'raising', needsLevel: 4 }))?.poolId).toBe('stage4');
  });

  it('안정 · 관계 선호 → 확정 티어 풀 (개정 v4-7: 승급 하루 1회를 지난 값)', () => {
    expect(
      selectDialoguePool(d, ctx({ era: 'raising', preferRelation: true, tier: 1 }))?.poolId,
    ).toBe('relation1');
    expect(
      selectDialoguePool(d, ctx({ era: 'raising', preferRelation: true, tier: 7 }))?.poolId,
    ).toBe('relation7');
  });

  it('급성 애착 상태 → 4분면 풀 (관계보다 우선)', () => {
    // 유기불안 극단 → 집착
    expect(
      selectDialoguePool(d, ctx({ era: 'raising', preferRelation: true, abandonment: 95, intimacyThreat: 10 }))?.poolId,
    ).toBe('quad_clingy');
    // 친밀위협 극단 → 회피
    expect(
      selectDialoguePool(d, ctx({ era: 'raising', abandonment: 10, intimacyThreat: 95 }))?.poolId,
    ).toBe('quad_avoidant');
    // 합산 과다 → 혼란
    expect(
      selectDialoguePool(d, ctx({ era: 'raising', abandonment: 70, intimacyThreat: 70 }))?.poolId,
    ).toBe('quad_chaotic');
  });

  it('동거는 의존도 구간별 단계 풀 (깨달음 심화)', () => {
    expect(selectDialoguePool(d, ctx({ era: 'cohabit', dependence: 0 }))?.poolId).toBe('cohabit0');
    expect(selectDialoguePool(d, ctx({ era: 'cohabit', dependence: 45 }))?.poolId).toBe('cohabit1');
    expect(selectDialoguePool(d, ctx({ era: 'cohabit', dependence: 90 }))?.poolId).toBe('cohabit2');
  });

  it('apart는 풀 대신 회상/방문 경로 — null', () => {
    expect(selectDialoguePool(d, ctx({ era: 'apart' }))).toBeNull();
  });

  // 임계값을 여기 다시 적지 않는다 — BALANCE.AFFECTION_TIERS에서 파생해 검증한다.
  // (밸런스 조정과 콘텐츠 브랜치가 병렬로 가도 테스트가 어긋나지 않게)
  it('affectionTier — 각 임계에서 승급, 직전에는 이전 티어 (임계 = BALANCE 파생)', () => {
    const tiers = BALANCE.AFFECTION_TIERS;
    tiers.forEach((threshold, i) => {
      expect(affectionTier(threshold)).toBe(i + 1);
      if (i > 0) expect(affectionTier(threshold - 0.1)).toBe(i);
    });
    expect(affectionTier(tiers[tiers.length - 1] + 1000)).toBe(tiers.length);
  });

  it('trustStep — 화자 관찰 문구는 호감도 티어와 1:1 (티어 묶음 공유 없음)', () => {
    BALANCE.AFFECTION_TIERS.forEach((threshold, i) => {
      expect(trustStep(threshold)).toBe(i);
      if (i > 0) expect(trustStep(threshold - 0.1)).toBe(i - 1);
    });
  });

  it('불변식: 신뢰 문구 수·관계 대사 풀 수 = 티어 수 (임계 변경 시 콘텐츠도 따라와야 한다)', () => {
    expect(SYS.trustLadder.length).toBe(BALANCE.AFFECTION_TIERS.length);
    expect(gameData.dialogues.relationTiers.length).toBe(
      BALANCE.AFFECTION_TIERS.length,
    );
  });
});

describe('drawNonReplacing — 비복원 추출', () => {
  it('풀 소진 전까지 중복 없이 뽑는다', () => {
    const rng = mulberry32(7);
    let used: number[] = [];
    const seen = new Set<number>();
    for (let i = 0; i < 5; i++) {
      const draw = drawNonReplacing(5, used, rng)!;
      expect(seen.has(draw.index)).toBe(false);
      seen.add(draw.index);
      used = draw.used;
    }
    expect(seen.size).toBe(5);
  });

  it('소진 후에는 리셋하고 다시 뽑는다', () => {
    const rng = mulberry32(7);
    const draw = drawNonReplacing(3, [0, 1, 2], rng)!;
    expect([0, 1, 2]).toContain(draw.index);
    expect(draw.used).toEqual([draw.index]);
  });

  it('빈 풀 → null', () => {
    expect(drawNonReplacing(0, [], mulberry32(1))).toBeNull();
  });
});

describe('drawEligibleLine — when 조건 필터', () => {
  const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();
  const lines: DialogueLine[] = [
    { textId: 'a', intimacy: 1 },
    { textId: 'soda', intimacy: 1, when: { placedItems: ['soda'] } },
    { textId: 'c', intimacy: 1 },
  ];

  it('소품 미배치 시 그 줄은 후보에서 제외된다', () => {
    const state = createInitialState(T0, 'read'); // items 비어 있음
    const seen = new Set<string>();
    let used: number[] = [];
    for (let i = 0; i < 20; i++) {
      const draw = drawEligibleLine(lines, used, state, mulberry32(i))!;
      seen.add(lines[draw.index].textId);
      used = draw.used;
    }
    expect(seen.has('soda')).toBe(false); // 소다 미배치 → 절대 안 나옴
    expect(seen.has('a')).toBe(true);
    expect(seen.has('c')).toBe(true);
  });

  it('소품 배치 시에는 후보에 포함된다', () => {
    const state = {
      ...createInitialState(T0, 'read'),
      items: { soda: { placed: true } },
    };
    const seen = new Set<string>();
    let used: number[] = [];
    for (let i = 0; i < 30; i++) {
      const draw = drawEligibleLine(lines, used, state, mulberry32(i))!;
      seen.add(lines[draw.index].textId);
      used = draw.used;
    }
    expect(seen.has('soda')).toBe(true);
  });

  it('소품을 보관만(placed:false) 하면 여전히 제외', () => {
    const state = {
      ...createInitialState(T0, 'read'),
      items: { soda: { placed: false } },
    };
    for (let i = 0; i < 20; i++) {
      const draw = drawEligibleLine(lines, [], state, mulberry32(i))!;
      expect(lines[draw.index].textId).not.toBe('soda');
    }
  });
});
