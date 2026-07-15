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
    const badNeeds = { ...state, stats: { mood: 1 } };
    expect(
      readSave({ format: SAVE_FORMAT, savedAt: T0, state: badNeeds }),
    ).toEqual({ ok: false, reason: 'shape' });
  });

  it('키는 있지만 값이 객체가 아니면 → shape (주입 후 크래시 방지)', () => {
    // 예: rest: null 이면 복원 후 state.rest.endsAt 접근에서 크래시 → 여기서 걸러야 함
    for (const k of [
      'rest',
      'session',
      'care',
      'presence',
      'items',
      'stats',
      'settings',
      'memory',
    ]) {
      const broken = { ...state, [k]: null };
      expect(
        readSave({ format: SAVE_FORMAT, savedAt: T0, state: broken }),
        `${k}: null 은 shape여야 함`,
      ).toEqual({ ok: false, reason: 'shape' });
    }
  });

  it('마이그레이션 불가한 버전 → version', () => {
    const oldState = { ...state, schemaVersion: 1 };
    expect(
      readSave({ format: SAVE_FORMAT, savedAt: T0, state: oldState }),
    ).toEqual({ ok: false, reason: 'version' });
  });

  it('v3 세이브(알림·Flowtime 설정 없음) → 최신으로 체인 마이그레이션, 기본값 주입', () => {
    // 구 세이브: settings에 notify·flowtime이 없는 상태
    const v3settings = { noiseOn: true, notifAsked: true, locale: 'ko' };
    const v3 = { ...state, schemaVersion: 3, settings: v3settings };
    const res = readSave({ format: SAVE_FORMAT, savedAt: T0, state: v3 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.schemaVersion).toBe(SCHEMA_VERSION);
      expect(res.state.settings.notify.enabled).toBe(true); // v3→v4
      expect(res.state.settings.flowtime).toEqual({
        bounds: [25, 50, 90],
        rests: [5, 10, 20, 30],
      }); // v4→v5
      expect(res.state.settings.pauseOnHide).toBe(true); // v5→v6
      expect(res.state.settings.soundOn).toBe(true); // v6→v7
      expect(res.state.settings.noiseOn).toBe(true); // 기존 필드 보존
    }
  });

  it('깨진 flowtime(길이 불일치·비정수)이 로드 시 정규화된다 (NaN 휴식 방지)', () => {
    const broken = {
      ...state,
      settings: {
        ...state.settings,
        flowtime: { bounds: [90, 25, 50, 70], rests: [5, -1] }, // 길이·순서·부호 전부 깨짐
      },
    };
    const res = readSave({ format: SAVE_FORMAT, savedAt: T0, state: broken });
    expect(res.ok).toBe(true);
    if (res.ok) {
      const ft = res.state.settings.flowtime;
      expect(ft.bounds).toEqual([25, 50, 70, 90]); // 정렬됨
      expect(ft.rests).toHaveLength(ft.bounds.length + 1); // 길이 정합
      expect(ft.rests.every((r) => Number.isInteger(r) && r >= 1)).toBe(true); // 양의 정수
    }
  });

  it('v4 세이브(Flowtime 없음) → v5로 마이그레이션, flowtime 기본값 주입', () => {
    const { flowtime, ...v4settings } = state.settings;
    void flowtime;
    const v4 = { ...state, schemaVersion: 4, settings: v4settings };
    const res = readSave({ format: SAVE_FORMAT, savedAt: T0, state: v4 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.schemaVersion).toBe(SCHEMA_VERSION);
      expect(res.state.settings.flowtime.bounds).toEqual([25, 50, 90]);
      expect(res.state.settings.notify.enabled).toBe(true); // v4 필드 보존
    }
  });
});
