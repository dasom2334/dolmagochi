import { describe, expect, it } from 'vitest';
import {
  affectionTier,
  trustStep,
  drawEligibleLine,
  drawNonReplacing,
  selectDialoguePool,
} from '../dialogue';
import { mulberry32 } from '../rng';
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
    affection: 0,
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

  it('안정 · 관계 선호 → 호감도 티어 풀', () => {
    expect(
      selectDialoguePool(d, ctx({ era: 'raising', preferRelation: true, affection: 0 }))?.poolId,
    ).toBe('relation1');
    expect(
      selectDialoguePool(d, ctx({ era: 'raising', preferRelation: true, affection: 200 }))?.poolId,
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

  it('affectionTier — 누적 호감도 → 1~7', () => {
    expect(affectionTier(0)).toBe(1);
    expect(affectionTier(7)).toBe(1);
    expect(affectionTier(8)).toBe(2);
    expect(affectionTier(1000)).toBe(7);
  });

  it('trustStep — 화자 관찰 문구는 호감도 7티어와 1:1 (티어 묶음 공유 없음)', () => {
    expect(trustStep(0)).toBe(0); // 티어 1 — 관심 없음
    expect(trustStep(8)).toBe(1); // 티어 2 — 관찰 중
    expect(trustStep(20)).toBe(2); // 티어 3 — 밀어내지 않음
    expect(trustStep(36)).toBe(3); // 티어 4 — 신뢰(아마도)
    expect(trustStep(56)).toBe(4); // 티어 5 — 속을 툭, 아닌 척
    expect(trustStep(82)).toBe(5); // 티어 6 — 곁이 편함
    expect(trustStep(115)).toBe(6); // 티어 7 — 좋아함
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
