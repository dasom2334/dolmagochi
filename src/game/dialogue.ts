import type { Era, GameState } from './types';
import type { DialogueLine, DialoguesData } from '../data/schema';
import { checkCondition } from './conditions';
import { BALANCE } from './balance';
import { acuteQuadrant } from './security';
import type { Rng } from './rng';

export interface DialoguePool {
  poolId: string;
  lines: DialogueLine[];
}

/** 누적 호감도 → 관계 티어 (1~7). AFFECTION_TIERS의 마지막으로 통과한 임계. */
export function affectionTier(affection: number): number {
  let tier = 1;
  for (let i = 0; i < BALANCE.AFFECTION_TIERS.length; i++) {
    if (affection >= BALANCE.AFFECTION_TIERS[i]) tier = i + 1;
  }
  return tier;
}

/**
 * 화자 관찰(확신의 사다리) 인덱스 0~6 — 호감도 7티어와 1:1.
 * 티어마다 고유 관찰 문구를 갖는다 (티어 묶음 공유 없음).
 * (구 세션 수 기반은 호감도 0이어도 몇 세션 만에 '신뢰·좋아함'까지 가버렸다)
 */
export function trustStep(affection: number): number {
  return affectionTier(affection) - 1;
}

/**
 * 현재 상태의 대화 풀 선택:
 * - 육성: 파생 욕구 단계별 풀
 * - 동거: 의존도 구간별 단계 풀 (화자의 깨달음이 강해진다)
 * - apart: 풀 대신 회상/방문 대화가 별도 처리되므로 null
 */
/**
 * 의존도가 도달한 동거 단계 인덱스(0-base). 임계는 cohabitStages[i].minDependence.
 * stages[0].minDependence는 0이라 보통 항상 0 이상이 나오지만, 방어적으로 0으로 하한.
 */
export function cohabitStageIndex(
  stages: readonly { minDependence: number }[],
  dependence: number,
): number {
  let idx = 0;
  for (let i = 0; i < stages.length; i++) {
    if (dependence >= stages[i].minDependence) idx = i;
  }
  return idx;
}

export interface DialogueContext {
  era: Era;
  needsLevel: number;
  dependence: number;
  affection: number;
  abandonment: number;
  intimacyThreat: number;
  /** 안정 상태에서 관계 대사(true) vs 상태 대사(false) 중 무엇을 뽑을지 — 호출부가 코인. */
  preferRelation: boolean;
}

/**
 * 휴식 대화 풀 선택 — 대사 이원화:
 * - apart → null (회상/방문 별도), cohabit → 의존도 구간 풀
 * - 육성 · 애착 불안정(집착/회피/혼란) → 4분면 상태 풀 (돌이 흔들림)
 * - 육성 · 안정 → preferRelation이면 호감도 티어 관계 풀, 아니면 욕구 단계 상태 풀
 *   (위기 중엔 관계가 자라지 않는다 = 불안정이면 관계 풀이 나오지 않는다)
 */
export function selectDialoguePool(
  dialogues: DialoguesData,
  ctx: DialogueContext,
): DialoguePool | null {
  const { era, needsLevel, dependence, affection } = ctx;
  if (era === 'apart') return null;
  if (era === 'cohabit') {
    if (dialogues.cohabitStages.length === 0)
      return { poolId: 'cohabit0', lines: [] };
    const idx = cohabitStageIndex(dialogues.cohabitStages, dependence);
    return { poolId: `cohabit${idx}`, lines: dialogues.cohabitStages[idx].lines };
  }
  const quadrant = acuteQuadrant(ctx.abandonment, ctx.intimacyThreat);
  if (quadrant) {
    return { poolId: `quad_${quadrant}`, lines: dialogues.quadrants[quadrant] };
  }
  if (ctx.preferRelation) {
    const tier = affectionTier(affection);
    return {
      poolId: `relation${tier}`,
      lines: dialogues.relationTiers[tier - 1] ?? [],
    };
  }
  const stagePools: DialogueLine[][] = [
    dialogues.stage1,
    dialogues.stage2,
    dialogues.stage3,
    dialogues.stage4,
    dialogues.stage5,
  ];
  return { poolId: `stage${needsLevel}`, lines: stagePools[needsLevel - 1] ?? [] };
}

export interface NonReplacingDraw {
  index: number;
  used: number[];
}

/**
 * 후보 인덱스 목록에서 비복원 추출. 후보가 모두 소진되면 후보분만 리셋 후 뽑는다.
 * (조건 필터로 후보가 매번 달라질 수 있으므로 poolSize가 아니라 후보 목록을 받는다)
 */
export function drawNonReplacingFrom(
  candidates: readonly number[],
  used: readonly number[],
  rng: Rng,
): NonReplacingDraw | null {
  if (candidates.length === 0) return null;
  let avail = candidates.filter((i) => !used.includes(i));
  let nextUsed = used;
  if (avail.length === 0) {
    // 후보가 모두 소진 → 후보 인덱스만 used에서 비우고 다시 채운다
    nextUsed = used.filter((i) => !candidates.includes(i));
    avail = [...candidates];
  }
  const index = avail[Math.floor(rng() * avail.length)];
  return { index, used: [...nextUsed, index] };
}

/**
 * 비복원 추출: 사용한 인덱스를 피해서 뽑고, 풀이 소진되어 있으면 리셋 후 뽑는다.
 * poolSize 0이면 null.
 */
export function drawNonReplacing(
  poolSize: number,
  used: readonly number[],
  rng: Rng,
): NonReplacingDraw | null {
  if (poolSize <= 0) return null;
  const candidates = Array.from({ length: poolSize }, (_, i) => i);
  return drawNonReplacingFrom(candidates, used, rng);
}

/**
 * 대화 줄 비복원 추출 — when 조건을 만족하는 줄만 후보.
 * (예: 특정 소품을 언급하는 줄은 그 소품이 방에 있을 때만 등장)
 */
export function drawEligibleLine(
  lines: readonly DialogueLine[],
  used: readonly number[],
  state: GameState,
  rng: Rng,
): NonReplacingDraw | null {
  const eligible = lines
    .map((_, i) => i)
    .filter((i) => checkCondition(lines[i].when, state));
  return drawNonReplacingFrom(eligible, used, rng);
}
