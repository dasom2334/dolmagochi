/**
 * 도감 (M11a) — 뱃지 판정·정산과 추억 순간(moment) 추첨.
 * 원칙: 숫자 비노출(획득 여부·문구만), 미획득분은 존재 자체 비노출.
 * 뱃지 판정은 1차 토큰 게이트(stateMachine.hasEndingTokens)와 같은
 * 재료(memory·milestones·crisisArcs·relationTier)를 단일 소스로 공유한다.
 */
import type { BadgeDef, MomentDef } from '../data/schema';
import type { GameState } from './types';
import { checkCondition } from './conditions';
import type { Rng } from './rng';

/** 뱃지 획득 조건 충족 여부 — BadgeWhen 필드 하나로 판정 */
export function badgeEarned(def: BadgeDef, state: GameState): boolean {
  const w = def.when;
  if (w.token !== undefined) return w.token in state.memory;
  if (w.tokenPrefix !== undefined)
    return Object.keys(state.memory).some((k) => k.startsWith(w.tokenPrefix!));
  if (w.milestone !== undefined)
    return state.milestonesFired.includes(w.milestone);
  if (w.crisisArc !== undefined)
    return state.crisisArcsFired.includes(w.crisisArc);
  if (w.minTier !== undefined) return state.relationTier >= w.minTier;
  if (w.quadrantSeen !== undefined)
    return state.quadrantsSeen.includes(w.quadrantSeen);
  if (w.minLetGo !== undefined) return state.letGoCount >= w.minLetGo;
  if (w.bloomSeen !== undefined) return state.bloomSeen === w.bloomSeen;
  if (w.balancedSeen !== undefined) return state.balancedSeen === w.balancedSeen;
  if (w.planted !== undefined) return state.planted === w.planted;
  return false;
}

/**
 * 뱃지 정산 — 새로 충족된 뱃지에 최초 획득 시각을 스탬프한다 (1회성, 멱등).
 * nowMs를 가진 이벤트 뒤에 호출된다 — TALK처럼 시각이 없는 이벤트의 획득은
 * 다음 시각 이벤트에서 정산된다 (도감 정렬용 시각이라 지연은 무해).
 */
export function settleBadges(
  state: GameState,
  defs: readonly BadgeDef[],
  nowMs: number,
): GameState {
  let badges: GameState['badges'] | null = null;
  for (const def of defs) {
    if (def.id in state.badges) continue;
    if (!badgeEarned(def, state)) continue;
    badges = badges ?? { ...state.badges };
    badges[def.id] = { at: nowMs };
  }
  return badges ? { ...state, badges } : state;
}

/** 획득한 뱃지만, 획득 시각 순 — 미획득분은 존재 자체를 돌려주지 않는다 */
export function acquiredBadges(
  defs: readonly BadgeDef[],
  state: GameState,
): { def: BadgeDef; at: number }[] {
  return defs
    .filter((d) => d.id in state.badges)
    .map((d) => ({ def: d, at: state.badges[d.id].at }))
    .sort((a, b) => a.at - b.at);
}

/**
 * 추억 순간 추첨 (M11a):
 * - 집중 세션(restAct 미지정): when 조건(현재 행동·배치 소품 등) 통과분만 후보
 * - 휴식 작은 행동(restAct 지정): 그 행동 키의 순간만 후보
 * - 이미 기록된 추억은 제외 (추억은 1회성) — 없으면 null
 */
export function pickMoment(
  defs: readonly MomentDef[],
  state: GameState,
  rng: Rng,
  restAct?: string,
): MomentDef | null {
  const recorded = new Set(state.remembrances.map((r) => r.id));
  const cands = defs.filter((d) => {
    if (recorded.has(d.id)) return false;
    if (restAct !== undefined) return d.restAct === restAct;
    return d.restAct === undefined && checkCondition(d.when, state);
  });
  if (cands.length === 0) return null;
  const total = cands.reduce((a, d) => a + (d.weight ?? 1), 0);
  let r = rng() * total;
  for (const d of cands) {
    r -= d.weight ?? 1;
    if (r <= 0) return d;
  }
  return cands[cands.length - 1];
}
