/**
 * 3차 — 나무 (M15). 성장은 달력이, 목격은 플레이가 (개정 v4 §5).
 * 심은 시각(plantedAt)부터 실제 날짜로 자라며, 집중세션은 필요 없다.
 * 미세 변화(발견)는 접속해 세션을 마친 날에만 하루 1개 기록된다.
 */
import { BALANCE } from './balance';

/** 0 심음 / 1 활착 / 2 어린나무 / 3 자람 / 4 무성(열매) / 5 성목 */
export type TreeStage = 0 | 1 | 2 | 3 | 4 | 5;

export function treeDays(plantedAt: number, nowMs: number): number {
  return Math.max(0, Math.floor((nowMs - plantedAt) / 86_400_000));
}

export function treeStage(plantedAt: number, nowMs: number): TreeStage {
  const d = treeDays(plantedAt, nowMs);
  const bounds = BALANCE.TREE_STAGE_DAYS;
  let stage = 0;
  for (let i = 0; i < bounds.length; i++) if (d >= bounds[i]) stage = i;
  return stage as TreeStage;
}

/** 동행자(씨앗의 각성) — 무성(열매) 단계부터 곁에 있다 */
export function companionAwake(plantedAt: number | null, nowMs: number): boolean {
  return plantedAt !== null && treeStage(plantedAt, nowMs) >= 4;
}
