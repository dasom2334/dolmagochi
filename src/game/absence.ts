import type { PresenceState } from './types';
import type { Rng } from './rng';

export function presentState(): PresenceState {
  return {
    state: 'present',
    plannedSessions: 0,
    lowIntimacyProgress: 0,
    returnPending: false,
    sick: false,
  };
}

/**
 * 잠수 발동 (회피 극단): 돌이 자리를 뜬다.
 * 복귀는 이제 항상성(두 애착 축의 수렴)으로 결정된다 — 여기선 부재 상태만 세운다.
 */
export function startAbsence(_rng?: Rng): PresenceState {
  return {
    state: 'absent',
    plannedSessions: 0,
    lowIntimacyProgress: 0,
    returnPending: false,
    sick: false,
  };
}
