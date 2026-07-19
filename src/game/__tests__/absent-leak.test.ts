/**
 * 부재 누출 회귀 (피드백4-1): 돌이 곁에 없는데 '돌이 있는 듯한' 문구가 나오면 안 된다.
 * 실제 리듀서를 잠수 상태로 돌려서, 세션·휴식 경로가 내보내는 모든 문장에
 * 돌 언급이 섞이지 않는지 확인한다. (3차는 돌 대신 아이가 화면에 있다)
 */
import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  transition,
  weathersOfSeason,
} from '../stateMachine';
import { resolveSlot } from '../text';
import { resolveSeason } from '../timeOfDay';
import type { GameEvent, GameState } from '../types';
import { mulberry32, type Rng } from '../rng';
import { gameData } from '../../store/gameStore';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

function run(s: GameState, events: GameEvent[], rng: Rng = mulberry32(7)): GameState {
  return events.reduce((st, e) => transition(st, e, { rng, data: gameData }), s);
}

/** 잠수 중(육성) 상태 */
function absent(): GameState {
  const s = createInitialState(T0, 'lie');
  return {
    ...s,
    phase: 'actionSelect',
    presence: { ...s.presence, state: 'absent' },
  };
}

/**
 * '곁에 있는 돌'을 전제하는 문장인가.
 * 부재를 명시하는 표현('돌이 없다', '돌이 떠난 방')은 정상이므로 제외한다.
 */
const ABSENCE_OK = /돌(이|은)?\s*(없|떠난|오지|돌아)/;
const MENTIONS_ROCK = /돌(은|이|을|과|도|에게|의|만|처럼|이나)?\s/;
const leaks = (line: string) => MENTIONS_ROCK.test(line) && !ABSENCE_OK.test(line);

function linesOf(s: GameState): string[] {
  return [
    ...s.session.journal.map((j) => j.text),
    s.session.narratorLine ?? '',
    s.rest.talkState?.pages.join('\n') ?? '',
  ].filter(Boolean);
}

describe('부재 누출 (피드백4-1)', () => {
  it('잠수 중 세션은 돌을 언급하지 않는다 — 시작·앰비언트·문턱·종료', () => {
    // 25분 문턱을 넘겨 타임마크까지 발화시킨다
    const s = run(absent(), [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'TICK', dtSec: 1500 },
      { type: 'TICK', dtSec: 60 },
      { type: 'END_FOCUS', nowMs: T0 + 1560_000 },
    ]);
    const leaked = linesOf(s).filter(leaks);
    expect(leaked, `누출: ${leaked.join(' | ')}`).toEqual([]);
  });

  it('잠수 중 휴식 대화·작은 행동도 돌을 언급하지 않는다', () => {
    let s = run(absent(), [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'TICK', dtSec: 300 },
      { type: 'END_FOCUS', nowMs: T0 + 300_000 },
    ]);
    // 작은 행동 4종 전부 — 부재 변형이 빠진 것이 있으면 여기서 걸린다
    for (const act of gameData.restActs) {
      const after = run({ ...s, rest: { ...s.rest, actUsed: false } }, [
        { type: 'REST_ACT', key: act.key },
      ]);
      const actLine = after.session.narratorLine ?? '';
      expect(actLine).not.toBe('');
      expect(leaks(actLine), `${act.key} 누출: ${actLine}`).toBe(false);
    }
    // 휴식 대화도 부재 풀에서만 나온다
    const talked = run(s, [{ type: 'TALK' }]);
    const talkLine = talked.rest.talkState?.pages.join('\n') ?? '';
    expect(talkLine).not.toBe('');
    expect(leaks(talkLine), `대화 누출: ${talkLine}`).toBe(false);
  });

  it('잠수 중 날씨를 바꿔도 돌 반응이 섞이지 않는다', () => {
    const base = absent();
    // 이 계절에 살 수 있는 날씨 중 현재와 다른 것 하나
    const target = weathersOfSeason(resolveSeason(base.settings, T0)).find(
      (w) => w !== base.weather,
    )!;
    const s = run({ ...base, care: { ...base.care, points: 99 } }, [
      { type: 'SET_WEATHER', weather: target, nowMs: T0 },
    ]);
    const line = s.session.narratorLine ?? '';
    expect(line).not.toBe('');
    expect(leaks(line), `누출: ${line}`).toBe(false);
  });
});

describe('동석 축 해석 (피드백4-2)', () => {
  it('부재 변형이 필요한 슬롯은 전부 .absent를 갖는다', () => {
    // 규칙 기반 해석이라 변형이 없으면 조용히 기본(돌 전제)으로 폴백한다.
    // validate-data가 같은 검사를 하지만, 리팩터링 중 회귀를 여기서도 잡는다.
    const slots = [
      ...gameData.restActs.map((a) => a.linesId),
      ...gameData.timeMarks.focus.map((m) => m.textId),
      ...gameData.timeMarks.rest.map((m) => m.textId),
      'sys.focusEnd',
      'sys.notification.restEnd',
    ];
    const missing = slots.filter((id) => !gameData.text[`${id}.absent`]);
    expect(missing, `부재 변형 누락: ${missing.join(', ')}`).toEqual([]);
  });

  it('companion은 전용 변형이 없으면 absent로 내려온다 — 기본으로 새지 않는다', () => {
    for (const id of gameData.timeMarks.focus.map((m) => m.textId)) {
      const resolved = resolveSlot(gameData.text, id, 'companion');
      expect(resolved).not.toBe(id);
    }
  });

  it('3차(아이와 지내는 중)에도 돌이 있는 듯한 문구가 나오지 않는다', () => {
    const base = createInitialState(T0, 'lie');
    const s3: GameState = {
      ...base,
      phase: 'actionSelect',
      era: 'apart',
      planted: true,
      plantedAt: T0 - 8 * 86_400_000,
      letGoCount: 1,
      bloomSeen: true,
      sproutGrowth: 100,
      memory: { 'tree-awakening': { w: 1, count: 1, lastAt: T0 } },
    };
    const s = run(s3, [
      { type: 'START_FOCUS', nowMs: T0 },
      { type: 'TICK', dtSec: 1500 },
      { type: 'TICK', dtSec: 60 },
      { type: 'END_FOCUS', nowMs: T0 + 1560_000 },
    ]);
    const leaked = linesOf(s).filter(leaks);
    expect(leaked, `누출: ${leaked.join(' | ')}`).toEqual([]);
  });
});
