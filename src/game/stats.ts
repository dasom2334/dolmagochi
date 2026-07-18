import { BALANCE } from './balance';
import { derivedSecurity } from './security';
import { NEED_ORDER, type NeedId, type Outcome, type Stats } from './types';

export function clampStat(n: number): number {
  return Math.min(BALANCE.STAT_MAX, Math.max(BALANCE.STAT_MIN, n));
}

/** 로컬 달력일 키 "YYYY-MM-DD" */
export function dateKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 두 달력일 키 사이의 일수 (b - a). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round(
    (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000,
  );
}

/**
 * 파생 욕구 단계: 아래 욕구부터 문턱 이상 채워진 데까지.
 * 4종 전부 충족이면 5단계(자아실현 국면).
 */
export function needsLevelOf(needs: Record<NeedId, number>): 1 | 2 | 3 | 4 | 5 {
  let level = 1;
  for (const need of NEED_ORDER) {
    if (needs[need] >= BALANCE.NEED_FILLED_THRESHOLD) level++;
    else break;
  }
  return level as 1 | 2 | 3 | 4 | 5;
}

/** 정성적 표시용 욕구 밴드: 0 부족 / 1 중간 / 2 충족 — 숫자 비노출 UI가 어휘를 고르는 기준 */
export function needsBand(value: number): 0 | 1 | 2 {
  if (value >= BALANCE.NEED_FILLED_THRESHOLD) return 2;
  return value >= BALANCE.NEED_FILLED_THRESHOLD / 2 ? 1 : 0;
}

/** 아래에서부터 첫 미충족 욕구 (전부 충족이면 null) — 자유행동 순차성의 기준 */
export function firstUnfilledNeed(needs: Record<NeedId, number>): NeedId | null {
  for (const need of NEED_ORDER) {
    if (needs[need] < BALANCE.NEED_FILLED_THRESHOLD) return need;
  }
  return null;
}

export interface SettleResult {
  stats: Stats;
  lastDecayDate: string;
  /** 이번 정산으로 욕구 단계가 내려갔는가 */
  regressed: boolean;
}

/**
 * 달력일 정산: 방치 일수 문턱마다 최상위 충족 욕구 게이지 하락
 * (→ 파생 단계가 자연히 내려간다). 같은 날 재호출은 아무 것도 하지 않는다(멱등).
 * 돌은 죽지 않는다. (기분 감쇠는 M17에서 삭제 — mood 자체가 없어짐)
 */
export function settleCalendar(
  stats: Stats,
  lastDecayDate: string,
  lastSessionEndAt: number | null,
  nowMs: number,
): SettleResult {
  const today = dateKey(nowMs);
  const elapsed = daysBetween(lastDecayDate, today);
  if (elapsed <= 0) return { stats, lastDecayDate, regressed: false };

  const next: Stats = { ...stats, needs: { ...stats.needs } };

  const levelBefore = needsLevelOf(next.needs);
  if (lastSessionEndAt !== null) {
    const sessionDay = dateKey(lastSessionEndAt);
    const idleTotal = Math.max(0, daysBetween(sessionDay, today));
    const idleSettled = Math.max(0, daysBetween(sessionDay, lastDecayDate));
    const steps =
      Math.floor(idleTotal / BALANCE.NEGLECT_DAYS_PER_REGRESS) -
      Math.floor(idleSettled / BALANCE.NEGLECT_DAYS_PER_REGRESS);
    for (let i = 0; i < steps; i++) {
      const topFilled = [...NEED_ORDER]
        .reverse()
        .find((n) => next.needs[n] >= BALANCE.NEED_FILLED_THRESHOLD);
      if (!topFilled) break; // 이미 1단계 — 더 내려갈 곳 없음
      next.needs[topFilled] = clampStat(
        next.needs[topFilled] - BALANCE.NEED_REGRESS_AMOUNT,
      );
    }
    // 방치는 유기불안을 키운다 (오래 안 오면 돌이 불안해진다) → 안정감 재계산
    if (steps > 0) {
      next.abandonment = clampStat(
        next.abandonment + BALANCE.NEGLECT_ABANDONMENT_PER_STEP * steps,
      );
      next.security = derivedSecurity(next.abandonment, next.intimacyThreat);
    }
  }
  return {
    stats: next,
    lastDecayDate: today,
    regressed: needsLevelOf(next.needs) < levelBefore,
  };
}

/**
 * 욕구 상승 게이트 (개정 v4-5): 욕구 n+1의 양수 델타는 욕구 n이
 * NEED_RISE_GATE(80) 이상일 때만 통과한다. 음수 델타(감소·퇴행)는 항상 적용.
 * 위기 루프 중엔 호출부가 gate=false로 면제한다.
 */
function gatedNeedDelta(
  needs: Record<NeedId, number>,
  need: NeedId,
  delta: number,
): number {
  if (delta <= 0) return delta;
  const idx = NEED_ORDER.indexOf(need);
  if (idx <= 0) return delta;
  const prev = NEED_ORDER[idx - 1];
  return needs[prev] >= BALANCE.NEED_RISE_GATE ? delta : 0;
}

/**
 * 욕구 델타 묶음을 게이트 적용해 반영 (개정 v4-5) — END_FOCUS의 아이템 보너스·
 * 자가충족 정산처럼 Outcome을 거치지 않는 경로도 같은 게이트를 지나게 한다.
 */
export function applyNeedsGated(
  needs: Record<NeedId, number>,
  deltas: Partial<Record<NeedId, number>>,
  gate = true,
): Record<NeedId, number> {
  const next = { ...needs };
  for (const need of NEED_ORDER) {
    const delta = deltas[need];
    if (delta === undefined) continue;
    const applied = gate ? gatedNeedDelta(next, need, delta) : delta;
    next[need] = clampStat(next[need] + applied);
  }
  return next;
}

/**
 * 욕구 시간 비례 감소 (개정 v4-5): 집중 h당 욕구별 차등 하락 — 로테이션 유도.
 * END_FOCUS에서 게이지 정산 후 호출한다. apart 시대엔 호출하지 않는다.
 */
export function decayNeeds(
  needs: Record<NeedId, number>,
  hours: number,
): Record<NeedId, number> {
  const next = { ...needs };
  for (const need of NEED_ORDER) {
    const rate = BALANCE.NEED_DECAY_PER_HOUR[need] ?? 0;
    next[need] = clampStat(next[need] - rate * hours);
  }
  return next;
}

/** Outcome의 stats/needs/selfActualization 부분을 상태에 적용 (클램프). */
export function applyStatOutcome(
  stats: Stats,
  outcome: Outcome | undefined,
  /** 욕구 상승 게이트 적용 여부 — 위기 루프 중엔 false (개정 v4-5) */
  gateNeeds = true,
  /** 애착 축 델타 배율 (M18 attachRate) — 잠복기 축소·개막 후 확대·위기 감쇠 */
  attachScale = 1,
): Stats {
  if (!outcome) return stats;
  const next: Stats = { ...stats, needs: { ...stats.needs } };
  if (outcome.stats) {
    // 애착 2축 태그 적용 → 안정감(파생) 재계산
    next.abandonment = clampStat(
      next.abandonment + (outcome.stats.abandonment ?? 0) * attachScale,
    );
    next.intimacyThreat = clampStat(
      next.intimacyThreat +
        ((outcome.stats.intimacyThreat ?? 0) +
          // 하위호환: 구 security 델타는 부호를 뒤집어 친밀위협에 반영(양=안정↑=위협↓)
          -(outcome.stats.security ?? 0)) *
          attachScale,
    );
    next.security = derivedSecurity(next.abandonment, next.intimacyThreat);
    // B13 호감도 비례 래칫: 안정할수록 상승분이 커진다. 하락 없음.
    // M18: 바닥 0.5 — 축이 상시 살아있는 새 밸런스에서 흔들리는 관계에도
    // 정은 절반은 쌓인다 (래칫 0 붕괴로 페이싱이 밀리는 것 방지)
    const affDelta = outcome.stats.affection ?? 0;
    const scaled =
      affDelta > 0
        ? affDelta * (0.5 + 0.5 * (next.security / BALANCE.STAT_MAX))
        : affDelta;
    next.affection = Math.max(0, next.affection + scaled);
  }
  if (outcome.needs) {
    for (const need of NEED_ORDER) {
      const delta = outcome.needs[need];
      if (delta !== undefined) {
        const applied = gateNeeds
          ? gatedNeedDelta(next.needs, need, delta)
          : delta;
        next.needs[need] = clampStat(next.needs[need] + applied);
      }
    }
  }
  if (outcome.selfActualization) {
    next.selfActualization = clampStat(
      next.selfActualization + outcome.selfActualization,
    );
  }
  return next;
}

export function initialStats(): Stats {
  return {
    affection: 0,
    needs: { physiological: 0, safety: 0, belonging: 0, esteem: 0 },
    abandonment: BALANCE.ABANDONMENT_START,
    intimacyThreat: BALANCE.INTIMACY_THREAT_START,
    security: derivedSecurity(
      BALANCE.ABANDONMENT_START,
      BALANCE.INTIMACY_THREAT_START,
    ),
    selfActualization: 0,
    dependence: 0,
  };
}
