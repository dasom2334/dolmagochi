import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { sproutStageOf } from '../sprout';
import { createInitialState, transition } from '../stateMachine';
import type { GameEvent, GameState } from '../types';
import { mulberry32, type Rng } from '../rng';
import { gameData } from '../../store/gameStore';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

function seq(values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
function run(s: GameState, events: GameEvent[], rng: Rng = mulberry32(1)): GameState {
  return events.reduce((st, e) => transition(st, e, { rng, data: gameData }), s);
}
const apartAt = (growth: number): GameState => ({
  ...createInitialState(T0, 'lie'),
  era: 'apart',
  phase: 'actionSelect',
  sproutGrowth: growth,
  // 단계 게이트(피드백5)는 이 파일의 관심사가 아니다 — 이미 통과한 것으로 둔다
  sproutGatesCleared: BALANCE.SPROUT_GATES.filter((g) => growth >= g).length,
});
const session = (s: GameState, rng?: Rng) =>
  run(
    s,
    [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'TICK', dtSec: 50 * 60 },
      { type: 'END_FOCUS', nowMs: T0 + 50 * 60_000 },
    ],
    rng ?? seq([0.9]),
  );

describe('새싹 전조 (M19b) — 1차 티어 6부터', () => {
  it('sproutStageOf: 티어 6 미만 없음 → 6부터 budding', () => {
    const base = createInitialState(T0, 'lie');
    expect(sproutStageOf({ ...base, relationTier: 5 }, gameData.dialogues)).toBeNull();
    expect(sproutStageOf({ ...base, relationTier: 6 }, gameData.dialogues)).toBe('budding');
  });

  it('minTier 마일스톤: 티어 6 도달 시 새싹 전조 발화 (1회)', () => {
    const base = createInitialState(T0, 'lie');
    let s: GameState = { ...base, relationTier: 6, phase: 'rest' };
    s = run(s, [{ type: 'TALK' }], seq([0.9, 0.0]));
    expect(s.milestonesFired).toContain('sprout-hint');
    expect(s.rest.talkState?.kind).toBe('milestone');
  });
});

describe('뿌리내림기 (M19b, v5 §6)', () => {
  it('단계: 50부터 rooting1, 85부터 rooting2 — apart/cohabit 공통, 불가역 우선', () => {
    expect(sproutStageOf(apartAt(49), gameData.dialogues)).toBe('thriving');
    expect(sproutStageOf(apartAt(50), gameData.dialogues)).toBe('rooting1');
    expect(sproutStageOf(apartAt(85), gameData.dialogues)).toBe('rooting2');
    const cohabit = { ...apartAt(60), era: 'cohabit' as const };
    expect(sproutStageOf(cohabit, gameData.dialogues)).toBe('rooting1');
  });

  it('시듦 봉인: 진입 후엔 붙잡기 강제 체류로도 시들지 않는다', () => {
    const held: GameState = {
      ...apartAt(60),
      witherLevel: 2,
      apart: {
        visiting: true,
        visitSessionsLeft: 2,
        leavePending: false,
        holdCount: 1,
        held: true,
      },
    };
    const s = session(held);
    expect(s.witherLevel).toBe(0); // 시듦 소멸 — 잎의 처짐 대신 불가역의 뿌리
  });

  it('잘라내기 이벤트: 진입 후 1회, 예/아니오 모두 거부의 서사', () => {
    let s = session(apartAt(49)); // 이 세션에서 50을 넘는다
    expect(s.sproutGrowth).toBeGreaterThanOrEqual(BALANCE.ROOTING_AT);
    expect(s.rest.talkState?.kind).toBe('rooting');
    expect(s.rest.talkState?.hasChoice).toBe(true);
    expect('rooting-seen' in s.memory).toBe(true);
    // 예(잘라내 본다) → 거부 결과
    const cut = run(s, [{ type: 'TALK_CHOICE', yes: true }]);
    expect(cut.rest.talkState?.pages.join('')).toContain('가위');
    // 다음 세션엔 다시 뜨지 않는다
    const again = session({ ...s, phase: 'actionSelect' });
    expect(again.rest.talkState?.kind).not.toBe('rooting');
  });

  it('뒤덮임 관찰: 85 도달 세션에 무반응 일지 1회', () => {
    const s = session(apartAt(86));
    expect('rooting-still' in s.memory).toBe(true);
    expect(
      s.session.journal.some((j) => j.text.includes('더는 이쪽으로 기울지')),
    ).toBe(true);
    const again = session({ ...s, phase: 'actionSelect' });
    expect(
      again.session.journal.some((j) => j.text.includes('더는 이쪽으로 기울지')),
    ).toBe(false);
  });
});

describe('묘목 단계 게이트 — 한 단계마다 방문 1회 (피드백5)', () => {
  const DAY2 = 86_400_000;
  /** 2차(빈자리) 상태 — 성장 g, 게이트 c개 통과 */
  function gateState(g: number, cleared: number): GameState {
    return {
      ...createInitialState(T0, 'lie'),
      era: 'apart',
      phase: 'actionSelect',
      letGoCount: 1,
      sproutGrowth: g,
      sproutGatesCleared: cleared,
      visitBlockedUntil: null,
    };
  }
  /** 방문이 오지 않는 세션 (rng 1.0 → VISIT_PROB 미달) */
  function soloSession(s: GameState, at: number, min = 90): GameState {
    return run(
      { ...s, phase: 'actionSelect' },
      [
        { type: 'START_FOCUS', nowMs: at },
        { type: 'TICK', dtSec: min * 60 },
        { type: 'END_FOCUS', nowMs: at + min * 60_000 },
      ],
      seq([0.99]),
    );
  }

  it('게이트에 닿으면 성장이 멈춘다 — 혼자서는 다음 단계로 못 간다', () => {
    let s = gateState(BALANCE.SPROUT_GATES[0] - 1, 0);
    for (let i = 0; i < 5; i++) s = soloSession(s, T0 + i * DAY2);
    expect(s.sproutGrowth).toBe(BALANCE.SPROUT_GATES[0]);
    expect(s.sproutGatesCleared).toBe(0);
  });

  it('멈춰 있는 동안 일지가 이유를 알린다 (수치 비노출)', () => {
    let s = gateState(BALANCE.SPROUT_GATES[0], 0);
    s = soloSession(s, T0);
    const waits = gameData.text['sys.journal.gateWait'].map((p) => p.join('\n'));
    expect(s.session.journal.some((j) => waits.includes(j.text))).toBe(true);
  });

  it('방문이 오면 게이트가 열리고 다시 자란다', () => {
    const held = gateState(BALANCE.SPROUT_GATES[0], 0);
    // rng 0.0 → 방문 확정
    const visited = run(
      held,
      [{ type: 'START_FOCUS', nowMs: T0 }],
      seq([0.0, 0.0, 0.9]),
    );
    expect(visited.apart.visiting).toBe(true);
    expect(visited.sproutGatesCleared).toBe(1);
    const opens = gameData.text['sys.journal.gateOpen'].map((p) => p.join('\n'));
    expect(
      visited.session.journal.some((j) => opens.some((o) => j.text.includes(o))),
    ).toBe(true);
    // 방문이 끝난 뒤 세션에서 다시 자란다
    const after = soloSession(
      { ...visited, apart: { ...visited.apart, visiting: false } },
      T0 + DAY2,
    );
    expect(after.sproutGrowth).toBeGreaterThan(BALANCE.SPROUT_GATES[0]);
  });

  it('마지막 게이트(심기)도 방문을 거친다 — 돌 없이 나무가 되지 않는다', () => {
    const last = BALANCE.SPROUT_GATES.length - 1;
    let s = gateState(BALANCE.SPROUT_GATES[last] - 1, last);
    for (let i = 0; i < 3; i++) s = soloSession(s, T0 + i * DAY2);
    // 성장은 100에 닿아도 게이트가 남아 있으면 심기로 넘어가지 않는다
    expect(s.sproutGatesCleared).toBe(last);
  });
});
