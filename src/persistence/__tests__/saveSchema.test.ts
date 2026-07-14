import { describe, expect, it } from 'vitest';
import { readSave, wrapSave, SAVE_FORMAT } from '../saveSchema';
import { createInitialState, SCHEMA_VERSION } from '../../game/stateMachine';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

describe('saveSchema — 봉투·검증·마이그레이션', () => {
  const state = createInitialState(T0, 'read');

  it('wrapSave → readSave 라운드트립', () => {
    const env = wrapSave(state, T0);
    expect(env.format).toBe(SAVE_FORMAT);
    expect(env.savedAt).toBe(T0);
    const res = readSave(env);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.schemaVersion).toBe(SCHEMA_VERSION);
  });

  it('포맷 불일치 → format', () => {
    expect(readSave({ format: 999, savedAt: T0, state })).toEqual({
      ok: false,
      reason: 'format',
    });
    expect(readSave(null)).toEqual({ ok: false, reason: 'format' });
    expect(readSave('nope')).toEqual({ ok: false, reason: 'format' });
  });

  it('구조 이상 → shape', () => {
    expect(readSave({ format: SAVE_FORMAT, savedAt: T0, state: {} })).toEqual({
      ok: false,
      reason: 'shape',
    });
    // stats는 있는데 needs가 없으면 이상
    const broken = { ...state, stats: { mood: 1 } };
    expect(
      readSave({ format: SAVE_FORMAT, savedAt: T0, state: broken }),
    ).toEqual({ ok: false, reason: 'shape' });
  });

  it('마이그레이션 불가한 버전 → version', () => {
    const oldState = { ...state, schemaVersion: 1 };
    expect(
      readSave({ format: SAVE_FORMAT, savedAt: T0, state: oldState }),
    ).toEqual({ ok: false, reason: 'version' });
  });
});
