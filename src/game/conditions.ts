import { NEED_ORDER } from './types';
import type { Condition, GameState } from './types';
import { needsLevelOf } from './stats';

/** 조건 평가 — 명시된 필드를 전부 만족해야 통과. 조건이 없으면 통과. */
export function checkCondition(
  cond: Condition | undefined,
  state: GameState,
): boolean {
  if (!cond) return true;
  const { stats } = state;
  if (cond.flags && !cond.flags.every((f) => state.flags.includes(f)))
    return false;
  if (cond.notFlags && cond.notFlags.some((f) => state.flags.includes(f)))
    return false;
  if (cond.action !== undefined && state.selectedAction !== cond.action)
    return false;
  if (cond.notActions && cond.notActions.includes(state.selectedAction))
    return false;
  if (cond.hasTokens && !cond.hasTokens.every((t) => t in state.memory))
    return false;
  if (cond.minNeeds) {
    for (const need of NEED_ORDER) {
      const min = cond.minNeeds[need];
      if (min !== undefined && stats.needs[need] < min) return false;
    }
  }
  if (cond.minSecurity !== undefined && stats.security < cond.minSecurity)
    return false;
  if (cond.minAffection !== undefined && stats.affection < cond.minAffection)
    return false;
  if (cond.minTier !== undefined && state.relationTier < cond.minTier)
    return false;
  if (cond.minLevel !== undefined && needsLevelOf(stats.needs) < cond.minLevel)
    return false;
  if (cond.ownedItems && !cond.ownedItems.every((i) => i in state.items))
    return false;
  if (cond.placedItems && !cond.placedItems.every((i) => state.items[i]?.placed))
    return false;
  if (
    cond.minTotalHours !== undefined &&
    state.totals.focusSeconds / 3600 < cond.minTotalHours
  )
    return false;
  if (cond.era !== undefined && state.era !== cond.era) return false;
  if (cond.presence !== undefined && state.presence.state !== cond.presence)
    return false;
  return true;
}
