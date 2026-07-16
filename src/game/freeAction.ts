import { BALANCE } from './balance';
import { NEED_ORDER, type GameState, type NeedId, type TextId } from './types';
import type { ReflectionDef } from '../data/schema';
import { drawMemory, resolveReflection } from './memory';
import { firstUnfilledNeed } from './stats';
import type { Rng } from './rng';

/**
 * 개인작업(자아실현) 확률 — 욕구 4종 평균이 높을수록 상승.
 * 단, 판정 자체는 4종 전부 충족일 때만 이루어진다 (호출부 게이트).
 */
export function personalWorkProb(needs: Record<NeedId, number>): number {
  const avg = NEED_ORDER.reduce((a, n) => a + needs[n], 0) / NEED_ORDER.length;
  return (
    BALANCE.PERSONAL_WORK_BASE +
    BALANCE.PERSONAL_WORK_SCALE * (avg / BALANCE.STAT_MAX)
  );
}

/**
 * 자가 충족(selfCare) 확률 — 돌이 첫 미충족 욕구를 스스로 채울 확률.
 * B4/B4-1: 최우선 욕구(생리)가 절반 미만이면 무조건(1.0, 매슬로 최우선),
 * 그 외엔 전단계(아래 욕구들) 평균 충족도에 비례하되 바닥값 아래로는 안 내려간다.
 *   p = max(FLOOR, avg(전단계)/100)   (전단계가 없으면 FLOOR)
 * 전단계가 많이 차 있을수록 돌이 다음 욕구를 적극적으로 채운다.
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
  | { type: 'personalWork'; textId: TextId }
  | {
      type: 'selfCare';
      need: NeedId;
      /** 돌이 스스로 한 행동 id (해금 게이팅 통과분). 센티널 'self'는 게이팅 미사용 */
      via?: string;
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
 * 자유행동 틱 1회 (순차성):
 * - 욕구 4종 전부 충족 → 개인작업 확률 판정 (allowPersonalWork일 때만 — 동거 중엔 정지)
 * - 미충족이 있으면 아래에서부터 첫 미충족 욕구만 스스로 채울 수 있다 (selfCare).
 *   단, 그 욕구를 채우는 **해금된 행동**이 있어야 한다 — 돌은 함께 아는 행동만
 *   스스로 한다 (예: 신발이 있어야 혼자 산책 기색을 낸다). 없으면 반추로 폴백.
 * - 그 외 기억 반추 → 기본값(누워 있기)
 */
export function pickFreeAction(
  state: GameState,
  defs: ReflectionDef[],
  rng: Rng,
  allowPersonalWork = true,
  /** 상점 아이템(책상 체인·API 토큰)의 개인작업 확률 가산 */
  personalWorkBonus = 0,
  /** 이 욕구를 채우는 해금된 행동 id 목록 — 호출부(stateMachine)가 게이팅을 제공.
   *  기본값은 허용 센티널(순수 로직 단독 테스트 편의). */
  selfCareDoers: (need: NeedId) => string[] = () => ['self'],
): FreeActionResult {
  const needs = state.stats.needs;
  const target = firstUnfilledNeed(needs);
  if (target === null) {
    if (allowPersonalWork && rng() < personalWorkProb(needs) + personalWorkBonus) {
      const textId = tokenReflection(defs, 'personalWork', state, rng);
      if (textId !== null) return { type: 'personalWork', textId };
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
