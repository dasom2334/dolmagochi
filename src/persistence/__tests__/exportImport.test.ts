import { describe, expect, it } from 'vitest';
import { exportSaveJson, importSaveJson } from '../exportImport';
import { createGameStore } from '../../store/gameStore';

const T0 = new Date(2026, 0, 10, 9, 0, 0).getTime();

describe('exportImport — 라운드트립·오류 내성', () => {
  it('내보내기 → 불러오기 상태 동일성 (플레이 후 상태)', () => {
    // 몇 이벤트를 돌려 비자명한 상태를 만든다
    let now = T0;
    const store = createGameStore({ rng: () => 0, now: () => now });
    const d = store.getState().dispatch;
    d({ type: 'SELECT_ACTION', actionId: 'free' });
    d({ type: 'START_FOCUS', nowMs: now });
    store.getState().tick(1500);
    now += 1_500_000;
    d({ type: 'END_FOCUS', nowMs: now });
    d({ type: 'BUY', itemId: 'plant', nowMs: now });
    d({ type: 'SET_PLACEMENT', itemId: 'plant', placed: true });

    const original = store.getState().state;
    const json = exportSaveJson(original, now);
    const res = importSaveJson(json);
    expect(res.ok).toBe(true);
    if (res.ok) {
      // JSON 왕복이므로 깊은 동등성
      expect(res.state).toEqual(original);
      expect(res.state.items.plant).toEqual({ placed: true });
      expect(res.state.care.points).toBe(0); // 25분=1정성, 화분 구매로 −1
    }
  });

  it('파싱 실패 → parse', () => {
    expect(importSaveJson('{ not json')).toEqual({
      ok: false,
      reason: 'parse',
    });
    expect(importSaveJson('돌처럼 침묵')).toEqual({
      ok: false,
      reason: 'parse',
    });
  });

  it('유효한 JSON이지만 세이브가 아니면 format', () => {
    expect(importSaveJson('{"hello":1}')).toEqual({
      ok: false,
      reason: 'format',
    });
  });
});
