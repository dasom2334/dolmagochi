import { describe, expect, it } from 'vitest';
import { createInitialState, ignoresChoices, transition } from '../stateMachine';
import { gameData } from '../../store/gameStore';
import { BALANCE } from '../balance';
import { mulberry32 } from '../rng';
import type { GameState } from '../types';

/**
 * 선택지 무응답 유형 대응 (M25).
 * 포섀도 슬롯은 하나뿐이라, 뜬 선택지를 계속 무시하면 그 하나가 자리를 물고 있어
 * 나머지 복선이 영영 안 나온다. 그런 유형에게만 세션 끝에 흘려보낸다.
 */
const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();
const W = BALANCE.CHOICE_WINDOW;

/** 최근 선택 이력을 직접 깔아둔, 포섀도가 떠 있는 집중 세션 */
function focusWithForeshadow(recent: boolean[]): GameState {
  const s = createInitialState(T0, 'read');
  return {
    ...s,
    phase: 'focus',
    recentChoices: recent,
    pendingEvent: gameData.events.foreshadow[3].event,
    foreUsed: [3],
    session: {
      ...s.session,
      elapsedSec: 1800,
      choiceState: { source: 'foreshadow', index: 0, shownAtSec: 300 },
    },
  } as GameState;
}

const endFocus = (s: GameState): GameState =>
  transition(s, { type: 'END_FOCUS', nowMs: T0 + 1_800_000 }, {
    rng: mulberry32(1),
    data: gameData,
  });

describe('선택지 무응답 유형 판정', () => {
  it('표본이 차기 전에는 판정하지 않는다 — 짧게만 해서 선택지를 못 본 사람 보호', () => {
    const few = Array.from({ length: BALANCE.CHOICE_MIN_SAMPLE - 1 }, () => false);
    expect(ignoresChoices({ recentChoices: few } as GameState)).toBe(false);
  });

  it('표본이 차고 선택률이 임계 미만이면 무응답 유형', () => {
    const all = Array.from({ length: W }, () => false);
    expect(ignoresChoices({ recentChoices: all } as GameState)).toBe(true);
  });

  it('임계 이상으로 고르면 유형이 아니다 — 롤링이라 스스로 풀린다', () => {
    const half = Array.from({ length: W }, (_, i) => i % 2 === 0);
    expect(ignoresChoices({ recentChoices: half } as GameState)).toBe(false);
  });
});

describe('포섀도 만료', () => {
  it('무응답 유형이면 세션 끝에 흘려보내고 슬롯을 비운다', () => {
    const s = endFocus(focusWithForeshadow(Array.from({ length: W }, () => false)));
    expect(s.pendingEvent).toBeNull();
  });

  it('흘려보낸 복선은 풀로 돌아간다 — 1회용(실금·울림)이 영구 소실되면 안 된다', () => {
    const s = endFocus(focusWithForeshadow(Array.from({ length: W }, () => false)));
    expect(s.foreUsed).not.toContain(3);
  });

  it('응답하는 사람에게는 종전대로 계속 기다린다', () => {
    const engaged = Array.from({ length: W }, () => true);
    const s = endFocus(focusWithForeshadow(engaged));
    expect(s.pendingEvent).not.toBeNull();
    expect(s.foreUsed).toContain(3);
  });

  it('포섀도가 떠 있지 않았다면 무응답 유형이어도 건드리지 않는다', () => {
    const base = focusWithForeshadow(Array.from({ length: W }, () => false));
    const noChoice = {
      ...base,
      session: { ...base.session, choiceState: null },
    } as GameState;
    const s = endFocus(noChoice);
    expect(s.pendingEvent).not.toBeNull();
    expect(s.foreUsed).toContain(3);
  });
});
