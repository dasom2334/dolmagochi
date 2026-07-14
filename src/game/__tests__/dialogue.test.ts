import { describe, expect, it } from 'vitest';
import {
  drawEligibleLine,
  drawNonReplacing,
  selectDialoguePool,
} from '../dialogue';
import { mulberry32 } from '../rng';
import { gameData } from '../../store/gameStore';
import { createInitialState } from '../stateMachine';
import type { DialogueLine } from '../../data/schema';

describe('selectDialoguePool — 시대·단계·의존도 풀 게이트', () => {
  const d = gameData.dialogues;

  it('육성 중에는 파생 욕구 단계별 풀', () => {
    expect(selectDialoguePool(d, 'raising', 1, 0)?.poolId).toBe('stage1');
    expect(selectDialoguePool(d, 'raising', 4, 0)?.poolId).toBe('stage4');
  });

  it('동거는 의존도 구간별 단계 풀 (깨달음 심화)', () => {
    expect(selectDialoguePool(d, 'cohabit', 3, 0)?.poolId).toBe('cohabit0');
    expect(selectDialoguePool(d, 'cohabit', 3, 45)?.poolId).toBe('cohabit1');
    expect(selectDialoguePool(d, 'cohabit', 3, 90)?.poolId).toBe('cohabit2');
  });

  it('apart는 풀 대신 회상/방문 경로 — null', () => {
    expect(selectDialoguePool(d, 'apart', 3, 0)).toBeNull();
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
