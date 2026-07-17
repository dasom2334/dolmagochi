import { describe, expect, it } from 'vitest';
import { companionAwake, treeStage } from '../tree';
import { createInitialState, transition } from '../stateMachine';
import type { GameEvent, GameState } from '../types';
import { mulberry32, type Rng } from '../rng';
import { gameData } from '../../store/gameStore';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();
const DAY = 86_400_000;

function seq(values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
function run(s: GameState, events: GameEvent[], rng: Rng = mulberry32(1)): GameState {
  return events.reduce((st, e) => transition(st, e, { rng, data: gameData }), s);
}
/** 심은 뒤 d일째의 3차 상태 */
function planted(daysAgo: number): GameState {
  return {
    ...createInitialState(T0 - daysAgo * DAY, 'lie'),
    era: 'apart',
    phase: 'actionSelect',
    planted: true,
    plantedAt: T0 - daysAgo * DAY,
    letGoCount: 1,
    bloomSeen: true,
    sproutGrowth: 100,
  };
}
function session(s: GameState, at: number, rng?: Rng): GameState {
  return run(
    s,
    [{ type: 'START_FOCUS', nowMs: at }, { type: 'END_FOCUS', nowMs: at + 60_000 }],
    rng ?? seq([0.9]),
  );
}

describe('treeStage — 성장은 달력이 (M15)', () => {
  it('단계 경계: 0심음/7활착/30어린나무/100자람/200무성/365성목', () => {
    const p = T0;
    expect(treeStage(p, p)).toBe(0);
    expect(treeStage(p, p + 6 * DAY)).toBe(0);
    expect(treeStage(p, p + 7 * DAY)).toBe(1);
    expect(treeStage(p, p + 30 * DAY)).toBe(2);
    expect(treeStage(p, p + 100 * DAY)).toBe(3);
    expect(treeStage(p, p + 200 * DAY)).toBe(4);
    expect(treeStage(p, p + 365 * DAY)).toBe(5);
    expect(companionAwake(p, p + 199 * DAY)).toBe(false);
    expect(companionAwake(p, p + 200 * DAY)).toBe(true);
  });
});

describe('나무 발견 — 목격은 플레이가 (M15)', () => {
  it('세션을 마친 날 하루 1개, 단계 게이트·이벤트형 우선', () => {
    // 심은 지 8일: 활착(1) — first-leaf만 후보 (겨울이라 snow-branch도 후보)
    let s = session(planted(8), T0);
    // 겨울(T0=1월): snow-branch(minStage 1)와 first-leaf(1) 중 정렬 동률 — 하나 발견
    const found = Object.keys(s.memory).filter((k) => k.startsWith('tree-'));
    expect(found).toHaveLength(1);
    expect(s.lastTreeFindDate).not.toBeNull();
    // 같은 날 두 번째 세션 — 더 발견되지 않는다
    const again = session({ ...s, phase: 'actionSelect' }, T0 + 3_600_000);
    expect(
      Object.keys(again.memory).filter((k) => k.startsWith('tree-')),
    ).toHaveLength(1);
    // 다음 날 — 남은 후보 발견
    const next = session({ ...again, phase: 'actionSelect' }, T0 + DAY);
    expect(
      Object.keys(next.memory).filter((k) => k.startsWith('tree-')),
    ).toHaveLength(2);
  });

  it('무성 도달: 첫날 열매, 다음 날 각성 — 열매에서 씨앗이 나온다 (서사 순서)', () => {
    const day1 = session(planted(200), T0);
    expect('tree-first-fruit' in day1.memory).toBe(true);
    const day2 = session({ ...day1, phase: 'actionSelect' }, T0 + DAY);
    expect('tree-awakening' in day2.memory).toBe(true);
    expect('tree-awakening' in day2.badges).toBe(true);
  });

  it('심기 후에는 방문이 오지 않는다 — 돌은 나무가 되었다', () => {
    // rng 0.0 → 방문 확정 조건이지만 planted라 스킵
    const s = run(planted(8), [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.0, 0.9]));
    expect(s.apart.visiting).toBe(false);
  });
});

describe('동행자 (M15) — 씨앗의 각성 이후', () => {
  it('각성 후 대화 슬롯에 동행자 풀이 나온다 (회상과 번갈아)', () => {
    let s = session(planted(210), T0);
    // rng 0.0 → 동행자 풀 선택
    s = run(s, [{ type: 'TALK' }], seq([0.0, 0.0]));
    const companionTexts = gameData.dialogues.companion.map((l) =>
      (gameData.text[l.textId]?.[0] ?? []).join('\n'),
    );
    expect(companionTexts).toContain(s.rest.talkState!.pages.join('\n'));
  });

  it('휴식 스킵 시 동행자가 걱정한다 — 돌이 하던 걱정을 이어받아', () => {
    let s = session(planted(210), T0);
    // 휴식 스킵으로 바로 시작 (restMult 0.5)
    s = run(
      { ...s, phase: 'actionSelect' },
      [{ type: 'START_FOCUS', nowMs: T0 + 60_000 }],
      seq([0.9]),
    );
    expect(
      s.session.journal.some((j) => j.text.includes('작은 아이가 당신의 눈 밑을')),
    ).toBe(true);
  });
});
