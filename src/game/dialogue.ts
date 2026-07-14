import type { Era, GameState } from './types';
import type { DialogueLine, DialoguesData } from '../data/schema';
import { checkCondition } from './conditions';
import type { Rng } from './rng';

export interface DialoguePool {
  poolId: string;
  lines: DialogueLine[];
}

/**
 * 현재 상태의 대화 풀 선택:
 * - 육성: 파생 욕구 단계별 풀
 * - 동거: 의존도 구간별 단계 풀 (화자의 깨달음이 강해진다)
 * - apart: 풀 대신 회상/방문 대화가 별도 처리되므로 null
 */
export function selectDialoguePool(
  dialogues: DialoguesData,
  era: Era,
  needsLevel: number,
  dependence: number,
): DialoguePool | null {
  if (era === 'apart') return null;
  if (era === 'cohabit') {
    let idx = -1;
    for (let i = 0; i < dialogues.cohabitStages.length; i++) {
      if (dependence >= dialogues.cohabitStages[i].minDependence) idx = i;
    }
    if (idx < 0) return { poolId: 'cohabit0', lines: [] };
    return { poolId: `cohabit${idx}`, lines: dialogues.cohabitStages[idx].lines };
  }
  const poolId = `stage${needsLevel}`;
  const pools: Record<string, DialogueLine[]> = {
    stage1: dialogues.stage1,
    stage2: dialogues.stage2,
    stage3: dialogues.stage3,
    stage4: dialogues.stage4,
    stage5: dialogues.stage5,
  };
  return { poolId, lines: pools[poolId] ?? [] };
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
