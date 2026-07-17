/**
 * 3차 — 나무 (M15, 페이싱 개편 M15b). 성장은 달력+동행이, 목격은 플레이가.
 * 심는 순간 나무는 개화 상태다 — 2차에서 돌 위에 핀 꽃이 그대로 뿌리내린다.
 * 나이는 나무일(tree-days) = 실제 경과일 + 동행일(세션을 마친 날마다 1):
 * 함께한 날은 나무에게 이틀이다. 안 와도 하루는 하루대로 흐른다.
 * 미세 변화(발견)는 접속해 세션을 마친 날에만 하루 1개 기록된다.
 */
import { BALANCE } from './balance';

/** 0 개화 묘목 / 1 열매 / 2 각성기 / 3 무성 / 4 울창 / 5 성목 */
export type TreeStage = 0 | 1 | 2 | 3 | 4 | 5;

export function treeDays(
  plantedAt: number,
  bondDays: number,
  nowMs: number,
): number {
  return (
    Math.max(0, Math.floor((nowMs - plantedAt) / 86_400_000)) +
    Math.max(0, bondDays)
  );
}

export function treeStage(
  plantedAt: number,
  bondDays: number,
  nowMs: number,
): TreeStage {
  const d = treeDays(plantedAt, bondDays, nowMs);
  const bounds = BALANCE.TREE_STAGE_DAYS;
  let stage = 0;
  for (let i = 0; i < bounds.length; i++) if (d >= bounds[i]) stage = i;
  return stage as TreeStage;
}

/** 각성 발견 토큰 — 아이는 단계가 아니라 '만난 순간'부터 곁에 있다 */
export const AWAKENING_TOKEN = 'tree-awakening';

export function companionMet(memory: Readonly<Record<string, unknown>>): boolean {
  return AWAKENING_TOKEN in memory;
}
