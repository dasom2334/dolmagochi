import { BALANCE } from './balance';
import type { Rng } from './rng';

/**
 * 애착 시스템 (2축) — 육성 시대.
 * 유기불안(abandonment)·친밀위협(intimacyThreat) 두 숨은 게이지가 근원이고,
 * 안정감(security)은 두 축의 파생값이다.
 *   안정감 = 100 − |유기불안 − 친밀위협|   (균형일수록 안정)
 *   변동성 = (유기불안 + 친밀위협) / 2      (총량이 클수록 예민)
 */

function clamp(n: number): number {
  return Math.min(BALANCE.STAT_MAX, Math.max(BALANCE.STAT_MIN, n));
}

/** 파생 안정감 0–100. 두 축이 비슷할수록 높다. */
export function derivedSecurity(abandonment: number, intimacyThreat: number): number {
  return clamp(BALANCE.STAT_MAX - Math.abs(abandonment - intimacyThreat));
}

/** 변동성 0–100. 두 축 합의 절반 — 클수록 게이지가 크게 요동친다. */
export function volatility(abandonment: number, intimacyThreat: number): number {
  return (abandonment + intimacyThreat) / 2;
}

/** 현재 안정감이 허용하는 친밀도 레벨 (1~5). */
export function allowedIntimacy(security: number): number {
  return Math.min(5, Math.max(1, 1 + Math.floor(security / 25)));
}

/** 애착 4분면 — 상태 대사·기분 스크립트 선별의 기준 */
export type AttachQuadrant = 'secure' | 'clingy' | 'avoidant' | 'chaotic';

/**
 * 4분면 분류:
 * - 두 축이 비슷(균형): 합산 낮으면 secure(안정), 높으면 chaotic(혼란)
 * - 크게 차이: 유기불안이 크면 clingy(집착), 친밀위협이 크면 avoidant(회피)
 */
export function attachQuadrant(
  abandonment: number,
  intimacyThreat: number,
): AttachQuadrant {
  const diff = abandonment - intimacyThreat;
  if (Math.abs(diff) < BALANCE.ATTACH_BALANCED_GAP) {
    return abandonment + intimacyThreat >= BALANCE.ATTACH_CHAOTIC_SUM
      ? 'chaotic'
      : 'secure';
  }
  return diff > 0 ? 'clingy' : 'avoidant';
}

export interface IntimacyOutcome {
  /** 잠수 발동 여부 */
  retreat: boolean;
  abandonmentDelta: number;
  intimacyThreatDelta: number;
}

/**
 * 친밀 접근 1회 판정 (파생 안정감 기준):
 * - 허용치 이내(거리 존중·적정) → 두 축 동시 진정 (관계가 조금씩 안정)
 * - 허용치 +1 (가벼운 초과) → 변화 없음
 * - 허용치 +RETREAT_GAP 이상 (과한 접근) → 친밀위협 상승, 확률적 잠수
 *   (변동성이 높을수록 잠수 확률이 커진다)
 */
export function intimacyOutcome(
  abandonment: number,
  intimacyThreat: number,
  intimacy: number,
  rng: Rng,
): IntimacyOutcome {
  const security = derivedSecurity(abandonment, intimacyThreat);
  const gap = intimacy - allowedIntimacy(security);
  if (gap <= 0) {
    return {
      retreat: false,
      abandonmentDelta: -BALANCE.ATTACH_SOOTHE,
      intimacyThreatDelta: -BALANCE.ATTACH_SOOTHE,
    };
  }
  if (gap < BALANCE.RETREAT_GAP) {
    return { retreat: false, abandonmentDelta: 0, intimacyThreatDelta: 0 };
  }
  const vol = volatility(abandonment, intimacyThreat);
  const retreatProb =
    BALANCE.RETREAT_PROB * (1 + BALANCE.RETREAT_VOL_SCALE * (vol / 100));
  return {
    retreat: rng() < retreatProb,
    abandonmentDelta: 0,
    intimacyThreatDelta: BALANCE.ATTACH_THREAT_UP,
  };
}

/**
 * 위기 루프 한 턴 (병간호·잠수 공통): 두 축을 균형점(중간값)으로 CONVERGE_STEP만큼 수렴.
 * 잠수(회피 극단)는 친밀위협↓·유기불안↑, 병간호(불안 극단)는 유기불안↓·친밀위협↑ —
 * 둘 다 중간값 수렴이라 한 함수로 처리한다. 2~3턴이면 |차| < RETURN_GAP.
 */
export function convergeStep(
  abandonment: number,
  intimacyThreat: number,
): { abandonment: number; intimacyThreat: number } {
  const mid = (abandonment + intimacyThreat) / 2;
  const toward = (v: number) => {
    if (v > mid) return Math.max(mid, v - BALANCE.CONVERGE_STEP);
    if (v < mid) return Math.min(mid, v + BALANCE.CONVERGE_STEP);
    return v;
  };
  return { abandonment: toward(abandonment), intimacyThreat: toward(intimacyThreat) };
}

/** 위기 루프에서 벗어날 만큼 두 축이 수렴했는가 (복귀 조건). */
export function isBalanced(abandonment: number, intimacyThreat: number): boolean {
  return Math.abs(abandonment - intimacyThreat) < BALANCE.ATTACH_RETURN_GAP;
}
