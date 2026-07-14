import { BALANCE } from './balance';
import type { PresenceState } from './types';
import { randInt, type Rng } from './rng';

export function presentState(): PresenceState {
  return {
    state: 'present',
    plannedSessions: 0,
    lowIntimacyProgress: 0,
    returnPending: false,
  };
}

/** 잠수 발동: 1~3세션 부재. */
export function startAbsence(rng: Rng): PresenceState {
  return {
    state: 'absent',
    plannedSessions: randInt(
      rng,
      BALANCE.ABSENCE_SESSIONS_MIN,
      BALANCE.ABSENCE_SESSIONS_MAX,
    ),
    lowIntimacyProgress: 0,
    returnPending: false,
  };
}

/**
 * 부재 중 집중 세션 종료 처리: 저친밀 행동 세션만 복귀 누적에 카운트.
 * 누적이 예정 길이에 도달하면 복귀(returnPending — 다음 휴식에 복귀 대화).
 * 복귀는 호감도를 건드리지 않는다.
 */
export function absenceSessionEnd(
  presence: PresenceState,
  actionIntimacy: number,
): PresenceState {
  if (presence.state !== 'absent') return presence;
  const progress =
    actionIntimacy <= BALANCE.RETURN_LOW_INTIMACY_MAX
      ? presence.lowIntimacyProgress + 1
      : presence.lowIntimacyProgress;
  if (progress >= presence.plannedSessions) {
    return { ...presentState(), returnPending: true };
  }
  return { ...presence, lowIntimacyProgress: progress };
}
