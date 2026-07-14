import { BALANCE } from './balance';
import type { Rng } from './rng';

/** 현재 안정감이 허용하는 친밀도 레벨 (1~5). */
export function allowedIntimacy(security: number): number {
  return Math.min(5, Math.max(1, 1 + Math.floor(security / 25)));
}

export interface IntimacyOutcome {
  /** 잠수 발동 여부 */
  retreat: boolean;
  /** 안정감 증감량 */
  securityDelta: number;
}

/**
 * 친밀 접근 판정:
 * - 허용치 이내 → 안정감 소폭 상승
 * - 허용치 +1 (가벼운 초과) → 변화 없음
 * - 허용치 +RETREAT_GAP 이상 (과한 접근) → 안정감 하락, 확률적으로 잠수 발동
 */
export function intimacyOutcome(
  security: number,
  intimacy: number,
  rng: Rng,
): IntimacyOutcome {
  const gap = intimacy - allowedIntimacy(security);
  if (gap <= 0) {
    return { retreat: false, securityDelta: BALANCE.SECURITY_GAIN_MATCHED };
  }
  if (gap < BALANCE.RETREAT_GAP) {
    return { retreat: false, securityDelta: 0 };
  }
  return {
    retreat: rng() < BALANCE.RETREAT_PROB,
    securityDelta: -BALANCE.SECURITY_LOSS_BREACH,
  };
}
