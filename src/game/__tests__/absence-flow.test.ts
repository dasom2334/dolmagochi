import { describe, expect, it } from 'vitest';
import { createInitialState, isRockPresent, transition } from '../stateMachine';
import type { GameData } from '../../data/schema';
import type { GameEvent, GameState } from '../types';
import type { Rng } from '../rng';
import { gameData } from '../../store/gameStore';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();
const T = (id: string) => (gameData.text[id]?.[0] ?? []).join('\n');

function seq(values: number[]): Rng {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}
function run(s: GameState, events: GameEvent[], rng: Rng, data: GameData): GameState {
  return events.reduce((st, e) => transition(st, e, { rng, data }), s);
}
/** read를 고친밀(4)로 만들어 잠수를 확률 발동시키는 데이터 */
function riskyData(): GameData {
  const d: GameData = structuredClone(gameData);
  d.actions.find((a) => a.id === 'read')!.intimacy = 4;
  return d;
}

/**
 * 잠수 플로우 전체: 발동 → 부재 중 게임 계속 → 저친밀 누적으로만 복귀 →
 * 복귀 대화 → 첫 복귀 마일스톤 1회성 → 호감도 무손실.
 */
describe('잠수 플로우 (absence)', () => {
  it('발동→부재 게임 계속→저친밀 복귀→복귀 대화→first-return 1회성, 호감도 무손실', () => {
    const data = riskyData();
    const init = { ...createInitialState(T0, 'read'), items: { book: { placed: false } } };
    const affection0 = init.stats.affection;

    // 발동: 고친밀(read=4) 접근 → 확률 판정 통과(0.1<0.35), 부재 1세션(0.0)
    let s = run(init, [{ type: 'START_FOCUS', nowMs: T0 }], seq([0.1, 0.0]), data);
    expect(s.presence.state).toBe('absent');
    expect(isRockPresent(s)).toBe(false);
    expect(s.session.journal[0].text).toBe(T('sys.journal.sessionStartAbsent'));

    // 부재 중에도 집중/휴식 사이클은 정상 진행
    s = run(
      s,
      [
        { type: 'END_FOCUS', nowMs: T0 },
        { type: 'REST_END' },
      ],
      seq([0.9]),
      data,
    );
    expect(s.phase).toBe('actionSelect');
    // 고친밀 세션은 복귀 누적에 카운트되지 않아 여전히 부재
    expect(s.presence.state).toBe('absent');

    // 저친밀(free) 세션을 마쳐야 복귀 — "정답은 공부다"
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

    // 복귀 대화: absentReturn + 첫 복귀는 first-return 마일스톤 소진
    s = run(s, [{ type: 'TALK' }], seq([0.9]), data);
    expect(s.rest.talkState?.kind).toBe('return');
    expect(s.rest.talkState?.pages.join('\n')).toBe(T('dlg.return.line'));
    expect(s.milestonesFired).toContain('first-return');

    s = run(s, [{ type: 'TALK_CHOICE', yes: true }], seq([0.9]), data);
    expect(s.rest.talkState?.pages.join('\n')).toBe(T('dlg.return.yes'));

    // 호감도는 잠수 내내 손실 없음 (잠수 = 호감도 삭감 아님)
    expect(s.stats.affection).toBeGreaterThanOrEqual(affection0);

    // 두 번째 복귀에서는 first-return이 다시 발화하지 않는다 (1회성)
    const again: GameState = {
      ...s,
      presence: { ...s.presence, returnPending: true },
      rest: { ...s.rest, talkPressed: false, talkState: null },
    };
    const after = run(again, [{ type: 'TALK' }], seq([0.9]), data);
    expect(
      after.milestonesFired.filter((id) => id === 'first-return'),
    ).toHaveLength(1);
  });

  it('부재 중 휴식 대화는 부재 풀만 — 없는 돌이 말을 걸지 않는다', () => {
    const data = riskyData();
    const s = run(
      { ...createInitialState(T0, 'read'), items: { book: { placed: false } } },
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
    expect(s.milestonesFired).toHaveLength(0);
  });
});
