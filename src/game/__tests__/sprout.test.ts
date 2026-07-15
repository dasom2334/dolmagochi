import { describe, expect, it } from 'vitest';
import { createInitialState } from '../stateMachine';
import { sproutStageOf } from '../sprout';
import type { GameState } from '../types';
import { gameData } from '../../store/gameStore';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();
const D = gameData.dialogues;

function withEra(era: GameState['era'], dependence: number): GameState {
  const s = createInitialState(T0, 'read');
  return { ...s, era, stats: { ...s.stats, dependence } };
}

describe('sproutStageOf — 엔딩 이후 새싹 단계', () => {
  it('육성 중에는 새싹이 없다(null)', () => {
    expect(sproutStageOf(withEra('raising', 0), D)).toBeNull();
  });

  it('빈자리(자유롭게 떠남)는 의존도와 무관하게 무성하다', () => {
    expect(sproutStageOf(withEra('apart', 0), D)).toBe('thriving');
    // 동거를 거쳐 온 경우(의존도가 남아 있어도) 놓아주었으니 다시 무성
    expect(sproutStageOf(withEra('apart', 100), D)).toBe('thriving');
  });

  it('동거는 의존도 단계가 오를수록 시듦 단계가 커진다', () => {
    // 임계는 cohabitStages(minDependence 0/40/70)와 동일
    const stages = D.cohabitStages.map((s) => s.minDependence);
    expect(sproutStageOf(withEra('cohabit', stages[0]), D)).toBe(0);
    expect(sproutStageOf(withEra('cohabit', stages[1]), D)).toBe(1);
    expect(sproutStageOf(withEra('cohabit', stages[2]), D)).toBe(2);
    // 최고 임계를 넘겨도 마지막(가장 시든) 단계로 유지
    expect(sproutStageOf(withEra('cohabit', 100), D)).toBe(
      D.cohabitStages.length - 1,
    );
  });

  it('시듦 단계는 의존도에 대해 단조 증가한다', () => {
    let prev = -1;
    for (let dep = 0; dep <= 100; dep += 5) {
      const stage = sproutStageOf(withEra('cohabit', dep), D) as number;
      expect(stage).toBeGreaterThanOrEqual(prev);
      prev = stage;
    }
  });
});
