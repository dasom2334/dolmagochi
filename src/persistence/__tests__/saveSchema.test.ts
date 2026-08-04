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

  it('v8 세이브 → v9: 애착 축 주입 + 가용했던 행동 접근 보존', () => {
    const v8 = {
      ...state,
      schemaVersion: 8,
      unlockedActions: [],
      stats: { ...state.stats, needs: { physiological: 80, safety: 0, belonging: 0, esteem: 0 } },
    };
    const res = readSave({ format: SAVE_FORMAT, savedAt: T0, state: v8 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.schemaVersion).toBe(SCHEMA_VERSION);
      // v8에서 항상 가용했던 read/sun/walk 보존, 레벨(=2)로 cook만 해금(chore는 레벨3 미달)
      expect(res.state.unlockedActions).toEqual(
        expect.arrayContaining(['read', 'sun', 'walk', 'cook']),
      );
      expect(res.state.unlockedActions).not.toContain('chore');
      expect(Number.isFinite(res.state.stats.security)).toBe(true);
      expect(res.state.presence.sick).toBe(false);
    }
  });

  it('애착 축 누락·NaN v9 세이브 → 유한 값으로 보정, security NaN 없음', () => {
    const broken = {
      ...state,
      stats: { ...state.stats, abandonment: NaN, intimacyThreat: undefined as unknown as number },
    };
    const res = readSave({ format: SAVE_FORMAT, savedAt: T0, state: broken });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Number.isFinite(res.state.stats.abandonment)).toBe(true);
      expect(Number.isFinite(res.state.stats.intimacyThreat)).toBe(true);
      expect(Number.isFinite(res.state.stats.security)).toBe(true);
    }
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
      expect(res.state.settings.notify.focusMarks).toEqual([false, false, false]); // v7→v8
      expect(res.state.settings.noiseOn).toBe(true); // 기존 필드 보존
    }
  });

  it('깨진 notify(null·focusMarks 누락·비불리언)가 로드 시 크래시 없이 보정된다', () => {
    // notify가 통째로 null
    const nullNotify = {
      ...state,
      settings: { ...state.settings, notify: null },
    };
    const r1 = readSave({ format: SAVE_FORMAT, savedAt: T0, state: nullNotify });
    expect(r1.ok).toBe(true);
    if (r1.ok) {
      const nf = r1.state.settings.notify;
      expect(typeof nf.enabled).toBe('boolean');
      expect(typeof nf.restEnd).toBe('boolean');
      expect(nf.focusMarks).toHaveLength(r1.state.settings.flowtime.bounds.length);
    }
    // focusMarks 누락 + enabled가 비불리언
    const badNotify = {
      ...state,
      settings: {
        ...state.settings,
        notify: { enabled: 'yes', restEnd: false },
      },
    };
    const r2 = readSave({ format: SAVE_FORMAT, savedAt: T0, state: badNotify });
    expect(r2.ok).toBe(true);
    if (r2.ok) {
      const nf = r2.state.settings.notify;
      expect(nf.enabled).toBe(true); // 비불리언 → 기본 true
      expect(nf.restEnd).toBe(false); // 유효값 보존
      expect(nf.focusMarks.every((v) => typeof v === 'boolean')).toBe(true);
    }
  });

  it('v7 세이브(집중 알림 focus25/50/90) → v8 focusMarks 배열로 이관', () => {
    const v7settings = {
      ...state.settings,
      notify: { enabled: true, restEnd: true, focus25: false, focus50: true, focus90: true },
    };
    const v7 = { ...state, schemaVersion: 7, settings: v7settings };
    const res = readSave({ format: SAVE_FORMAT, savedAt: T0, state: v7 });
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.schemaVersion).toBe(SCHEMA_VERSION);
      // 기본 경계 3개(25/50/90)에 대응해 [false, true, true]
      expect(res.state.settings.notify.focusMarks).toEqual([false, true, true]);
      expect(res.state.settings.notify.enabled).toBe(true); // 다른 알림 필드 보존
      expect(
        (res.state.settings.notify as unknown as { focus25?: boolean }).focus25,
      ).toBeUndefined(); // 구 키 제거
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

describe('작업행동(위임 전용) 세이브 방어 (PR #60)', () => {
  const state = createInitialState(T0, 'read');

  it('집중 중 저장된 작업 세션은 그대로 복원 — 이어하기', () => {
    const midWork = { ...state, phase: 'focus' as const, selectedAction: 'personalWork' };
    const res = readSave(wrapSave(midWork, T0));
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.state.selectedAction).toBe('personalWork');
  });

  it('세션 밖(actionSelect·rest)의 personalWork 선택은 free 로 보정 — 임포트 세이브 방어', () => {
    for (const phase of ['actionSelect', 'rest'] as const) {
      const forged = { ...state, phase, selectedAction: 'personalWork' };
      const res = readSave(wrapSave(forged, T0));
      expect(res.ok).toBe(true);
      if (res.ok) expect(res.state.selectedAction).toBe('free');
    }
  });
});

describe('v28 → v29: 기억 토큰 personalWork → workWitnessed (#61)', () => {
  const state = createInitialState(T0, 'read');

  it('목격 기록이 키만 바뀌어 보존된다 — 뱃지·엔딩 게이트 진행 유지', () => {
    const v28 = {
      ...state,
      schemaVersion: 28,
      memory: { personalWork: { w: 3, count: 2, lastAt: T0 } },
    };
    const res = readSave(wrapSave(v28 as typeof state, T0));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state.memory['workWitnessed']).toEqual({ w: 3, count: 2, lastAt: T0 });
      expect('personalWork' in res.state.memory).toBe(false);
    }
  });

  it('목격 기록이 없던 세이브는 그대로 통과', () => {
    const v28 = { ...state, schemaVersion: 28, memory: { lie: { w: 1, count: 1, lastAt: T0 } } };
    const res = readSave(wrapSave(v28 as typeof state, T0));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect('workWitnessed' in res.state.memory).toBe(false);
      expect('lie' in res.state.memory).toBe(true);
    }
  });
});
