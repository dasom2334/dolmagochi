/**
 * 휴식 타이머는 종료 시각 타임스탬프(rest.endsAt) 기준 — 탭을 떠나도 실제 시각으로 진행한다.
 * 순수 계산만 여기 둔다(Worker·UI가 공유, 테스트 대상).
 */

/** 남은 휴식 시간(초). 이미 지났으면 0. */
export function restRemainingSec(endsAt: number, nowMs: number): number {
  if (endsAt <= 0) return 0;
  return Math.max(0, (endsAt - nowMs) / 1000);
}

/** 휴식이 만료됐는가 (endsAt이 설정돼 있고 현재 시각이 지났음). */
export function isRestOver(endsAt: number, nowMs: number): boolean {
  return endsAt > 0 && nowMs >= endsAt;
}

/** 진행률 % (UI 바) */
export function restProgressPct(
  endsAt: number,
  totalSec: number,
  nowMs: number,
): number {
  if (totalSec <= 0) return 0;
  return Math.round((restRemainingSec(endsAt, nowMs) / totalSec) * 100);
}
