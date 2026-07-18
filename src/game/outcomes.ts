import type {
  ChoiceOutcomeData,
  GameState,
  Outcome,
  RemembranceData,
} from './types';
import { applyStatOutcome } from './stats';
import { attachRate } from './security';
import { remember } from './memory';
import { checkCondition } from './conditions';
import type { Rng } from './rng';

export { checkCondition } from './conditions';

/**
 * 결과 후보 추첨: 조건 통과분만 남기고 weight 비례 추첨.
 * 통과분이 없으면 전체에서 폴백 추첨 (데이터 검증이 무조건 후보 1개를 보장 — M4).
 */
export function pickChoiceOutcome(
  outcomes: ChoiceOutcomeData[],
  state: GameState,
  rng: Rng,
): ChoiceOutcomeData {
  const valid = outcomes.filter((o) => checkCondition(o.when, state));
  const pool = valid.length > 0 ? valid : outcomes;
  const total = pool.reduce((a, o) => a + (o.weight ?? 1), 0);
  let r = rng() * total;
  for (const o of pool) {
    r -= o.weight ?? 1;
    if (r <= 0) return o;
  }
  return pool[pool.length - 1];
}

/** Outcome 전체 적용: 상태 수치 + 기억 강화 + 플래그 + 잠금해제 */
export function applyOutcome(
  state: GameState,
  outcome: Outcome | undefined,
  atMs: number,
): GameState {
  if (!outcome) return state;
  let memory = state.memory;
  for (const m of outcome.memory ?? []) {
    memory = remember(memory, m.k, m.w, atMs);
  }
  const addUnique = (base: string[], adds: string[] | undefined) =>
    adds?.length ? [...new Set([...base, ...adds])] : base;
  // 욕구 상승 게이트(개정 v4-5)는 자유행동·자연 상승 경로에만 적용한다 (M16):
  // 여기로 오는 Outcome은 전부 유저가 직접 고른 것(행동·선택지·구매)이라
  // 게이트를 걸면 하위 욕구가 찰 때까지 플레이 시간이 무한정 늘어난다.
  // 애착 축 델타는 잠복/개막/감쇠 곡선(attachRate)을 곱한다 (M18)
  return {
    ...state,
    stats: applyStatOutcome(
      state.stats,
      outcome,
      false,
      attachRate(state.relationTier, state.crisesWeathered),
    ),
    memory,
    flags: addUnique(state.flags, outcome.flags),
    unlockedActions: addUnique(state.unlockedActions, outcome.unlockActions),
    unlockedItems: addUnique(state.unlockedItems, outcome.unlockItems),
  };
}

/**
 * 추억 기록 적립 (같은 id는 1회만).
 * picked(M11a): 선택지 유래 추억은 그때 고른 라벨·결과 textId를 함께 저장 —
 * "무슨 선택을 했고 돌이 어떻게 반응했는지"가 도감·회상에서 재생된다.
 */
export function recordRemembrance(
  state: GameState,
  remembrance: RemembranceData | undefined,
  atMs: number,
  picked?: { labelId: string; resultId: string },
): GameState {
  if (!remembrance) return state;
  if (state.remembrances.some((r) => r.id === remembrance.id)) return state;
  return {
    ...state,
    remembrances: [
      ...state.remembrances,
      {
        ...remembrance,
        at: atMs,
        pickedLabelId: picked?.labelId,
        resultId: picked?.resultId,
      },
    ],
  };
}
