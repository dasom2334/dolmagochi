import { describe, expect, it } from 'vitest';
import { createGameStore, gameData } from '../../store/gameStore';
import { createInitialState } from '../stateMachine';

const T = (id: string) => (gameData.text[id]?.[0] ?? []).join('\n');

/**
 * 풀사이클 시뮬레이션 (스키마 v3):
 * 자유행동(개인작업) → 자아실현 완성 → 엔딩 전 대화 소진 → 엔딩 →
 * 떠나보내기 → apart(빈자리) → 돌의 방문 → 보내주기 → 추억 회상.
 * rng()=0 고정: 개인작업·포섀도·방문 항상 발동, 인덱스 0 선택 — 결정적 진행.
 */
describe('통합: 풀사이클 → 엔딩 → 빈자리', () => {
  it('자아실현을 완성하고 떠나보낸 뒤, 빈자리에서 방문과 회상을 맞는다', () => {
    const T0 = new Date(2026, 0, 10, 9, 0, 0).getTime();
    let now = T0;

    // 욕구 4종 충족 상태에서 시작 (개인작업 국면) + 승급 마일스톤은 소진된 것으로
    const initial = createInitialState(T0, 'read');
    initial.stats.needs = {
      physiological: 100,
      safety: 100,
      belonging: 100,
      esteem: 100,
    };
    initial.milestonesFired = ['stage-up-2', 'stage-up-3'];
    // 개인작업은 END_FOCUS 시간 정산(25분 세션 = 10×25/90 ≈ +2.78)
    // — 2세션 내 완성을 위해 95에서 시작
    initial.stats.selfActualization = 95;

    const store = createGameStore({
      rng: () => 0,
      now: () => now,
      initialState: initial,
    });
    const get = () => store.getState().state;
    const dispatch = store.getState().dispatch;
    const focusFor = (sec: number) => {
      for (let t = 0; t < sec; t += 10) {
        store.getState().tick(10);
        now += 10_000;
      }
    };

    // ── 세션 1: 자유행동 25분 — 개인작업 1회(세션당 1회) ──
    dispatch({ type: 'SELECT_ACTION', actionId: 'free' });
    dispatch({ type: 'START_FOCUS', nowMs: now });
    expect(get().session.journal[0].text).toBe(T('act.free.start'));
    focusFor(1500);
    expect(get().session.journal.map((j) => j.text)).toContain(
      T('refl.personalWork'),
    );

    dispatch({ type: 'END_FOCUS', nowMs: now });
    // 개인작업은 END_FOCUS에서 시간 정산: 25분 세션 = 10 × 25/90
    expect(get().stats.selfActualization).toBeCloseTo(95 + (10 * 25) / 90, 5);
    expect(get().care).toEqual({ points: 1, carryMinutes: 0 });
    expect(get().rest.summary).toEqual({ mins: 25, earned: 1 });

    // 휴식: 작은 행동 1회 → 대화(포섀도) → 구매·배치 → 다음 세션
    dispatch({ type: 'REST_ACT', key: 'glance' });
    expect(get().rest.actUsed).toBe(true);

    dispatch({ type: 'TALK' });
    expect(get().rest.talkState?.kind).toBe('foreshadow');
    expect(get().pendingEvent).not.toBeNull();

    dispatch({ type: 'BUY', itemId: 'plant', nowMs: now });
    expect(get().pendingPlacement).toBe('plant');
    dispatch({ type: 'SET_PLACEMENT', itemId: 'plant', placed: true });
    expect(get().items['plant']).toEqual({ placed: true });
    expect(get().care.points).toBe(0);

    dispatch({ type: 'REST_END' });
    expect(get().phase).toBe('actionSelect');

    // ── 세션 2: 포섀도 이벤트 → 추억 기록, 자아실현 완성 ──
    dispatch({ type: 'START_FOCUS', nowMs: now });
    focusFor(300);
    expect(get().session.choiceState?.source).toBe('foreshadow');
    dispatch({ type: 'CHOICE_PICKED', optionIndex: 0, nowMs: now });
    expect(get().pendingEvent).toBeNull();
    expect(get().remembrances.map((r) => r.id)).toContain('fore-bird');

    focusFor(1200);
    dispatch({ type: 'END_FOCUS', nowMs: now });
    expect(get().stats.selfActualization).toBe(100); // 두 번째 정산으로 완성(클램프)

    // ── 엔딩 전 대화 소진 → 엔딩 ──
    const TALKS = gameData.endings.preEndingTalks.length;
    for (let i = 0; i < TALKS; i++) {
      dispatch({ type: 'TALK' });
      expect(get().rest.talkState?.kind).toBe('ending');
      dispatch({ type: 'REST_END' });
      if (i < TALKS - 1) {
        dispatch({ type: 'START_FOCUS', nowMs: now });
        dispatch({ type: 'END_FOCUS', nowMs: now });
      }
    }
    expect(get().phase).toBe('ending');

    // ── 떠나보내기 → apart: 아무 것도 리셋되지 않는다 ──
    dispatch({ type: 'CHOOSE_FAREWELL' });
    dispatch({ type: 'EPILOGUE_DONE' });
    expect(get().era).toBe('apart');
    expect(get().phase).toBe('actionSelect');
    expect(get().items['plant']).toEqual({ placed: true });
    expect(get().care.points).toBe(1);
    expect(get().remembrances.length).toBeGreaterThan(0);

    // ── 빈자리: 돌이 놀러온다 (rng 0 → 방문 확정, 1세션) → 떠나려는 기색 → 보내주기 ──
    dispatch({ type: 'START_FOCUS', nowMs: now });
    expect(get().apart.visiting).toBe(true);
    dispatch({ type: 'END_FOCUS', nowMs: now });
    expect(get().apart).toMatchObject({ visiting: true, leavePending: true });

    dispatch({ type: 'VISIT_HOLD', hold: false });
    expect(get().apart.visiting).toBe(false); // 자유롭게 떠났다

    dispatch({ type: 'TALK' }); // 떠난 뒤의 대화 = 추억 회상 (reveal이 처음 붙는다)
    expect(get().rest.talkState?.kind).toBe('recall');
    expect(get().rest.talkState?.pages).toEqual([
      T('rem.fore-bird.summary'),
      T('rem.fore-bird.reveal'),
    ]);
  });
});
