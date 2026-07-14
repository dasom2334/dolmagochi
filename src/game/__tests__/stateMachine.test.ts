import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import { createInitialState, isRockPresent, transition } from '../stateMachine';
import type { GameEvent, GameState } from '../types';
import { mulberry32, type Rng } from '../rng';
import { gameData } from '../../store/gameStore';
import type { GameData } from '../../data/schema';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

/** 카탈로그 첫 변형을 페이지 조인한 기대 문자열 */
const T = (id: string) => (gameData.text[id]?.[0] ?? []).join('\n');
const variantsOf = (id: string) =>
  (gameData.text[id] ?? []).map((pages) => pages.join('\n'));

function seq(values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

function run(
  state: GameState,
  events: GameEvent[],
  rng: Rng = mulberry32(1),
  data: GameData = gameData,
): GameState {
  return events.reduce((s, e) => transition(s, e, { rng, data }), state);
}

function init(): GameState {
  return createInitialState(T0, 'read');
}

/** dt초씩 total초만큼 TICK */
function ticks(total: number, dt = 10): GameEvent[] {
  const out: GameEvent[] = [];
  for (let t = 0; t < total; t += dt) out.push({ type: 'TICK', dtSec: dt });
  return out;
}

function toRest(state = init()): GameState {
  return run(state, [
    { type: 'START_FOCUS', nowMs: T0 },
    { type: 'END_FOCUS', nowMs: T0 },
  ]);
}

describe('기본 사이클: 행동선택 → 집중 → 휴식 → 행동선택', () => {
  it('초기 상태', () => {
    const s = init();
    expect(s.phase).toBe('actionSelect');
    expect(s.era).toBe('raising');
    expect(s.settings.locale).toBe('ko');
    expect(isRockPresent(s)).toBe(true);
  });

  it('SELECT_ACTION: 해금 조건 미달은 무시, Outcome 해금은 통과', () => {
    const s = init();
    expect(run(s, [{ type: 'SELECT_ACTION', actionId: 'cook' }]).selectedAction).toBe('read');
    expect(run(s, [{ type: 'SELECT_ACTION', actionId: 'walk' }]).selectedAction).toBe('walk');
    const unlocked: GameState = { ...s, unlockedActions: ['cook'] };
    expect(
      run(unlocked, [{ type: 'SELECT_ACTION', actionId: 'cook' }]).selectedAction,
    ).toBe('cook');
  });

  it('START_FOCUS → 집중, 일지 첫 줄 = 행동 시작 서술 (카탈로그 경유)', () => {
    const s = run(init(), [{ type: 'START_FOCUS', nowMs: T0 }]);
    expect(s.phase).toBe('focus');
    expect(s.session.journal[0].text).toBe(T('act.read.start'));
  });

  it('TICK: 경과 누적, 일시정지 시 무시', () => {
    let s = run(init(), [{ type: 'START_FOCUS', nowMs: T0 }, ...ticks(100)]);
    expect(s.session.elapsedSec).toBe(100);
    s = run(s, [{ type: 'SET_PAUSED', paused: true }, ...ticks(100)]);
    expect(s.session.elapsedSec).toBe(100);
    s = run(s, [{ type: 'SET_PAUSED', paused: false }, ...ticks(50)]);
    expect(s.session.elapsedSec).toBe(150);
  });

  it('END_FOCUS: 휴식 진입, 정성 이월, 휴식 길이·요약, 행동 Outcome 적용', () => {
    const s = run(init(), [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(1800), // 30분
      { type: 'END_FOCUS', nowMs: T0 + 1_800_000 },
    ]);
    expect(s.phase).toBe('rest');
    expect(s.care).toEqual({ points: 1, carryMinutes: 5 });
    expect(s.rest.totalSec).toBe(10 * 60);
    expect(s.rest.summary).toEqual({ mins: 30, earned: 1 });
    expect(s.stats.needs.belonging).toBeGreaterThan(0); // read → 소속/애정만
    expect(s.stats.needs.physiological).toBe(0);
    expect(s.totals.sessions).toBe(1);
  });

  it('REST_END: 평시에는 행동선택으로 복귀', () => {
    expect(run(toRest(), [{ type: 'REST_END' }]).phase).toBe('actionSelect');
  });
});

describe('집중 중 조용한 선택지', () => {
  it('등장 → 무시하면 조용히 회수', () => {
    let s = run(init(), [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(BALANCE.CHOICE_FIRST_AT_SEC),
    ]);
    expect(s.session.choiceState).toMatchObject({ source: 'action', index: 0 });
    s = run(s, ticks(BALANCE.CHOICE_RECALL_SEC + 10));
    expect(s.session.choiceState).toBeNull();
    expect(s.session.choicesFired).toBe(1);
    expect(s.session.narratorLine).toBe(T('sys.choiceRecall'));
  });

  it('CHOICE_PICKED: 추첨된 결과가 서술·일지·기억에 남는다', () => {
    const s = run(init(), [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(BALANCE.CHOICE_FIRST_AT_SEC),
      { type: 'CHOICE_PICKED', optionIndex: 1, nowMs: T0 },
    ]);
    const expected = T('act.read.c0.o1.r0');
    expect(s.session.choiceState).toBeNull();
    expect(s.session.narratorLine).toBe(expected);
    expect(s.session.journal.map((j) => j.text)).toContain(expected);
    expect(s.memory['choice']).toBeDefined();
  });

  it('remembrance가 달린 결과는 추억으로 영구 기록된다', () => {
    const s = run(init(), [
      { type: 'SELECT_ACTION', actionId: 'walk' },
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(BALANCE.CHOICE_FIRST_AT_SEC),
      { type: 'CHOICE_PICKED', optionIndex: 0, nowMs: T0 }, // 잠깐 멈춰 선다 → walk-pause
    ]);
    expect(s.remembrances.map((r) => r.id)).toContain('walk-pause');
    // 시각은 에폭 ms로 기록된다 (세션 경과 초와 섞이지 않음)
    expect(s.remembrances[0].at).toBe(T0);
    expect(s.memory['choice'].lastAt).toBe(T0);
  });
});

describe('작은 행동 — 집중 세션이 끝난 뒤 1회', () => {
  it('집중 중에는 불가, 휴식에서 1회만', () => {
    let s = run(init(), [{ type: 'START_FOCUS', nowMs: T0 }]);
    s = run(s, [{ type: 'REST_ACT', key: 'glance' }]);
    expect(s.rest.actUsed).toBe(false);

    s = run(s, [{ type: 'END_FOCUS', nowMs: T0 }]);
    const before = s.session.journal.length;
    s = run(s, [{ type: 'REST_ACT', key: 'glance' }]);
    expect(s.rest.actUsed).toBe(true);
    expect(s.session.journal).toHaveLength(before + 1);
    expect(variantsOf('restAct.glance.lines')).toContain(
      s.session.journal[s.session.journal.length - 1].text,
    );

    const again = run(s, [{ type: 'REST_ACT', key: 'water' }]);
    expect(again.session.journal).toHaveLength(before + 1);
  });
});

describe('휴식 대화', () => {
  it('풀 추출: 단계 풀에서 비복원, usedByPool 기록', () => {
    const s = run(toRest(), [{ type: 'TALK' }], seq([0.9, 0.0, 0.0]));
    expect(s.rest.talkState?.kind).toBe('pool');
    const stage1Texts = gameData.dialogues.stage1.map((l) => T(l.textId));
    expect(stage1Texts).toContain(s.rest.talkState!.pages.join('\n'));
    expect(s.dialogue.usedByPool['stage1']).toHaveLength(1);
  });

  it('휴식당 1회 — 두 번째 TALK은 무시', () => {
    const s = run(toRest(), [{ type: 'TALK' }, { type: 'TALK' }], seq([0.9, 0.0, 0.0]));
    expect(s.dialogue.usedByPool['stage1']).toHaveLength(1);
  });

  it('포섀도: 예약 → 다음 세션 이벤트 → 결과·플래그', () => {
    // foreshadow[1] (산책 약속 → promised-walk)을 지정 추첨
    let s = run(toRest(), [{ type: 'TALK' }], seq([0.1, 0.34]));
    expect(s.rest.talkState?.kind).toBe('foreshadow');
    expect(s.rest.talkState?.pages.join('\n')).toBe(T('fore.door.line'));
    expect(s.pendingEvent).not.toBeNull();

    s = run(s, [
      { type: 'REST_END' },
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(BALANCE.CHOICE_FIRST_AT_SEC),
    ]);
    expect(s.session.choiceState?.source).toBe('foreshadow');
    s = run(s, [{ type: 'CHOICE_PICKED', optionIndex: 0, nowMs: T0 }]);
    expect(s.pendingEvent).toBeNull();
    expect(s.flags).toContain('promised-walk'); // Outcome 트리거
  });

  it('TALK_CHOICE: 예/아니오 응답 페이지로 교체', () => {
    const withChoice: GameData = structuredClone(gameData);
    withChoice.dialogues.stage1 = [
      {
        textId: 'dlg.stage1.0',
        intimacy: 1,
        choice: { yesId: 'dlg.return.yes', noId: 'dlg.return.no' },
      },
    ];
    let s = run(toRest(), [{ type: 'TALK' }], seq([0.9, 0.0, 0.0]), withChoice);
    expect(s.rest.talkState?.hasChoice).toBe(true);
    s = run(s, [{ type: 'TALK_CHOICE', yes: false }], seq([0]), withChoice);
    expect(s.rest.talkState?.pages.join('\n')).toBe(T('dlg.return.no'));
    expect(s.rest.talkState?.done).toBe(true);
  });

  it('고정 마일스톤: 행동을 골라두기만 해서는 발화하지 않는다 (수행 완료 기준)', () => {
    // read 세션 완료 → 휴식에서 다음 세션용으로 walk를 골라두고 말 걸기
    const s = run(
      toRest(),
      [{ type: 'SELECT_ACTION', actionId: 'walk' }, { type: 'TALK' }],
      seq([0.9, 0.0, 0.0]), // 포섀도 회피 → 풀 추첨
    );
    expect(s.rest.talkState?.kind).toBe('pool'); // 산책을 아직 안 했으므로 first-walk 아님
    expect(s.milestonesFired).not.toContain('first-walk');
  });

  it('고정 마일스톤: 첫 산책 후 1회 발화', () => {
    let s = run(init(), [
      { type: 'SELECT_ACTION', actionId: 'walk' },
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
      { type: 'TALK' },
    ]);
    expect(s.rest.talkState?.kind).toBe('milestone');
    expect(s.milestonesFired).toContain('first-walk');

    s = run(
      s,
      [
        { type: 'REST_END' },
        { type: 'START_FOCUS', nowMs: T0 },
        { type: 'END_FOCUS', nowMs: T0 },
        { type: 'TALK' },
      ],
      // START/END의 문구 추첨 2회 → 포섀도 회피(0.9) → 풀 추첨
      seq([0.0, 0.0, 0.9, 0.0, 0.0]),
    );
    expect(s.rest.talkState?.kind).toBe('pool');
    expect(s.milestonesFired.filter((id) => id === 'first-walk')).toHaveLength(1);
  });

  it('단계 승급 마일스톤: 파생 단계 도달 시 발화', () => {
    const base = toRest();
    const leveled: GameState = {
      ...base,
      stats: {
        ...base.stats,
        needs: { ...base.stats.needs, physiological: BALANCE.NEED_FILLED_THRESHOLD },
      },
    };
    const s = run(leveled, [{ type: 'TALK' }]);
    expect(s.rest.talkState?.kind).toBe('milestone');
    expect(s.milestonesFired).toContain('stage-up-2');
  });
});

describe('잠수(부재) 분기', () => {
  function riskyData(): GameData {
    const d: GameData = structuredClone(gameData);
    d.actions.find((a) => a.id === 'read')!.intimacy = 4;
    return d;
  }

  it('허용치 2레벨 초과 접근 시에만 확률 발동', () => {
    const data = riskyData();
    const s = run(init(), [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.1, 0.0]), data);
    expect(s.presence.state).toBe('absent');
    expect(s.presence.plannedSessions).toBe(1);
    expect(s.session.journal[0].text).toBe(T('sys.journal.sessionStartAbsent'));

    const miss = run(init(), [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.9]), data);
    expect(miss.presence.state).toBe('present');

    const rng = mulberry32(3);
    for (let i = 0; i < 50; i++) {
      const safe = run(
        init(),
        [
          { type: 'SELECT_ACTION', actionId: 'free' },
          { type: 'START_FOCUS', nowMs: T0 },
        ],
        rng,
      );
      expect(safe.presence.state).toBe('present');
    }
  });

  it('부재 중에도 게임은 계속: 선택지만 등장하지 않음', () => {
    const data = riskyData();
    let s = run(
      init(),
      [{ type: 'START_FOCUS', nowMs: T0 }, ...ticks(BALANCE.CHOICE_FIRST_AT_SEC + 60)],
      seq([0.1, 0.0, 0.5]),
      data,
    );
    expect(s.presence.state).toBe('absent');
    expect(s.session.choiceState).toBeNull();
    s = run(s, [{ type: 'END_FOCUS', nowMs: T0 }], seq([0.5]), data);
    expect(s.phase).toBe('rest');
  });

  it('잠수 중 휴식 대화는 부재 풀만 — 마일스톤·단계 풀은 복귀 후로', () => {
    const data = riskyData();
    // 잠수 발동 후 세션 종료 → 휴식
    const s = run(
      init(),
      [
        { type: 'START_FOCUS', nowMs: T0 },
        { type: 'END_FOCUS', nowMs: T0 },
        { type: 'TALK' },
      ],
      seq([0.1, 0.0, 0.0]),
      data,
    );
    expect(s.presence.state).toBe('absent');
    expect(gameData.dialogues.absent.map((l) => T(l.textId))).toContain(
      s.rest.talkState!.pages.join('\n'),
    );
    expect(s.milestonesFired).toHaveLength(0); // 없는 돌이 마일스톤을 발화하지 않는다
  });

  it('잠수 중에는 반추 틱이 재석 전제 문장을 일지에 남기지 않는다', () => {
    const data = riskyData();
    const s = run(
      init(),
      [
        { type: 'START_FOCUS', nowMs: T0 },
        ...ticks(BALANCE.REFLECT_INTERVAL_SEC),
      ],
      seq([0.1, 0.0, 0.5]),
      data,
    );
    expect(s.presence.state).toBe('absent');
    expect(s.session.journal).toHaveLength(1); // 시작 서술뿐 — 반추 기록 없음
  });

  it('저친밀 누적으로만 복귀 — 호감도 삭감 없음, first-return 1회성', () => {
    const data = riskyData();
    let s = run(init(), [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.1, 0.0]), data);
    const affectionAtAbsence = s.stats.affection;

    s = run(s, [{ type: 'END_FOCUS', nowMs: T0 }, { type: 'REST_END' }], seq([0.9]), data);
    expect(s.presence.state).toBe('absent'); // 고친밀(4) 세션은 카운트 안 됨

    s = run(
      s,
      [
        { type: 'SELECT_ACTION', actionId: 'free' },
        { type: 'START_FOCUS', nowMs: T0 },
        { type: 'END_FOCUS', nowMs: T0 },
      ],
      seq([0.9]),
      data,
    );
    expect(s.presence.state).toBe('present');
    expect(s.presence.returnPending).toBe(true);
    expect(s.session.journal.map((j) => j.text)).toContain(
      T('sys.journal.rockReturned'),
    );
    expect(s.stats.affection).toBeGreaterThanOrEqual(affectionAtAbsence);

    s = run(s, [{ type: 'TALK' }], seq([0.9]), data);
    expect(s.rest.talkState?.kind).toBe('return');
    expect(s.rest.talkState?.pages.join('\n')).toBe(T('dlg.return.line'));
    expect(s.milestonesFired).toContain('first-return');

    s = run(s, [{ type: 'TALK_CHOICE', yes: true }], seq([0.9]), data);
    expect(s.rest.talkState?.pages.join('\n')).toBe(T('dlg.return.yes'));

    const again: GameState = {
      ...s,
      presence: { ...s.presence, returnPending: true },
      rest: { ...s.rest, talkPressed: false, talkState: null },
    };
    const after = run(again, [{ type: 'TALK' }], seq([0.9]), data);
    expect(after.milestonesFired.filter((id) => id === 'first-return')).toHaveLength(1);
  });
});

describe('상점 — 구매 ≠ 배치', () => {
  function richRest(): GameState {
    const base = toRest();
    return { ...base, care: { points: 5, carryMinutes: 0 } };
  }

  it('구매 시 보관 상태 + 배치 선택 대기 → SET_PLACEMENT로 결정·토글', () => {
    let s = run(richRest(), [{ type: 'BUY', itemId: 'plant', nowMs: T0 }]);
    expect(s.care.points).toBe(4);
    expect(s.items['plant']).toEqual({ placed: false });
    expect(s.pendingPlacement).toBe('plant');
    expect(s.memory['buy-plant']).toBeDefined();

    s = run(s, [{ type: 'SET_PLACEMENT', itemId: 'plant', placed: true }]);
    expect(s.items['plant']).toEqual({ placed: true });
    expect(s.pendingPlacement).toBeNull();

    s = run(s, [{ type: 'SET_PLACEMENT', itemId: 'plant', placed: false }]);
    expect(s.items['plant']).toEqual({ placed: false });
  });

  it('중복·잔액 부족·미해금은 무시', () => {
    const gated: GameData = structuredClone(gameData);
    gated.shop.find((i) => i.id === 'moss')!.unlock = { minTotalHours: 100 };

    const s = run(richRest(), [{ type: 'BUY', itemId: 'plant', nowMs: T0 }], mulberry32(1), gated);
    const dup = run(s, [{ type: 'BUY', itemId: 'plant', nowMs: T0 }], mulberry32(1), gated);
    expect(dup.care.points).toBe(s.care.points);

    const locked = run(s, [{ type: 'BUY', itemId: 'moss', nowMs: T0 }], mulberry32(1), gated);
    expect(locked.items['moss']).toBeUndefined();

    const poorState: GameState = { ...s, care: { points: 0, carryMinutes: 0 } };
    const poor = run(poorState, [{ type: 'BUY', itemId: 'soda', nowMs: T0 }], mulberry32(1), gated);
    expect(poor.items['soda']).toBeUndefined();
  });
});

describe('엔딩 — 자아실현 완성 → 엔딩 전 대화 → 엔딩', () => {
  const TALKS = gameData.endings.preEndingTalks.length;

  function selfActDone(): GameState {
    const base = toRest();
    return {
      ...base,
      stats: { ...base.stats, selfActualization: 100 },
      settings: { noiseOn: true, notifAsked: true, locale: 'ko' },
      care: { points: 7, carryMinutes: 3 },
      items: { plant: { placed: true } },
    };
  }

  it('엔딩 전 대화를 다 보기 전에는 엔딩으로 가지 않는다', () => {
    let s = selfActDone();
    expect(run(s, [{ type: 'REST_END' }]).phase).toBe('actionSelect');

    for (let i = 0; i < TALKS; i++) {
      s = run(s, [{ type: 'TALK' }]);
      expect(s.rest.talkState?.kind).toBe('ending');
      expect(s.endingTalksSeen).toBe(i + 1);
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

  it('휴식→집중 직행(정상 루프)에서도 엔딩이 가로챈다', () => {
    // 엔딩 준비 완료 상태의 휴식에서 '집중 시작'을 눌러도 엔딩 이벤트로 진입
    const ready: GameState = { ...selfActDone(), endingTalksSeen: TALKS };
    const s = run(ready, [{ type: 'START_FOCUS', nowMs: T0 }]);
    expect(s.phase).toBe('ending');
  });

  function endingPhase(): GameState {
    return { ...selfActDone(), endingTalksSeen: TALKS, phase: 'ending' as const };
  }

  it('떠나보내기 → 에필로그 → apart 전환: 아무 것도 리셋되지 않는다', () => {
    let s = run(endingPhase(), [{ type: 'CHOOSE_FAREWELL' }]);
    expect(s.phase).toBe('epilogue');
    s = run(s, [{ type: 'EPILOGUE_DONE' }]);
    expect(s.era).toBe('apart');
    expect(s.phase).toBe('actionSelect');
    expect(isRockPresent(s)).toBe(false);
    expect(s.items['plant']).toEqual({ placed: true });
    expect(s.care).toEqual({ points: 7, carryMinutes: 3 });
    expect(s.settings.noiseOn).toBe(true);
    expect(s.stats.selfActualization).toBe(100);
  });

  it('남기 → 동거 하이브리드: 의존도 상승 + 존중·자아실현 잠식, 호감도 보존', () => {
    let s = run(endingPhase(), [{ type: 'CHOOSE_COHABIT' }]);
    expect(s.era).toBe('cohabit');
    s = {
      ...s,
      stats: { ...s.stats, needs: { ...s.stats.needs, esteem: 50 } },
    };
    const affectionBefore = s.stats.affection;

    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
    ]);
    expect(s.stats.dependence).toBe(BALANCE.DEPENDENCE_PER_SESSION);
    expect(s.stats.needs.esteem).toBe(50 - BALANCE.COHABIT_ESTEEM_DECAY);
    expect(s.stats.selfActualization).toBe(100 - BALANCE.COHABIT_SELF_ACT_DECAY);
    expect(s.stats.affection).toBeGreaterThanOrEqual(affectionBefore); // 호감도는 깎지 않는다
    expect(run(s, [{ type: 'REST_END' }]).phase).toBe('actionSelect'); // 재엔딩 없음

    // 의존도 초기 구간 풀
    const early = run(s, [{ type: 'TALK' }], seq([0.9, 0.0, 0.0]));
    expect(
      gameData.dialogues.cohabitStages[0].lines.map((l) => T(l.textId)),
    ).toContain(early.rest.talkState!.pages.join('\n'));

    // 의존도 심화 구간 풀 (깨달음 강화)
    const deep: GameState = {
      ...s,
      stats: { ...s.stats, dependence: 75 },
      rest: { ...s.rest, talkPressed: false, talkState: null },
    };
    const late = run(deep, [{ type: 'TALK' }], seq([0.9, 0.0, 0.0]));
    expect(
      gameData.dialogues.cohabitStages[2].lines.map((l) => T(l.textId)),
    ).toContain(late.rest.talkState!.pages.join('\n'));
  });

  it('잠수 중 동거 선택 시 돌이 재석으로 돌아온다 (영구 부재 방지)', () => {
    const absentEnding: GameState = {
      ...endingPhase(),
      presence: {
        state: 'absent',
        plannedSessions: 3,
        lowIntimacyProgress: 0,
        returnPending: false,
      },
    };
    const s = run(absentEnding, [{ type: 'CHOOSE_COHABIT' }]);
    expect(s.era).toBe('cohabit');
    expect(s.presence.state).toBe('present');
    expect(isRockPresent(s)).toBe(true);
  });

  it('동거 중 작별 → 에필로그 → apart', () => {
    const s = run(endingPhase(), [
      { type: 'CHOOSE_COHABIT' },
      { type: 'FAREWELL_FROM_COHABIT' },
      { type: 'EPILOGUE_DONE' },
    ]);
    expect(s.era).toBe('apart');
  });

  it('엔딩 phase가 아니면 선택 이벤트는 무시', () => {
    const s = init();
    expect(run(s, [{ type: 'CHOOSE_FAREWELL' }]).phase).toBe('actionSelect');
    expect(run(s, [{ type: 'CHOOSE_COHABIT' }]).era).toBe('raising');
    expect(run(s, [{ type: 'EPILOGUE_DONE' }]).era).toBe('raising');
  });
});

describe('apart(빈자리) 시대', () => {
  function apartState(): GameState {
    return {
      ...toRest(),
      era: 'apart' as const,
      phase: 'actionSelect' as const,
      apart: { visiting: false, visitSessionsLeft: 0, leavePending: false, holdCount: 0 },
      remembrances: [
        {
          id: 'walk-pause',
          summaryId: 'rem.walk-pause.summary',
          revealId: 'rem.walk-pause.reveal',
          at: T0,
        },
      ],
    };
  }

  it('돌이 확률적으로 놀러와 며칠 머물다, 기간이 다하면 떠나려는 기색', () => {
    // 방문 성공: 0.1 < VISIT_PROB, 머묾 2세션 (randInt 0.4)
    let s = run(apartState(), [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.1, 0.4, 0.0]));
    expect(s.apart.visiting).toBe(true);
    expect(s.apart.visitSessionsLeft).toBe(2);
    expect(isRockPresent(s)).toBe(true);
    expect(s.session.journal.map((j) => j.text)).toContain(T('sys.journal.visitStart'));

    s = run(s, [{ type: 'END_FOCUS', nowMs: T0 }], seq([0.0]));
    expect(s.apart).toMatchObject({ visiting: true, leavePending: false }); // 아직 머무는 중

    s = run(
      s,
      [
        { type: 'REST_END' },
        { type: 'START_FOCUS', nowMs: T0 },
        { type: 'END_FOCUS', nowMs: T0 },
      ],
      seq([0.0]),
    );
    expect(s.apart).toMatchObject({ visiting: true, leavePending: true }); // 떠나려는 기색

    // 응답 없이 휴식을 끝내면 보내주기
    s = run(s, [{ type: 'REST_END' }], seq([0.0]));
    expect(s.apart.visiting).toBe(false);
    expect(s.session.journal.map((j) => j.text)).toContain(T('sys.journal.visitEnd'));

    // 방문 실패 경로
    const stay = run(apartState(), [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.9]));
    expect(stay.apart.visiting).toBe(false);
    expect(isRockPresent(stay)).toBe(false);
  });

  it('떠나려는 기색을 두고 휴식→집중 직행해도 visitEnd 기록이 보존된다', () => {
    // 방문(1세션) → 세션 종료 → leavePending 상태에서 응답 없이 바로 집중 시작
    let s = run(
      apartState(),
      [{ type: 'START_FOCUS', nowMs: T0 }, { type: 'END_FOCUS', nowMs: T0 }],
      seq([0.1, 0.0, 0.0]),
    );
    expect(s.apart.leavePending).toBe(true);

    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.0, 0.9, 0.0]));
    expect(s.apart).toMatchObject({ visiting: false, leavePending: false });
    expect(s.session.journal.map((j) => j.text)).toContain(
      T('sys.journal.visitEnd'), // 새 세션 일지에 '돌이 떠났다'가 남는다
    );
  });

  it('붙잡기: 기간 연장 + 죄책감, 붙잡을수록 문구가 무거워진다', () => {
    // 방문(머묾 1세션) → 세션 종료 → 떠나려는 기색
    let s = run(
      apartState(),
      [{ type: 'START_FOCUS', nowMs: T0 }, { type: 'END_FOCUS', nowMs: T0 }],
      seq([0.1, 0.0, 0.0]),
    );
    expect(s.apart.leavePending).toBe(true);
    const moodBefore = s.stats.mood;

    // 1회차 붙잡기 — 이관된 원고
    s = run(s, [{ type: 'VISIT_HOLD', hold: true }]);
    expect(s.apart).toMatchObject({
      visiting: true,
      leavePending: false,
      holdCount: 1,
      visitSessionsLeft: BALANCE.VISIT_HOLD_EXTEND,
    });
    expect(s.stats.mood).toBe(moodBefore - BALANCE.HOLD_GUILT_MOOD);
    const firstHold = gameData.text['dlg.visitLeave.holdResult'][0].join('\n');
    expect(s.session.journal.map((j) => j.text)).toContain(firstHold);
    expect(firstHold).toContain('돌은 당신의 만류에 거절할 수 없었다.');

    // 2회차 붙잡기 — 변형 인덱스 상승 (더 무거운 문구)
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
      { type: 'VISIT_HOLD', hold: true },
    ]);
    expect(s.apart.holdCount).toBe(2);
    const secondHold = gameData.text['dlg.visitLeave.holdResult'][1].join('\n');
    expect(s.session.journal.map((j) => j.text)).toContain(secondHold);

    // 보내주기
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
      { type: 'VISIT_HOLD', hold: false },
    ]);
    expect(s.apart.visiting).toBe(false);
    expect(s.session.journal.map((j) => j.text)).toContain(
      T('dlg.visitLeave.letGoResult'),
    );
  });

  it('방문 중 대화는 apartVisit 풀', () => {
    const s = run(
      apartState(),
      [
        { type: 'START_FOCUS', nowMs: T0 },
        { type: 'END_FOCUS', nowMs: T0 },
        { type: 'TALK' },
      ],
      seq([0.1, 0.9, 0.0]), // 방문 성공, 머묾 3세션
    );
    expect(gameData.dialogues.apartVisit.map((l) => T(l.textId))).toContain(
      s.rest.talkState!.pages.join('\n'),
    );
  });

  it('돌이 없는 동안 대화는 추억 회상 — reveal 페이지가 처음 붙는다', () => {
    const s = run(
      apartState(),
      [
        { type: 'START_FOCUS', nowMs: T0 },
        { type: 'END_FOCUS', nowMs: T0 },
        { type: 'TALK' },
      ],
      seq([0.9, 0.0]), // 방문 실패
    );
    expect(s.rest.talkState?.kind).toBe('recall');
    expect(s.rest.talkState?.pages).toEqual([
      T('rem.walk-pause.summary'),
      T('rem.walk-pause.reveal'),
    ]);
    expect(s.remembrancesRecalled).toEqual(['walk-pause']);
  });

  it('회상할 추억이 없으면 빈자리 폴백 풀', () => {
    const empty: GameState = { ...apartState(), remembrances: [] };
    const s = run(
      empty,
      [
        { type: 'START_FOCUS', nowMs: T0 },
        { type: 'END_FOCUS', nowMs: T0 },
        { type: 'TALK' },
      ],
      seq([0.9, 0.0]),
    );
    expect(gameData.dialogues.apart.map((l) => T(l.textId))).toContain(
      s.rest.talkState!.pages.join('\n'),
    );
  });

  it('빈자리 집중 중 반추 틱도 추억을 회상한다', () => {
    const s = run(
      apartState(),
      [{ type: 'START_FOCUS', nowMs: T0 }, ...ticks(BALANCE.REFLECT_INTERVAL_SEC)],
      seq([0.9, 0.0]),
    );
    expect(s.session.journal.map((j) => j.text)).toContain(
      `${T('rem.walk-pause.summary')}\n${T('rem.walk-pause.reveal')}`,
    );
  });
});

describe('설정', () => {
  it('SET_NOISE: 소음 토글 (오디오 자체는 M6)', () => {
    const s = run(init(), [{ type: 'SET_NOISE', on: true }]);
    expect(s.settings.noiseOn).toBe(true);
    expect(run(s, [{ type: 'SET_NOISE', on: false }]).settings.noiseOn).toBe(false);
  });
});

describe('달력일 정산 이벤트', () => {
  it('SETTLE: 경과일 감쇠가 상태에 반영', () => {
    const DAY = 86_400_000;
    const base: GameState = { ...init(), lastSessionEndAt: T0 };
    const s = run(base, [{ type: 'SETTLE', nowMs: T0 + 2 * DAY }]);
    expect(s.stats.mood).toBe(
      BALANCE.MOOD_START - 2 * BALANCE.MOOD_DECAY_PER_DAY,
    );
  });
});
