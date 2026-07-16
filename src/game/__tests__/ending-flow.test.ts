import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { createInitialState, isRockPresent, transition } from '../stateMachine';
import type { GameData } from '../../data/schema';
import type { GameEvent, GameState } from '../types';
import { mulberry32, type Rng } from '../rng';
import { gameData } from '../../store/gameStore';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();
const T = (id: string) => (gameData.text[id]?.[0] ?? []).join('\n');

function seq(values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
function run(
  s: GameState,
  events: GameEvent[],
  rng: Rng = mulberry32(1),
  data: GameData = gameData,
): GameState {
  return events.reduce((st, e) => transition(st, e, { rng, data }), s);
}

/** 자아실현 완성 + 엔딩 전 대화 소진 상태의 rest */
function readyForEnding(): GameState {
  const base = run({ ...createInitialState(T0, 'read'), items: { book: { placed: false } } }, [
    { type: 'START_FOCUS', nowMs: T0 },
    { type: 'END_FOCUS', nowMs: T0 },
  ]);
  return {
    ...base,
    stats: { ...base.stats, selfActualization: BALANCE.SELF_ACT_COMPLETE },
    endingTalksSeen: gameData.endings.preEndingTalks.length,
    care: { points: 5, carryMinutes: 3 },
    items: { plant: { placed: true } },
    settings: { ...base.settings, noiseOn: true, notifAsked: true },
    totals: { focusSeconds: 50 * 3600, sessions: 40 },
  };
}

const TALKS = gameData.endings.preEndingTalks.length;

describe('엔딩 플로우 (ending)', () => {
  it('자아실현 100 → 엔딩 전 대화 순차 소진 → 엔딩 이벤트', () => {
    // 자아실현만 100, 엔딩 전 대화는 아직
    const base = run({ ...createInitialState(T0, 'read'), items: { book: { placed: false } } }, [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
    ]);
    let s: GameState = {
      ...base,
      stats: { ...base.stats, selfActualization: BALANCE.SELF_ACT_COMPLETE },
    };
    // 아직 엔딩 전 대화를 안 봤으면 REST_END는 엔딩으로 안 감
    expect(run(s, [{ type: 'REST_END' }]).phase).toBe('actionSelect');

    for (let i = 0; i < TALKS; i++) {
      s = run(s, [{ type: 'TALK' }]);
      expect(s.rest.talkState?.kind).toBe('ending');
      s = run(s, [
        { type: 'REST_END' },
        ...(i < TALKS - 1
          ? ([
              { type: 'START_FOCUS', nowMs: T0 },
              { type: 'END_FOCUS', nowMs: T0 },
            ] as GameEvent[])
          : []),
      ]);
    }
    expect(s.phase).toBe('ending');
  });

  it('떠나보내기 → 에필로그 → apart: 상태 연속성(리셋 없음)', () => {
    const ending: GameState = { ...readyForEnding(), phase: 'ending' };
    let s = run(ending, [{ type: 'CHOOSE_FAREWELL' }]);
    expect(s.phase).toBe('epilogue');
    expect(s.era).toBe('raising'); // 에필로그 시점 era

    s = run(s, [{ type: 'EPILOGUE_DONE' }]);
    // apart 전환 — 회차 리셋이 아니라 상태가 그대로 이어진다
    expect(s.era).toBe('apart');
    expect(s.phase).toBe('actionSelect');
    expect(isRockPresent(s)).toBe(false); // 빈자리
    expect(s.items['plant']).toEqual({ placed: true });
    expect(s.care).toEqual({ points: 5, carryMinutes: 3 });
    expect(s.settings.noiseOn).toBe(true);
    expect(s.stats.selfActualization).toBe(BALANCE.SELF_ACT_COMPLETE);
    expect(s.totals.sessions).toBe(40);
  });

  it('남기 → 동거: 전환 문구 표시, 목표 종료(재엔딩 없음), 의존도↑·존중/자아실현 잠식', () => {
    const ending: GameState = { ...readyForEnding(), phase: 'ending' };
    let s = run(ending, [{ type: 'CHOOSE_COHABIT' }]);
    expect(s.era).toBe('cohabit');
    expect(s.phase).toBe('actionSelect');
    // 동거 전환 문구가 화자 서술로 뜬다
    expect(s.session.narratorLine).toBe(T('end.cohabit'));

    const esteem0 = 50;
    s = {
      ...s,
      // 존경을 건드리지 않는 행동(자유행동)으로 고정 — 동거 잠식만 검증
      selectedAction: 'free',
      stats: { ...s.stats, needs: { ...s.stats.needs, esteem: esteem0 } },
    };
    const affection0 = s.stats.affection;
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
    ]);
    expect(s.stats.dependence).toBe(BALANCE.DEPENDENCE_PER_SESSION);
    expect(s.stats.needs.esteem).toBe(esteem0 - BALANCE.COHABIT_ESTEEM_DECAY);
    expect(s.stats.selfActualization).toBe(
      BALANCE.SELF_ACT_COMPLETE - BALANCE.COHABIT_SELF_ACT_DECAY,
    );
    expect(s.stats.affection).toBeGreaterThanOrEqual(affection0); // 호감도는 보존
    // 자아실현이 완성돼 있어도 동거에서는 다시 엔딩으로 가지 않는다
    expect(run(s, [{ type: 'REST_END' }]).phase).toBe('actionSelect');

    // 대화는 동거 풀 (마일스톤은 소진된 것으로 두어 풀이 서빙되게)
    s = {
      ...s,
      milestonesFired: gameData.events.milestones.map((m) => m.id),
    };
    const talked = run(s, [{ type: 'TALK' }], seq([0.9, 0.0, 0.0]));
    expect(
      gameData.dialogues.cohabitStages[0].lines.map((l) => T(l.textId)),
    ).toContain(talked.rest.talkState!.pages.join('\n'));
  });

  it('동거 중 작별 → 에필로그(누적 시간 문구) → apart', () => {
    const cohabit: GameState = {
      ...readyForEnding(),
      era: 'cohabit',
      phase: 'actionSelect',
    };
    let s = run(cohabit, [{ type: 'FAREWELL_FROM_COHABIT' }]);
    expect(s.phase).toBe('epilogue');
    expect(s.era).toBe('cohabit'); // 에필로그 시점 era로 farewellFromCohabit 선택
    // 누적 시간 문구 템플릿이 존재하고 {hours} 슬롯을 가진다 (UI가 채움)
    expect(T('end.farewellHours')).toContain('{hours}');

    s = run(s, [{ type: 'EPILOGUE_DONE' }]);
    expect(s.era).toBe('apart');
  });
});
