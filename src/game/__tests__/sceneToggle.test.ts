import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  SCENE_TOGGLE_DEFAULTS,
  SCHEMA_VERSION,
  transition,
} from '../stateMachine';
import { readSave, SAVE_FORMAT, wrapSave } from '../../persistence/saveSchema';
import { mulberry32 } from '../rng';
import { gameData } from '../../store/gameStore';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();
const ctx = { rng: mulberry32(1), data: gameData };

describe('TOGGLE_SCENE — 눌러서 켜고 끈 상태는 세이브에 남는다', () => {
  it('누르면 뒤집히고, 다시 누르면 돌아온다', () => {
    const s0 = createInitialState(T0, 'read');
    expect(s0.sceneToggles['living-fire']).toBe(true);

    const s1 = transition(s0, { type: 'TOGGLE_SCENE', id: 'living-fire' }, ctx);
    expect(s1.sceneToggles['living-fire']).toBe(false);

    const s2 = transition(s1, { type: 'TOGGLE_SCENE', id: 'living-fire' }, ctx);
    expect(s2.sceneToggles['living-fire']).toBe(true);
  });

  it('한 자리를 눌러도 다른 자리는 그대로', () => {
    const s = transition(
      createInitialState(T0, 'read'),
      { type: 'TOGGLE_SCENE', id: 'bed-fan' },
      ctx,
    );
    expect(s.sceneToggles['bed-fan']).toBe(false);
    expect(s.sceneToggles['living-fire']).toBe(true);
    expect(s.sceneToggles['bed-lamp']).toBe(true);
  });

  it('저장·복원을 지나도 꺼 둔 불은 꺼져 있다', () => {
    const s = transition(
      createInitialState(T0, 'read'),
      { type: 'TOGGLE_SCENE', id: 'living-lamp' },
      ctx,
    );
    const res = readSave(wrapSave(s, T0));

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.sceneToggles['living-lamp']).toBe(false);
  });

  it('이 필드가 없던 옛 세이브(v29)는 시작값으로 열린다', () => {
    const old = {
      ...createInitialState(T0, 'read'),
      schemaVersion: 29,
    } as Record<string, unknown>;
    delete old.sceneToggles;

    const res = readSave({ format: SAVE_FORMAT, savedAt: T0, state: old });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.schemaVersion).toBe(SCHEMA_VERSION);
      expect(res.state.sceneToggles).toEqual(SCENE_TOGGLE_DEFAULTS);
    }
  });
});
