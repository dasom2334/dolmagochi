import { describe, expect, it } from 'vitest';
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

/** 잠수 중 휴식 상태 — 부재 풀에서 특정 줄을 강제로 뽑는다 */
function absentTalk(lineTextId: string): GameState {
  const base = createInitialState(T0, 'lie');
  const idx = gameData.dialogues.absent.findIndex((l) => l.textId === lineTextId);
  expect(idx).toBeGreaterThanOrEqual(0);
  // 해당 줄만 남기고 전부 사용 처리 → 추첨이 그 줄을 뽑는다
  const used = gameData.dialogues.absent.map((_, i) => i).filter((i) => i !== idx);
  const s: GameState = {
    ...base,
    relationTier: 3,
    phase: 'rest',
    presence: {
      state: 'absent',
      plannedSessions: 2,
      lowIntimacyProgress: 0,
      sick: false,
      returnPending: false,
    },
    stats: { ...base.stats, intimacyThreat: 90, abandonment: 20, security: 30 },
    dialogue: { usedByPool: { absent: used } },
  };
  return run(s, [{ type: 'TALK' }], seq([0.0]));
}

describe('위기 대응 선택지 (M19c, A안)', () => {
  it('잠수 중 "문을 열어 둘까": 예 = 위협을 크게 풀고, 아니오 = 완만히', () => {
    const s = absentTalk('dlg.absent.care');
    expect(s.rest.talkState?.hasChoice).toBe(true);
    const before = s.stats.intimacyThreat;
    const yes = run(s, [{ type: 'TALK_CHOICE', yes: true, nowMs: T0 }]);
    const no = run(s, [{ type: 'TALK_CHOICE', yes: false, nowMs: T0 }]);
    expect(yes.stats.intimacyThreat).toBeLessThan(before);
    expect(no.stats.intimacyThreat).toBeLessThan(before);
    expect(yes.stats.intimacyThreat).toBeLessThan(no.stats.intimacyThreat);
    // 결과 서술로 교체된다
    expect(yes.rest.talkState?.done).toBe(true);
  });

  it('잠수 중 "찾아 나설까": 예 = 쫓을수록 물러난다 (위협 상승)', () => {
    const s = absentTalk('dlg.absent.search');
    const before = s.stats.intimacyThreat;
    const yes = run(s, [{ type: 'TALK_CHOICE', yes: true, nowMs: T0 }]);
    expect(yes.stats.intimacyThreat).toBeGreaterThan(before);
    const no = run(s, [{ type: 'TALK_CHOICE', yes: false, nowMs: T0 }]);
    expect(no.stats.abandonment).toBeLessThanOrEqual(s.stats.abandonment);
  });

  it('병간호 세션 선택지: 곁을 지키면 유기불안이 크게 풀린다', () => {
    const base = createInitialState(T0, 'nurse');
    let s: GameState = {
      ...base,
      relationTier: 5,
      selectedAction: 'nurse',
      presence: { ...base.presence, sick: true },
      stats: { ...base.stats, abandonment: 88, intimacyThreat: 30, security: 42 },
    };
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      ...Array.from({ length: 31 }, () => ({ type: 'TICK', dtSec: 10 }) as GameEvent),
    ], seq([0.9, 0.9]));
    expect(s.session.choiceState).not.toBeNull();
    const before = s.stats.abandonment;
    const stayed = run(s, [{ type: 'CHOICE_PICKED', optionIndex: 0, nowMs: T0 }]);
    expect(stayed.stats.abandonment).toBeLessThan(before);
  });
});

describe('1회용 대화 (M19e once)', () => {
  it('once 줄은 풀이 소진돼 리셋되어도 돌아오지 않는다', () => {
    const data = structuredClone(gameData);
    // absent 풀을 2줄로 축소: once 1줄 + 일반 1줄
    data.dialogues.absent = [
      { textId: 'dlg.absent.care', intimacy: 1, once: true },
      { textId: 'dlg.absent.search', intimacy: 1 },
    ];
    const base = createInitialState(T0, 'lie');
    let s: GameState = {
      ...base,
      phase: 'rest',
      presence: { ...base.presence, state: 'absent' },
    };
    const seen: string[] = [];
    for (let i = 0; i < 6; i++) {
      s = transition(s, { type: 'TALK' }, { rng: seq([0.0]), data });
      const pages = s.rest.talkState?.pages.join('') ?? '';
      seen.push(pages);
      s = { ...s, rest: { ...s.rest, talkPressed: false, talkState: null } };
    }
    const careText = (data.text['dlg.absent.care']?.[0] ?? []).join('');
    // once 줄은 정확히 1번만
    expect(seen.filter((p) => p === careText)).toHaveLength(1);
  });
});
