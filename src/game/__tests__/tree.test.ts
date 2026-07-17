import { describe, expect, it } from 'vitest';
import { companionMet, treeDays, treeStage } from '../tree';
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
function session(
  s: GameState,
  at: number,
  rng?: Rng,
  focusMin = 1,
): GameState {
  return run(
    s,
    [
      { type: 'START_FOCUS', nowMs: at },
      { type: 'TICK', dtSec: focusMin * 60 },
      { type: 'END_FOCUS', nowMs: at + focusMin * 60_000 },
    ],
    rng ?? seq([0.9]),
  );
}
const FULL = 90; // 시간 보너스를 꽉 채우는 세션 (분)
/** n일 연속으로 하루 한 번 90분 세션 — 매일 성실히 오는 플레이어 */
function daily(s: GameState, days: number): GameState {
  let cur = s;
  for (let d = 0; d < days; d++) {
    cur = session({ ...cur, phase: 'actionSelect' }, T0 + d * DAY, undefined, FULL);
  }
  return cur;
}
const finds = (s: GameState) =>
  Object.keys(s.memory).filter((k) => k.startsWith('tree-'));

describe('treeStage — 나무일 = 경과일 + 동행일 (M15b)', () => {
  it('단계 경계: 0개화/3열매/7각성기/30무성/90울창/180성목', () => {
    const p = T0;
    expect(treeStage(p, 0, p)).toBe(0);
    expect(treeStage(p, 0, p + 2 * DAY)).toBe(0);
    expect(treeStage(p, 0, p + 3 * DAY)).toBe(1);
    expect(treeStage(p, 0, p + 7 * DAY)).toBe(2);
    expect(treeStage(p, 0, p + 30 * DAY)).toBe(3);
    expect(treeStage(p, 0, p + 90 * DAY)).toBe(4);
    expect(treeStage(p, 0, p + 180 * DAY)).toBe(5);
  });

  it('동행일이 나무일에 가산된다 — 함께한 날은 이틀', () => {
    const p = T0;
    expect(treeDays(p, 2, p + 1 * DAY)).toBe(3);
    expect(treeStage(p, 2, p + 1 * DAY)).toBe(1); // 경과 1 + 동행 2 = 열매
  });
});

describe('나무 발견 — 전조→열매→흔들림→각성 체인 (M15b)', () => {
  it('심은 지 0일: 첫 발견은 전조(부푼 꽃자리)', () => {
    const s = session(planted(0), T0);
    expect('tree-fruit-swell' in s.memory).toBe(true);
    // 같은 날 두 번째 세션 — 더 발견되지 않는다
    const again = session({ ...s, phase: 'actionSelect' }, T0 + 3_600_000);
    expect(finds(again)).toHaveLength(1);
  });

  it('매일 오는 플레이어: 나흘째에 각성 — 아이를 첫 주에 만난다', () => {
    // 하루 90분: 보너스 +2/일 → day0 전조(2) → day1 열매(5) → day2 흔들림(8) → day3 각성
    const s = daily(planted(0), 4);
    expect('tree-fruit-swell' in s.memory).toBe(true);
    expect('tree-first-fruit' in s.memory).toBe(true);
    expect('tree-fruit-stir' in s.memory).toBe(true);
    expect('tree-awakening' in s.memory).toBe(true);
    expect('tree-awakening' in s.badges).toBe(true);
    expect(s.treeBondDays).toBe(8);
  });

  it('세션을 몰아친 날: 열매와 흔들림을 같은 날, 각성은 다음 날 (하루 상한 2)', () => {
    // 심은 날: 90분×2 — 보너스는 상한 2에서 멈춰 열매(3)에 못 미친다 (전조만)
    let s = session(planted(0), T0, undefined, FULL);
    s = session({ ...s, phase: 'actionSelect' }, T0 + 4 * 3_600_000, undefined, FULL);
    expect(finds(s)).toEqual(['tree-fruit-swell']);
    expect(s.treeBondDays).toBe(2);
    // 다음 날: 세션1에서 열매(나무일 5), 세션2에서 흔들림 — 체인은 하루 1개 제한을 넘는다
    s = session({ ...s, phase: 'actionSelect' }, T0 + DAY, undefined, FULL);
    expect('tree-first-fruit' in s.memory).toBe(true);
    s = session({ ...s, phase: 'actionSelect' }, T0 + DAY + 4 * 3_600_000, undefined, FULL);
    expect('tree-fruit-stir' in s.memory).toBe(true);
    expect('tree-awakening' in s.memory).toBe(false); // 나무일 5 < 7
    // 그다음 날: 각성 — 열매에서 각성까지 하루
    s = session({ ...s, phase: 'actionSelect' }, T0 + 2 * DAY, undefined, FULL);
    expect('tree-awakening' in s.memory).toBe(true);
  });

  it('단계를 건너뛰어도 체인 순서는 지켜진다 — 각성은 열매·흔들림 뒤', () => {
    // 심어놓고 30일 방치 후 복귀: 무성(3)이지만 전조부터 순서대로
    let s = session(planted(30), T0);
    expect('tree-awakening' in s.memory).toBe(false);
    expect('tree-fruit-swell' in s.memory).toBe(true);
    s = session({ ...s, phase: 'actionSelect' }, T0 + DAY);
    expect('tree-first-fruit' in s.memory).toBe(true);
    s = session({ ...s, phase: 'actionSelect' }, T0 + 2 * DAY);
    expect('tree-fruit-stir' in s.memory).toBe(true);
    s = session({ ...s, phase: 'actionSelect' }, T0 + 3 * DAY);
    expect('tree-awakening' in s.memory).toBe(true);
  });

  it('심기 후에는 방문이 오지 않는다 — 돌은 나무가 되었다', () => {
    // rng 0.0 → 방문 확정 조건이지만 planted라 스킵
    const s = run(planted(8), [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.0, 0.9]));
    expect(s.apart.visiting).toBe(false);
  });
});

describe('동행자 (M15b) — 각성 발견을 만난 순간부터', () => {
  it('각성 전에는 나무 나이가 많아도 동행자 대화가 나오지 않는다', () => {
    const s = session(planted(200), T0);
    expect(companionMet(s.memory)).toBe(false);
    const talked = run(s, [{ type: 'TALK' }], seq([0.0, 0.0]));
    const companionTexts = gameData.dialogues.companion.map((l) =>
      (gameData.text[l.textId]?.[0] ?? []).join('\n'),
    );
    expect(companionTexts).not.toContain(talked.rest.talkState!.pages.join('\n'));
  });

  it('각성 후 대화 슬롯에 동행자 풀이 나온다 (회상과 번갈아)', () => {
    let s = daily(planted(0), 4);
    expect(companionMet(s.memory)).toBe(true);
    s = run(s, [{ type: 'TALK' }], seq([0.0, 0.0]));
    const companionTexts = gameData.dialogues.companion.map((l) =>
      (gameData.text[l.textId]?.[0] ?? []).join('\n'),
    );
    expect(companionTexts).toContain(s.rest.talkState!.pages.join('\n'));
  });

  it('휴식 스킵 시 동행자가 걱정한다 — 돌이 하던 걱정을 이어받아', () => {
    let s = daily(planted(0), 4);
    // 마지막 세션(90분)의 휴식이 끝나기 전에 바로 시작 → 스킵 (restMult 0.5)
    s = run(
      { ...s, phase: 'actionSelect' },
      [{ type: 'START_FOCUS', nowMs: T0 + 3 * DAY + FULL * 60_000 + 60_000 }],
      seq([0.9]),
    );
    expect(
      s.session.journal.some((j) => j.text.includes('작은 아이가 당신의 눈 밑을')),
    ).toBe(true);
  });
});
