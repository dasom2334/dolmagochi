import { BALANCE } from './balance';
import { NEED_ORDER, type GameState, type NeedId, type TextId } from './types';
import type { ReflectionDef } from '../data/schema';
import { drawMemory, resolveReflection } from './memory';
import type { Rng } from './rng';

/**
 * 개인작업(자아실현) 확률 기본항 — 욕구 4종 평균이 높을수록 상승.
 * 개정 v4-3: 판정은 END_FOCUS에서 세션당 1회, 최종 확률은
 * (이 값 + 아이템 가산) × min(집중분,90)/90 — 시간 비례라 짧은 세션 스팸이 무의미하다.
 */
export function personalWorkProb(needs: Record<NeedId, number>): number {
  const avg = NEED_ORDER.reduce((a, n) => a + needs[n], 0) / NEED_ORDER.length;
  return (
    BALANCE.PERSONAL_WORK_BASE +
    BALANCE.PERSONAL_WORK_SCALE * (avg / BALANCE.STAT_MAX)
  );
}

/**
 * 돌봄 대상 욕구 (개정 v4-5, 게이트 정합): 아래에서부터 첫 번째로
 * NEED_RISE_GATE(80) 미만인 욕구 — 그 욕구만 상승 게이트를 통과할 수 있다.
 * 전부 80 이상이면 null (돌은 하고 싶은 일을 한다).
 */
export function careTargetNeed(needs: Record<NeedId, number>): NeedId | null {
  for (const need of NEED_ORDER) {
    if (needs[need] < BALANCE.NEED_RISE_GATE) return need;
  }
  return null;
}

/**
 * 자가 충족(selfCare) 확률 — 돌이 대상 욕구를 스스로 채울 확률.
 * B4/B4-1: 최우선 욕구(생리)가 절반 미만이면 무조건(1.0, 매슬로 최우선),
 * 그 외엔 전단계(아래 욕구들) 평균 충족도에 비례하되 바닥값 아래로는 안 내려간다.
 *   p = max(FLOOR, avg(전단계)/100)   (전단계가 없으면 FLOOR)
 */
export function selfCareProb(needs: Record<NeedId, number>, target: NeedId): number {
  const idx = NEED_ORDER.indexOf(target);
  if (idx <= 0) {
    return needs[target] < BALANCE.FREE_URGENT_THRESHOLD
      ? 1
      : BALANCE.FREE_SELF_CARE_PROB;
  }
  const prev = NEED_ORDER.slice(0, idx);
  const avg = prev.reduce((a, n) => a + needs[n], 0) / prev.length;
  return Math.max(BALANCE.FREE_SELF_CARE_PROB, avg / BALANCE.STAT_MAX);
}

export type FreeActionResult =
  | {
      type: 'selfCare';
      need: NeedId;
      /** 돌이 스스로 한 행동 id (해금 게이팅 통과분). 센티널 'self'는 게이팅 미사용 */
      via?: string;
      textId: TextId;
    }
  | {
      /** 욕구가 다 차 있을 때 돌이 제 마음대로 하는 행동 — 게이지 없음, 서술·기억만 */
      type: 'idle';
      via: string;
      textId: TextId;
    }
  | { type: 'reflection'; textId: TextId; memory: GameState['memory'] }
  | { type: 'default'; textId: TextId | null };

function tokenReflection(
  defs: ReflectionDef[],
  token: string,
  state: GameState,
  rng: Rng,
): TextId | null {
  const def = defs.find((d) => d.token === token);
  return def ? resolveReflection(def, state, rng) : null;
}

/**
 * 자유행동 틱 1회 (개정 v4-6 — 돌이 실제 해금 행동을 선택·실행한다):
 * - 돌봄 대상 욕구(80 미만 첫 욕구)가 있으면 그 욕구를 채우는 **해금된 행동**으로
 *   자가 충족한다 — 돌은 함께 아는 행동만 스스로 한다. 없으면 반추로 폴백.
 * - 전부 80 이상이면 해금 행동 중 하나를 제 마음대로 한다(idle — 서술·기억만).
 *   ※ 개인작업 판정은 여기가 아니라 END_FOCUS 세션당 1회 (개정 v4-3).
 * - 그 외 기억 반추 → 기본값(누워 있기)
 */
export function pickFreeAction(
  state: GameState,
  defs: ReflectionDef[],
  rng: Rng,
  /** 이 욕구를 채우는 해금된 행동 id 목록 — 호출부(stateMachine)가 게이팅을 제공.
   *  기본값은 허용 센티널(순수 로직 단독 테스트 편의). */
  selfCareDoers: (need: NeedId) => string[] = () => ['self'],
  /** 욕구가 다 차 있을 때 고를 수 있는 해금 행동 전체 (idle용) */
  idleDoers: () => string[] = () => [],
): FreeActionResult {
  const needs = state.stats.needs;
  const target = careTargetNeed(needs);
  if (target === null) {
    const pool = idleDoers();
    if (pool.length > 0 && rng() < BALANCE.FREE_SELF_CARE_PROB) {
      const via = pool[Math.floor(rng() * pool.length)];
      const textId =
        tokenReflection(defs, `selfCareVia-${via}`, state, rng) ??
        tokenReflection(defs, 'default', state, rng);
      if (textId !== null) return { type: 'idle', via, textId };
    }
  } else {
    const doers = selfCareDoers(target);
    if (doers.length > 0 && rng() < selfCareProb(needs, target)) {
      const via = doers[Math.floor(rng() * doers.length)];
      // 행동 맛이 나는 문구 우선(selfCareVia-{행동}), 없으면 욕구별 기본 문구
      const textId =
        tokenReflection(defs, `selfCareVia-${via}`, state, rng) ??
        tokenReflection(defs, `selfCare-${target}`, state, rng);
      if (textId !== null) return { type: 'selfCare', need: target, via, textId };
    }
  }
  const draw = drawMemory(state.memory, defs, state, rng);
  if (draw) return { type: 'reflection', textId: draw.textId, memory: draw.memory };
  return { type: 'default', textId: tokenReflection(defs, 'default', state, rng) };
}
