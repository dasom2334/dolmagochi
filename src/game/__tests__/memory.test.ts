import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { drawMemory, remember, resolveReflection } from '../memory';
import { mulberry32 } from '../rng';
import { createInitialState } from '../stateMachine';
import type { GameState, MemoryEntry } from '../types';
import type { ReflectionDef } from '../../data/schema';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

const DEFS: ReflectionDef[] = [
  {
    token: 'walk',
    variants: [
      { when: { action: 'free' }, textId: 'walk.ctx-free' },
      { when: { era: 'apart', action: 'walk' }, textId: 'walk.ctx-apart' },
      { textId: 'walk.base' },
    ],
  },
  { token: 'read', variants: [{ textId: 'read.base' }] },
];

function stateWith(action: string, era: GameState['era'] = 'raising'): GameState {
  return { ...createInitialState(T0, action), selectedAction: action, era };
}

describe('remember — 기억 강화 (소멸 없음)', () => {
  it('같은 종류 반복 = 강화, 상한 존재, 항목 삭제 없음', () => {
    let mem: Record<string, MemoryEntry> = {};
    for (let i = 0; i < 10; i++) mem = remember(mem, 'walk', 3, i);
    expect(Object.keys(mem)).toEqual(['walk']);
    expect(mem['walk'].count).toBe(10);
    expect(mem['walk'].w).toBe(BALANCE.MEMORY_WEIGHT_MAX);
    expect(mem['walk'].lastAt).toBe(9);
  });
});

describe('resolveReflection — 문맥 변형 우선', () => {
  it('문맥이 맞으면 문맥 변형, 아니면 기본', () => {
    const rng = mulberry32(1);
    expect(resolveReflection(DEFS[0], stateWith('free'), rng)).toBe(
      'walk.ctx-free',
    );
    expect(resolveReflection(DEFS[0], stateWith('read'), rng)).toBe('walk.base');
    expect(resolveReflection(DEFS[0], stateWith('walk', 'apart'), rng)).toBe(
      'walk.ctx-apart',
    );
  });
});

describe('drawMemory — 가중 추출·감쇠 바닥', () => {
  it('빈 풀 → null, 반추 정의 없는 종류 제외', () => {
    const s = stateWith('read');
    expect(drawMemory({}, DEFS, s, mulberry32(1))).toBeNull();
    const mem = remember({}, 'unknown', 3, 0);
    expect(drawMemory(mem, DEFS, s, mulberry32(1))).toBeNull();
  });

  it('추출 시 감쇠하되 바닥값 밑으로 내려가지 않는다 — 절대 소멸 없음', () => {
    const s = stateWith('read');
    let mem = remember({}, 'read', 1, 0);
    for (let i = 0; i < 10; i++) {
      const draw = drawMemory(mem, DEFS, s, mulberry32(i))!;
      expect(draw).not.toBeNull();
      mem = draw.memory;
    }
    expect(mem['read'].w).toBe(BALANCE.MEMORY_WEIGHT_FLOOR);
    // 바닥까지 감쇠한 뒤에도 계속 추출 가능
    expect(drawMemory(mem, DEFS, s, mulberry32(99))).not.toBeNull();
  });

  it('가중치 비례 분포 + 문맥 textId 반환', () => {
    const s = stateWith('free');
    const rng = mulberry32(42);
    const counts = { walk: 0, read: 0 };
    for (let i = 0; i < 1000; i++) {
      let mem = remember({}, 'walk', 9, 0);
      mem = remember(mem, 'read', 1, 0);
      const draw = drawMemory(mem, DEFS, s, rng)!;
      counts[draw.tokenKind as 'walk' | 'read']++;
      if (draw.tokenKind === 'walk') {
        expect(draw.textId).toBe('walk.ctx-free'); // 문맥 우선
      }
    }
    expect(counts.walk).toBeGreaterThan(700);
    expect(counts.read).toBeGreaterThan(0);
  });
});
