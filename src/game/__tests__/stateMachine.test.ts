import { describe, expect, it } from 'vitest';
import { BALANCE } from '../balance';
import {
  createInitialState,
  isActionAvailable,
  isRockPresent,
  transition,
} from '../stateMachine';
import type { GameEvent, GameState } from '../types';
import { remember } from '../memory';
import { mulberry32, type Rng } from '../rng';
import { gameData } from '../../store/gameStore';
import type { GameData } from '../../data/schema';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

/** 카탈로그 첫 변형을 페이지 조인한 기대 문자열 */
const T = (id: string) => (gameData.text[id]?.[0] ?? []).join('\n');
/** {mins} 등 자리표를 채운 텍스트 — 타임마크류 검증용 */
const TF = (id: string, vars: Record<string, string | number>) =>
  T(id).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
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

// 흐름 테스트 편의: 해금 아이템을 모두 보유한 시작 상태(행동 게이팅과 무관하게 검증).
// 아이템 해금 게이트 자체는 아래 전용 테스트에서 맨 상태로 확인한다.
function init(): GameState {
  const s = createInitialState(T0, 'read');
  return {
    ...s,
    items: {
      book: { placed: false },
      cushion: { placed: false },
      shoes: { placed: false },
      pot: { placed: false },
      broom: { placed: false },
    },
  };
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

  it('SELECT_ACTION: 아이템 없으면 잠김, 아이템/Outcome 해금은 통과', () => {
    // 맨 시작 상태 — lie/free만 해금(read/sun/walk/cook/chore는 아이템 필요)
    const bare = createInitialState(T0, 'lie');
    expect(run(bare, [{ type: 'SELECT_ACTION', actionId: 'walk' }]).selectedAction).toBe('lie'); // 신발 없음 → 무시
    const withShoes: GameState = { ...bare, items: { shoes: { placed: false } } };
    expect(
      run(withShoes, [{ type: 'SELECT_ACTION', actionId: 'walk' }]).selectedAction,
    ).toBe('walk'); // 신발 보유 → 해금
    const unlocked: GameState = { ...bare, unlockedActions: ['cook'] };
    expect(
      run(unlocked, [{ type: 'SELECT_ACTION', actionId: 'cook' }]).selectedAction,
    ).toBe('cook'); // Outcome 명시 해금도 통과
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
    // 존중(read)이 오르려면 하위 욕구가 상승 게이트(80)를 넘어 있어야 한다 (개정 v4-5)
    const base = init();
    const start: GameState = {
      ...base,
      stats: {
        ...base.stats,
        needs: { physiological: 80, safety: 80, belonging: 80, esteem: 0 },
      },
    };
    const s = run(start, [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(1800), // 30분
      { type: 'END_FOCUS', nowMs: T0 + 1_800_000 },
    ]);
    expect(s.phase).toBe('rest');
    expect(s.care).toEqual({ points: 1, carryMinutes: 5 });
    expect(s.rest.totalSec).toBe(10 * 60);
    expect(s.rest.summary).toEqual({ mins: 30, earned: 1 });
    expect(s.stats.needs.esteem).toBeGreaterThan(0); // read → 존경
    // 시간 비례 감소 (개정 v4-5): 30분 = 생리 −1.2×0.5
    expect(s.stats.needs.physiological).toBeCloseTo(80 - 1.2 * 0.5, 5);
    expect(s.totals.sessions).toBe(1);
  });

  it('90분 상한: 초과 집중은 정성이 더 오르지 않는다', () => {
    const s = run(init(), [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(6000), // 100분
      { type: 'END_FOCUS', nowMs: T0 + 6_000_000 },
    ]);
    // 90분까지만 환산: floor(90/25)=3, 이월 90-75=15 (100분이 아니라 90분 기준)
    expect(s.care).toEqual({ points: 3, carryMinutes: 15 });
  });

  it('REST_END: 평시에는 행동선택으로 복귀', () => {
    expect(run(toRest(), [{ type: 'REST_END' }]).phase).toBe('actionSelect');
  });
});

describe('집중 중 조용한 선택지', () => {
  it('등장 → 무시해도 물러가지 않고 아래에 남는다', () => {
    let s = run(init(), [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(BALANCE.CHOICE_FIRST_AT_SEC),
    ]);
    expect(s.session.choiceState).toMatchObject({ source: 'action', index: 0 });
    // 오래 지나도 회수되지 않고 그대로 유지 — 선택 전까지는 소진되지 않는다
    s = run(s, ticks(1200));
    expect(s.session.choiceState).toMatchObject({ source: 'action', index: 0 });
    expect(s.session.choicesFired).toBe(0);
  });

  it('선택지가 떠 있어도 서술(ambient)은 계속 흐른다 (별도 박스)', () => {
    let s = run(init(), [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(BALANCE.CHOICE_FIRST_AT_SEC),
    ]);
    expect(s.session.choiceState).not.toBeNull();
    const seen = new Set<string>();
    for (let k = 0; k < 4; k++) {
      s = run(s, ticks(BALANCE.AMBIENT_ROTATE_SEC));
      seen.add(s.session.narratorLine);
      expect(s.session.choiceState).not.toBeNull(); // 선택지는 계속 남아있고
    }
    expect(seen.size).toBeGreaterThan(1); // 서술은 로테이션으로 갱신됨
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

  it('돌이 없을 때(잠수)는 부재 전용 문구를 쓴다', () => {
    const data: GameData = structuredClone(gameData);
    data.actions.find((a) => a.id === 'read')!.intimacy = 4; // 잠수 유발
    // 잠수 발동 → 세션 종료 → 휴식에서 작은 행동
    let s = run(
      init(),
      [{ type: 'START_FOCUS', nowMs: T0 }, { type: 'END_FOCUS', nowMs: T0 }],
      seq([0.1, 0.0]),
      data,
    );
    expect(s.presence.state).toBe('absent');
    s = run(s, [{ type: 'REST_ACT', key: 'glance' }], mulberry32(1), data);
    const line = s.session.journal[s.session.journal.length - 1].text;
    expect(variantsOf('restAct.glance.absent')).toContain(line);
    expect(variantsOf('restAct.glance.lines')).not.toContain(line);
  });
});

describe('시간 문턱 발화 (timeMarks)', () => {
  it('집중 경과가 문턱을 넘으면 세션당 문턱별 1회 발화', () => {
    const marks = gameData.timeMarks.focus;
    const first = marks[0]; // 25분(1500초)
    // 문턱 직전에는 발화 없음
    let s = run(init(), [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(first.minSec - 10),
    ]);
    expect(s.session.timeMarksFired).not.toContain(0);
    // 문턱을 넘으면 발화 + 인덱스 기록
    s = run(s, ticks(20));
    expect(s.session.timeMarksFired).toContain(0);
    expect(s.session.journal.map((j) => j.text)).toContain(
      TF(first.textId, { mins: first.minSec / 60 }),
    );
    // 같은 문턱은 다시 발화하지 않음
    const firedCount = s.session.timeMarksFired.filter((i) => i === 0).length;
    expect(firedCount).toBe(1);
  });

  it('문턱 발화 틱엔 반추 서술을 억제해 문턱 대사가 묻히지 않는다 (수치는 유지)', () => {
    // read(반추 간격 600s)가 30분 문턱(1800초)과 겹치는 틱
    const s = run(init(), [
      { type: 'START_FOCUS', nowMs: T0 }, // 기본 selectedAction=read
      ...ticks(1800),
    ]);
    const mark30 = gameData.timeMarks.focus.find((m) => m.minSec === 1800)!;
    const at30 = s.session.journal.filter((j) => j.t === '30:00');
    // 30:00엔 문턱 대사만 남는다 (반추 서술은 억제 — 없었다면 반추+문턱 2줄)
    expect(at30).toHaveLength(1);
    expect(at30[0].text).toBe(TF(mark30.textId, { mins: 30 }));
    // 반추 블록 자체는 돌았다(간격 리셋) → 수치는 그대로 적용됨
    expect(s.session.lastReflectAtSec).toBe(1800);
  });

  it('END_FOCUS: 배정된 휴식 길이 문턱 발화가 일지에 남는다', () => {
    // 60분 집중 → 20분 휴식 → rest 문턱 20m(1200초) 발화
    const s = run(init(), [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(3600),
      { type: 'END_FOCUS', nowMs: T0 + 3_600_000 },
    ]);
    expect(s.rest.totalSec).toBe(20 * 60);
    const restMark = gameData.timeMarks.rest.filter((m) => 20 * 60 >= m.minSec).pop()!;
    expect(s.session.journal.map((j) => j.text)).toContain(
      TF(restMark.textId, { mins: 20 }),
    );
  });

  it('유저가 설정에서 바꾼 휴식 길이가 휴식 문턱 대사에 그대로 들어간다', () => {
    // 배정표를 50~90분 → 25분 휴식으로 변경: 60분 집중 → "25분의 휴식" (20m 문턱 문구)
    const custom = init();
    custom.settings = {
      ...custom.settings,
      flowtime: { bounds: [25, 50, 90], rests: [5, 10, 25, 30] },
    };
    const s = run(custom, [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(3600),
      { type: 'END_FOCUS', nowMs: T0 + 3_600_000 },
    ]);
    expect(s.rest.totalSec).toBe(25 * 60);
    const restMark = gameData.timeMarks.rest.filter((m) => 25 * 60 >= m.minSec).pop()!;
    expect(s.session.journal.map((j) => j.text)).toContain(
      TF(restMark.textId, { mins: 25 }),
    );
  });
});

describe('휴식 대화', () => {
  it('첫 휴식(세션 1)은 관계 1티어 풀 — 데면데면한 첫 대화, 비복원 기록', () => {
    // 집중이 아무리 길어도(첫 세션) 관계 대사가 먼저 나온다
    const s = run(toRest(), [{ type: 'TALK' }], seq([0.9, 0.0, 0.0]));
    expect(s.rest.talkState?.kind).toBe('pool');
    const rel1Texts = gameData.dialogues.relationTiers[0].map((l) => T(l.textId));
    expect(rel1Texts).toContain(s.rest.talkState!.pages.join('\n'));
    expect(s.dialogue.usedByPool['relation1']).toHaveLength(1);
  });

  it('둘째 휴식(세션 2)은 상태(욕구 단계) 풀 — 관계/상태 번갈아', () => {
    let s = run(toRest(), [{ type: 'REST_END' }]);
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
      { type: 'TALK' },
    ], seq([0.9])); // 상수 0.9 — 포섀도 예약(<0.45) 회피
    expect(s.rest.talkState?.kind).toBe('pool');
    const stage1Texts = gameData.dialogues.stage1.map((l) => T(l.textId));
    expect(stage1Texts).toContain(s.rest.talkState!.pages.join('\n'));
  });

  it('휴식당 1회 — 두 번째 TALK은 무시', () => {
    const s = run(toRest(), [{ type: 'TALK' }, { type: 'TALK' }], seq([0.9, 0.0, 0.0]));
    expect(s.dialogue.usedByPool['relation1']).toHaveLength(1);
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

  it('행동 조건 포섀도: 예약된 뒤 산책 세션에선 등장하지 않고 대기, 이후 적합 세션에 등장', () => {
    // read 세션 → 휴식 → 문(door) 포섀도 예약 (when.notActions=['walk'])
    let s = run(toRest(), [{ type: 'TALK' }], seq([0.1, 0.34]));
    expect(s.rest.talkState?.pages.join('\n')).toBe(T('fore.door.line'));
    expect(s.pendingEvent?.when?.notActions).toContain('walk');

    // 다음 세션을 산책으로 바꾸면 포섀도는 등장하지 않는다 (pendingEvent 유지)
    s = run(s, [
      { type: 'SELECT_ACTION', actionId: 'walk' },
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(BALANCE.CHOICE_FIRST_AT_SEC + 10),
    ]);
    expect(s.session.choiceState?.source).not.toBe('foreshadow');
    expect(s.pendingEvent).not.toBeNull();

    // 산책이 아닌 세션에서는 정상 등장
    s = run(s, [
      { type: 'END_FOCUS', nowMs: T0 },
      { type: 'SELECT_ACTION', actionId: 'read' },
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(BALANCE.CHOICE_FIRST_AT_SEC),
    ]);
    expect(s.session.choiceState?.source).toBe('foreshadow');
  });

  it('행동 조건 포섀도: 예약 시점에도 부적합하면 후보에서 제외되고 폴백', () => {
    // 산책이 다음 행동이고 다른 포섀도(0,2)는 소진 → 남은 건 door(1)뿐인데 산책이라 제외
    const rest: GameState = { ...toRest(), selectedAction: 'walk', foreUsed: [0, 2] };
    const s = run(rest, [{ type: 'TALK' }], seq([0.1, 0.9, 0.0]));
    expect(s.rest.talkState?.kind).toBe('pool'); // 포섀도 대신 단계 풀로 폴백
    expect(s.pendingEvent).toBeNull();
  });

  it('실내 소재 포섀도(새·영수증)는 전부 notActions:walk 게이트', () => {
    // 데이터 무결성: 실내 포섀도가 산책에서 예약되지 않는다
    for (const f of gameData.events.foreshadow) {
      expect(f.event.when?.notActions).toContain('walk');
    }
    // 산책 다음 세션에는 어떤 포섀도도 예약되지 않고 풀로 폴백
    const rest: GameState = { ...toRest(), selectedAction: 'walk', foreUsed: [] };
    const s = run(rest, [{ type: 'TALK' }], seq([0.1, 0.0, 0.0]));
    expect(s.rest.talkState?.kind).toBe('pool');
    expect(s.pendingEvent).toBeNull();
  });

  it('TALK_CHOICE: 예/아니오 응답 페이지로 교체', () => {
    const withChoice: GameData = structuredClone(gameData);
    // 첫 휴식 대화 풀(관계 1티어)에 choice 줄을 심는다
    withChoice.dialogues.relationTiers[0] = [
      {
        textId: 'dlg.rel1.0',
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

  it('잠수 세션 종료 문구는 부재 변형 — "돌은 옆에 있었다"가 새지 않는다', () => {
    const data = riskyData();
    const s = run(
      init(),
      [
        { type: 'START_FOCUS', nowMs: T0 },
        ...ticks(100),
        { type: 'END_FOCUS', nowMs: T0 + 100_000 },
      ],
      seq([0.1, 0.0]),
      data,
    );
    expect(s.presence.state).toBe('absent');
    const mins = '2';
    expect(s.session.narratorLine).toBe(
      T('sys.focusEndAbsent').replaceAll('{mins}', mins),
    );
    expect(s.session.narratorLine).not.toBe(
      T('sys.focusEnd').replaceAll('{mins}', mins),
    );
  });

  it('잠수 중 반추는 부재 전용 문장만 — 재석 전제 문장이 새지 않는다', () => {
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
    // 반추가 남더라도 refl.absent 변형만 — read 반추(refl.read.*)는 절대 없음
    const absentTexts = variantsOf('refl.absent');
    const readTexts = variantsOf('refl.read.base');
    const reflections = s.session.journal.slice(1).map((j) => j.text);
    for (const line of reflections) {
      expect(readTexts).not.toContain(line);
      expect(absentTexts).toContain(line);
    }
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

describe('자유행동 게이지 — END_FOCUS 시간 정산', () => {
  it('자가충족: 발동은 틱에서, 게이지는 종료 정산 — 20분 세션 = 5×0.8', () => {
    // 생리 0 → selfCare 확률 1.0(매슬로 최우선). 틱마다 성공해도 게이지는 정산 1회
    let s: GameState = { ...init(), selectedAction: 'free' };
    s = run(
      s,
      [
        { type: 'START_FOCUS', nowMs: T0 },
        ...ticks(BALANCE.REFLECT_INTERVAL_FREE_SEC * 4), // 20분 (반추 틱 4회)
      ],
      seq([0.0]),
    );
    expect(s.session.freeCare).toBe('physiological'); // 발동 기록
    expect(s.stats.needs.physiological).toBe(0); // 집중 중엔 아직 미정산
    s = run(s, [{ type: 'END_FOCUS', nowMs: T0 + 1_200_000 }], seq([0.0]));
    // 20분 = 0.8u → 5 × 0.8 = 4, 시간 감소 −1.2×(20/60) (개정 v4-5)
    expect(s.stats.needs.physiological).toBeCloseTo(4 - 1.2 * (20 / 60), 5);
  });

  it('개인작업: END_FOCUS 세션당 1회 판정, 90분 만액·시간 비례 확률 (개정 v4-3)', () => {
    let s: GameState = {
      ...init(),
      selectedAction: 'free',
      stats: {
        ...init().stats,
        needs: { physiological: 100, safety: 100, belonging: 100, esteem: 100 },
      },
    };
    s = run(
      s,
      [
        { type: 'START_FOCUS', nowMs: T0 },
        ...ticks(BALANCE.REFLECT_INTERVAL_FREE_SEC * 4),
      ],
      seq([0.9]), // 틱에서는 개인작업 판정이 없다 — idle/반추만 흐른다
    );
    expect(s.stats.selfActualization).toBe(0); // 집중 중엔 미정산
    // 성공 롤: p = (0.05+0.25)×20/90 ≈ 0.0667 — rng 0.0이면 발동.
    // 획득은 발동당 고정 (확률이 시간 비례라 시간당 기대값은 길이 무관)
    const hit = run(s, [{ type: 'END_FOCUS', nowMs: T0 + 1_200_000 }], seq([0.0]));
    expect(hit.session.freeWorked).toBe(true);
    expect(hit.stats.selfActualization).toBeCloseTo(
      BALANCE.SELF_ACT_GAIN_PER_WORK,
      5,
    );
    expect('personalWork' in hit.memory).toBe(true); // 목격 토큰 (개정 v4-10)
    // 실패 롤: rng 0.9 > p — 발동 없음
    const miss = run(s, [{ type: 'END_FOCUS', nowMs: T0 + 1_200_000 }], seq([0.9]));
    expect(miss.session.freeWorked).toBe(false);
    expect(miss.stats.selfActualization).toBe(0);
  });
});

describe('병간호 (애착 위기 — 유기불안 극단)', () => {
  // 유기불안 상한 초과 상태를 만든다 (안정감 = 100 − |95−20| = 25)
  function sickProneInit(): GameState {
    const s = init();
    return {
      ...s,
      stats: { ...s.stats, abandonment: 95, intimacyThreat: 20, security: 25 },
    };
  }

  it('유기불안이 상한을 넘으면 병간호 발동 → 병간호만 가능', () => {
    const s = run(sickProneInit(), [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
    ]);
    expect(s.presence.sick).toBe(true);
    expect(s.selectedAction).toBe('nurse');
    const nurse = gameData.actions.find((a) => a.id === 'nurse')!;
    const read = gameData.actions.find((a) => a.id === 'read')!;
    expect(isActionAvailable(nurse, s)).toBe(true);
    expect(isActionAvailable(read, s)).toBe(false); // 아플 땐 다른 행동 불가
  });

  it('병간호 세션을 반복하면 두 축이 수렴해 회복한다 (2~3턴)', () => {
    let s: GameState = {
      ...sickProneInit(),
      presence: { ...init().presence, sick: true },
      selectedAction: 'nurse',
    };
    let turns = 0;
    while (s.presence.sick && turns < 6) {
      s = run(s, [
        { type: 'START_FOCUS', nowMs: T0 },
        { type: 'END_FOCUS', nowMs: T0 },
        { type: 'REST_END' },
      ]);
      turns++;
    }
    expect(s.presence.sick).toBe(false);
    expect(turns).toBeLessThanOrEqual(3);
    // 회복 시 selectedAction이 'nurse'로 남지 않고 유효 행동으로 리셋
    expect(s.selectedAction).not.toBe('nurse');
  });

  it('회복 후 재선택 없이 START_FOCUS해도 건강한 돌에게 병간호가 시작되지 않는다', () => {
    // 재석·안 아픔인데 selectedAction이 아직 'nurse'로 남은 경계 케이스
    const base = init();
    const s: GameState = {
      ...base,
      phase: 'actionSelect',
      selectedAction: 'nurse',
      presence: { ...base.presence, sick: false },
    };
    const after = run(s, [{ type: 'START_FOCUS', nowMs: T0 }]);
    expect(after.phase).toBe('actionSelect'); // 가드로 막힘 — 집중 시작 안 됨
  });
});

describe('상점 — 구매 ≠ 배치', () => {
  function richRest(): GameState {
    const base = toRest();
    return { ...base, care: { points: 5, carryMinutes: 0 } };
  }

  it('해금 루프: 신발 구매 → 산책 해금 (누워있기 시작 → 아이템으로 행동 확장)', () => {
    const walk = gameData.actions.find((a) => a.id === 'walk')!;
    const bare = createInitialState(T0, 'lie');
    expect(isActionAvailable(walk, bare)).toBe(false); // 시작엔 잠김
    const rest: GameState = {
      ...bare,
      phase: 'rest',
      restStep: 'shop',
      care: { points: 3, carryMinutes: 0 },
    };
    const s = run(rest, [{ type: 'BUY', itemId: 'shoes', nowMs: T0 }]);
    expect(s.items['shoes']).toEqual({ placed: false });
    expect(s.care.points).toBe(2); // 신발 가격 1
    expect(isActionAvailable(walk, s)).toBe(true); // 구매(=소유) 후 해금
  });

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

  it('배치 결정 전에는 다음 구매가 막힌다 (pendingPlacement 덮어쓰기 방지)', () => {
    let s = run(richRest(), [{ type: 'BUY', itemId: 'plant', nowMs: T0 }]);
    expect(s.pendingPlacement).toBe('plant');
    // 배치 결정 전 두 번째 구매 시도 → 무시 (plant 결정이 유지됨)
    const blocked = run(s, [{ type: 'BUY', itemId: 'soda', nowMs: T0 }]);
    expect(blocked.pendingPlacement).toBe('plant');
    expect('soda' in blocked.items).toBe(false);
    // plant 배치 결정 후에는 다음 구매 가능
    s = run(s, [
      { type: 'SET_PLACEMENT', itemId: 'plant', placed: true },
      { type: 'BUY', itemId: 'soda', nowMs: T0 },
    ]);
    expect(s.pendingPlacement).toBe('soda');
    expect(s.items['plant']).toEqual({ placed: true });
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

describe('SET_NOTIFY / SET_FOCUS_NOTIFY — 알림 설정 토글', () => {
  it('전체·휴식 키를 켜고 끄며 다른 키는 보존', () => {
    let s = init();
    // 기본값: 전체·휴식 on, 집중 구간(경계별) off
    expect(s.settings.notify.enabled).toBe(true);
    expect(s.settings.notify.restEnd).toBe(true);
    expect(s.settings.notify.focusMarks).toEqual([false, false, false]);

    s = run(s, [{ type: 'SET_NOTIFY', key: 'restEnd', on: false }]);
    expect(s.settings.notify.restEnd).toBe(false);
    expect(s.settings.notify.enabled).toBe(true); // 다른 키 보존
  });

  it('SET_FOCUS_NOTIFY는 경계 인덱스별로 켜고, 나머지는 보존', () => {
    let s = init();
    s = run(s, [{ type: 'SET_FOCUS_NOTIFY', index: 2, on: true }]);
    expect(s.settings.notify.focusMarks).toEqual([false, false, true]);
    s = run(s, [{ type: 'SET_FOCUS_NOTIFY', index: 0, on: true }]);
    expect(s.settings.notify.focusMarks).toEqual([true, false, true]);
    s = run(s, [{ type: 'SET_FOCUS_NOTIFY', index: 2, on: false }]);
    expect(s.settings.notify.focusMarks).toEqual([true, false, false]);
  });
});

describe('SET_FLOWTIME — 휴식 배정표 사용자 수정', () => {
  it('기본값은 기획서 규칙, 수정하면 그 표로 휴식이 배정된다', () => {
    let s = init();
    expect(s.settings.flowtime).toEqual({ bounds: [25, 50, 90], rests: [5, 10, 20, 30] });

    // 30분 미만은 3분 쉬도록 사용자가 수정
    s = run(s, [
      { type: 'SET_FLOWTIME', flowtime: { bounds: [30], rests: [3, 12] } },
    ]);
    expect(s.settings.flowtime).toEqual({ bounds: [30], rests: [3, 12] });

    // 25분 집중 → 수정 전이면 10분이지만, 이제 30분 미만이라 3분
    const rested = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(1500), // 25분
      { type: 'END_FOCUS', nowMs: T0 + 1_500_000 },
    ]);
    expect(rested.rest.totalSec).toBe(3 * 60);
  });

  it('잘못된 값(0·음수·소수)은 양의 정수로 정규화', () => {
    const s = run(init(), [
      { type: 'SET_FLOWTIME', flowtime: { bounds: [0, 55.6], rests: [-3, 10.2, 20] } },
    ]);
    expect(s.settings.flowtime).toEqual({ bounds: [1, 56], rests: [1, 10, 20] });
  });

  it('비오름차순 bounds는 정렬돼 라벨과 배정이 어긋나지 않는다', () => {
    const s = run(init(), [
      { type: 'SET_FLOWTIME', flowtime: { bounds: [60, 40, 90], rests: [5, 10, 20, 30] } },
    ]);
    expect(s.settings.flowtime.bounds).toEqual([40, 60, 90]);
  });
});

describe('SET_PAUSE_ON_HIDE — 탭 이탈 시 일시정지 토글', () => {
  it('기본값은 켜짐(기획서 동작), 끄고 켤 수 있다', () => {
    let s = init();
    expect(s.settings.pauseOnHide).toBe(true);
    s = run(s, [{ type: 'SET_PAUSE_ON_HIDE', on: false }]);
    expect(s.settings.pauseOnHide).toBe(false);
    s = run(s, [{ type: 'SET_PAUSE_ON_HIDE', on: true }]);
    expect(s.settings.pauseOnHide).toBe(true);
  });
});

describe('SET_SOUND — 효과음 토글', () => {
  it('기본값은 켜짐, 끄고 켤 수 있다', () => {
    let s = init();
    expect(s.settings.soundOn).toBe(true);
    s = run(s, [{ type: 'SET_SOUND', on: false }]);
    expect(s.settings.soundOn).toBe(false);
    s = run(s, [{ type: 'SET_SOUND', on: true }]);
    expect(s.settings.soundOn).toBe(true);
  });
});

describe('엔딩 — 자아실현 완성 → 엔딩 전 대화 → 엔딩', () => {
  const TALKS = gameData.endings.preEndingTalks.length;
  const DAY = 86_400_000;

  /** 1차 토큰 게이트 충족 기억 (개정 v4-10): 행동 전종 + 첫 선택/구매 + 개인작업 목격 */
  function tokenMemory(): GameState['memory'] {
    let m: GameState['memory'] = {};
    for (const a of gameData.actions)
      if (a.id !== 'nurse') m = remember(m, a.id, 3, T0);
    m = remember(m, 'choice', 2, T0);
    m = remember(m, 'personalWork', 3, T0);
    m = remember(m, 'buy-plant', 3, T0);
    return m;
  }

  function selfActDone(): GameState {
    const base = toRest();
    return {
      ...base,
      stats: { ...base.stats, selfActualization: 100 },
      relationTier: gameData.dialogues.relationTiers.length, // 7티어 게이트 (개정 v4-9)
      memory: tokenMemory(),
      // 토큰 기억이 firstAction 마일스톤을 다시 깨우지 않게 — 지나온 세이브로 취급
      milestonesFired: gameData.events.milestones.map((m) => m.id),
      settings: { ...base.settings, noiseOn: true, notifAsked: true },
      care: { points: 7, carryMinutes: 3 },
      items: { ...base.items, plant: { placed: true } },
    };
  }

  it('7티어·토큰 게이트 미충족이면 엔딩 전 대화가 나오지 않는다 (개정 v4-9)', () => {
    const noTier: GameState = { ...selfActDone(), relationTier: 5 };
    let s = run(noTier, [
      { type: 'START_FOCUS', nowMs: T0 + DAY },
      { type: 'END_FOCUS', nowMs: T0 + DAY },
    ]);
    expect(s.rest.talkState).toBeNull();
    expect(s.endingTalksSeen).toBe(0);

    const noTokens: GameState = { ...selfActDone(), memory: {} };
    s = run(noTokens, [
      { type: 'START_FOCUS', nowMs: T0 + DAY },
      { type: 'END_FOCUS', nowMs: T0 + DAY },
    ]);
    expect(s.endingTalksSeen).toBe(0);
  });

  it('엔딩 전 대화는 서로 다른 날 하루 1개씩 자동 노출, 다 보기 전에는 엔딩 없음', () => {
    let s = selfActDone();
    expect(run(s, [{ type: 'REST_END' }]).phase).toBe('actionSelect');

    for (let i = 0; i < TALKS; i++) {
      const day = T0 + (i + 1) * DAY;
      s = run(s, [
        { type: 'START_FOCUS', nowMs: day },
        { type: 'END_FOCUS', nowMs: day },
      ]);
      expect(s.rest.talkState?.kind).toBe('ending');
      expect(s.endingTalksSeen).toBe(i + 1);
      if (i === 0) {
        // 같은 날 두 번째 휴식에는 나오지 않는다 (하루 1개 게이트)
        const sameDay = run(s, [
          { type: 'REST_END' },
          { type: 'START_FOCUS', nowMs: day + 3_600_000 },
          { type: 'END_FOCUS', nowMs: day + 3_600_000 },
        ]);
        expect(sameDay.endingTalksSeen).toBe(1);
      }
    }
    s = run(s, [{ type: 'REST_END' }]);
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
      // 존경을 건드리지 않는 행동(자유행동)으로 고정 — 동거 잠식만 검증
      selectedAction: 'free',
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
        plannedSessions: 0,
        lowIntimacyProgress: 0,
        returnPending: false,
        sick: false,
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

  it('MARK_NOTIF_ASKED: 알림 권한 요청 1회성 플래그', () => {
    expect(init().settings.notifAsked).toBe(false);
    const s = run(init(), [{ type: 'MARK_NOTIF_ASKED' }]);
    expect(s.settings.notifAsked).toBe(true);
    // 멱등 — 다시 호출해도 동일 참조 유지
    expect(run(s, [{ type: 'MARK_NOTIF_ASKED' }])).toBe(s);
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

describe('서사 비트 게이트 + 보장 위기 아크 (개정 v4-7/8)', () => {
  const DAY = 86_400_000;

  it('티어 승급은 하루 1회 — 임계 초과분은 이월된다', () => {
    const base = init();
    let s: GameState = { ...base, stats: { ...base.stats, affection: 200 } };
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
    ]);
    expect(s.relationTier).toBe(2);
    // 같은 날 두 번째 세션 — 승급 없음
    s = run(s, [
      { type: 'REST_END' },
      { type: 'START_FOCUS', nowMs: T0 + 3_600_000 },
      { type: 'END_FOCUS', nowMs: T0 + 3_600_000 },
    ]);
    expect(s.relationTier).toBe(2);
    // 다음 날 — 3티어 승급 + 잠수 아크 예약 (개정 v4-8)
    s = run(s, [
      { type: 'REST_END' },
      { type: 'START_FOCUS', nowMs: T0 + DAY },
      { type: 'END_FOCUS', nowMs: T0 + DAY },
    ]);
    expect(s.relationTier).toBe(3);
    expect(s.pendingCrisis).toBe('retreat');
  });

  it('3티어 잠수 아크: 다음 세션 시작에 돌이 물러난다 (1회성)', () => {
    const base = init();
    let s: GameState = { ...base, relationTier: 3, pendingCrisis: 'retreat' };
    s = run(s, [{ type: 'START_FOCUS', nowMs: T0 }]);
    expect(isRockPresent(s)).toBe(false);
    expect(s.pendingCrisis).toBeNull();
    expect(s.crisisArcsFired).toContain('retreat');
    expect(
      s.session.journal.some((j) =>
        variantsOf('sys.journal.crisisRetreat').includes(j.text),
      ),
    ).toBe(true);
  });

  it('5티어 병간호 아크: 세션 종료에 앓아눕는다 → 병간호만 가능', () => {
    const base = init();
    let s: GameState = { ...base, relationTier: 5, pendingCrisis: 'sick' };
    s = run(s, [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'END_FOCUS', nowMs: T0 },
    ]);
    expect(s.presence.sick).toBe(true);
    expect(s.pendingCrisis).toBeNull();
    expect(s.crisisArcsFired).toContain('sick');
    const nurse = gameData.actions.find((a) => a.id === 'nurse')!;
    expect(isActionAvailable(nurse, s)).toBe(true);
    expect(
      s.session.journal.some((j) =>
        variantsOf('sys.journal.crisisSick').includes(j.text),
      ),
    ).toBe(true);
  });
});

describe('휴식 준수 배율 — 디메리트 계단 (개정 v4-4)', () => {
  it('스킵 ×0.5 / 절반 ×0.75 / 완주 ×1.0 이 다음 세션 게이지 정산에 곱해진다', () => {
    const base = run({ ...init(), selectedAction: 'lie' }, [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(1500),
      { type: 'END_FOCUS', nowMs: T0 + 1_500_000 },
    ]);
    // 25분 lie: 생리 5×1 − 감소 1.2×(25/60)=0.5 → 4.5
    const p0 = base.stats.needs.physiological;
    expect(p0).toBeCloseTo(4.5, 5);
    const restMs = base.rest.totalSec * 1000;
    const endAt = T0 + 1_500_000;
    const again = (startAt: number): GameState =>
      run(base, [
        { type: 'START_FOCUS', nowMs: startAt },
        ...ticks(1500),
        { type: 'END_FOCUS', nowMs: startAt + 1_500_000 },
      ]);
    // 완주: +5×1.0 − 0.5
    expect(again(endAt + restMs).stats.needs.physiological).toBeCloseTo(
      p0 + 5 - 0.5,
      5,
    );
    // 절반: +5×0.75 − 0.5
    expect(again(endAt + restMs / 2).stats.needs.physiological).toBeCloseTo(
      p0 + 3.75 - 0.5,
      5,
    );
    // 스킵: +5×0.5 − 0.5. 정성은 배율과 무관 (개정 v4-4)
    const skipped = again(endAt);
    expect(skipped.stats.needs.physiological).toBeCloseTo(p0 + 2.5 - 0.5, 5);
    expect(skipped.care.points).toBe(2); // 25분×2 = 2pt — 배율 미적용
  });

  it('스킵·부족은 세션 시작 일지에 관찰 문장으로 텔레그래프된다 (수치 비노출)', () => {
    const base = run({ ...init(), selectedAction: 'lie' }, [
      { type: 'START_FOCUS', nowMs: T0 },
      ...ticks(1500),
      { type: 'END_FOCUS', nowMs: T0 + 1_500_000 },
    ]);
    const restMs = base.rest.totalSec * 1000;
    const endAt = T0 + 1_500_000;
    const journalOf = (startAt: number) =>
      run(base, [{ type: 'START_FOCUS', nowMs: startAt }]).session.journal.map(
        (j) => j.text,
      );
    const hasLine = (texts: string[], id: string) =>
      texts.some((t2) => variantsOf(id).includes(t2));
    // 스킵(×0.5) → restSkipped, 절반(×0.75) → restShort, 완주 → 없음
    expect(hasLine(journalOf(endAt), 'sys.journal.restSkipped')).toBe(true);
    expect(hasLine(journalOf(endAt + restMs / 2), 'sys.journal.restShort')).toBe(true);
    const full = journalOf(endAt + restMs);
    expect(hasLine(full, 'sys.journal.restSkipped')).toBe(false);
    expect(hasLine(full, 'sys.journal.restShort')).toBe(false);
  });
});

describe('소리풍경 설정 (M9)', () => {
  it('SET_NOISE_LAYER: 레이어 음소거 토글 — 중복 없이', () => {
    let s = run(init(), [
      { type: 'SET_NOISE_LAYER', layer: 'fireplace', muted: true },
      { type: 'SET_NOISE_LAYER', layer: 'fireplace', muted: true },
      { type: 'SET_NOISE_LAYER', layer: 'birdsWind', muted: true },
    ]);
    expect(s.settings.noiseMuted).toEqual(['fireplace', 'birdsWind']);
    s = run(s, [{ type: 'SET_NOISE_LAYER', layer: 'fireplace', muted: false }]);
    expect(s.settings.noiseMuted).toEqual(['birdsWind']);
  });
});

describe('테마 설정 (M10)', () => {
  it('SET_THEME: 자동/라이트/다크 전환', () => {
    let s = run(init(), [{ type: 'SET_THEME', theme: 'light' }]);
    expect(s.settings.theme).toBe('light');
    s = run(s, [{ type: 'SET_THEME', theme: 'auto' }]);
    expect(s.settings.theme).toBe('auto');
  });
});
