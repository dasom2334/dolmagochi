/**
 * 휴식 타이머는 종료 시각 타임스탬프(rest.endsAt) 기준 — 탭을 떠나도 실제 시각으로 진행한다.
 * 순수 계산만 여기 둔다(Worker·UI가 공유, 테스트 대상).
 */

/** 남은 휴식 시간(초). 이미 지났으면 0. */
export function restRemainingSec(endsAt: number, nowMs: number): number {
  if (endsAt <= 0) return 0;
  return Math.max(0, (endsAt - nowMs) / 1000);
}

/**
 * 표시용 잔여 — 전체 길이를 넘지 않게 클램프.
 * nowMs는 휴식 phase에서만 갱신되므로 휴식 진입 직후 첫 렌더에는 낡은(과거) 값이
 * 들어와 잔여가 totalSec를 넘는다. 진행 바는 restProgressPct가 막아 줬지만
 * 카운트다운 텍스트는 그대로 노출돼, 2시간 집중 뒤 휴식 진입 순간 "2:20:00" 같은
 * 값이 한 틱(250ms) 스쳤다.
 */
export function restRemainingDisplaySec(
  endsAt: number,
  totalSec: number,
  nowMs: number,
): number {
  return Math.min(restRemainingSec(endsAt, nowMs), Math.max(0, totalSec));
}

/** 휴식이 만료됐는가 (endsAt이 설정돼 있고 현재 시각이 지났음). */
export function isRestOver(endsAt: number, nowMs: number): boolean {
  return endsAt > 0 && nowMs >= endsAt;
}

/**
 * 진행률 % (UI 바) — 0~100으로 클램프.
 * 휴식 시작 순간엔 nowMs가 아직 갱신 전(낡은 과거 값)이라 잔여가 totalSec를
 * 넘을 수 있다 → 클램프하지 않으면 게이지가 상한을 뚫는다.
 */
export function restProgressPct(
  endsAt: number,
  totalSec: number,
  nowMs: number,
): number {
  if (totalSec <= 0) return 0;
  const pct = Math.round((restRemainingSec(endsAt, nowMs) / totalSec) * 100);
  return Math.min(100, Math.max(0, pct));
}
