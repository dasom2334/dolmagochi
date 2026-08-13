import { beforeEach, describe, expect, it, vi } from 'vitest';
import { wrapSave } from '../saveSchema';
import { createInitialState } from '../../game/stateMachine';

/**
 * 이 레이어의 유일한 불변식: 부트가 실패한 경로에서는 저장이 열리지 않는다.
 * (열리면 1초 뒤 오토세이브가 유일한 세이브를 초기 상태로 덮어쓴다)
 */
const db = vi.hoisted(() => ({
  loadRaw: vi.fn(),
  saveRaw: vi.fn(async () => {}),
  clearRaw: vi.fn(async () => {}),
  backupRaw: vi.fn(async () => {}),
  requestPersist: vi.fn(async () => true),
}));

vi.mock('../db', () => db);

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();

/** bootComplete는 모듈 상태라 케이스마다 새로 읽어 온다 */
async function freshPersist() {
  vi.resetModules();
  return import('../persist');
}

describe('persist — 부트 실패 시 저장 관문', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.saveRaw.mockImplementation(async () => {});
  });

  it('읽기가 예외로 끝나면 error — 저장이 열리지 않는다', async () => {
    db.loadRaw.mockRejectedValueOnce(new Error('IDB 잠김'));
    const { bootRestore, flushSave } = await freshPersist();

    expect(await bootRestore(T0)).toBe('error');
    await flushSave();
    expect(db.saveRaw).not.toHaveBeenCalled();
  });

  it('해석 불가 세이브는 invalid — 원본을 백업하고 저장이 열리지 않는다', async () => {
    db.loadRaw.mockResolvedValueOnce({ 세이브가: '아닌 것' });
    const { bootRestore, flushSave } = await freshPersist();

    expect(await bootRestore(T0)).toBe('invalid');
    expect(db.backupRaw).toHaveBeenCalledOnce();
    await flushSave();
    expect(db.saveRaw).not.toHaveBeenCalled();
  });

  it('마이그레이션이 던져도 error — 원본 백업 + 저장 잠김', async () => {
    // 얕은 검증은 통과하되 마이그레이션에서 터지는 모양 (settings가 null)
    const state = createInitialState(T0, 'read');
    db.loadRaw.mockResolvedValueOnce(
      wrapSave({ ...state, schemaVersion: 7, settings: null } as never, T0),
    );
    const { bootRestore, flushSave } = await freshPersist();

    const res = await bootRestore(T0);
    expect(res === 'error' || res === 'invalid').toBe(true);
    expect(db.backupRaw).toHaveBeenCalledOnce();
    await flushSave();
    expect(db.saveRaw).not.toHaveBeenCalled();
  });

  it('세이브가 없으면 fresh — 새 게임이므로 저장이 열린다', async () => {
    db.loadRaw.mockResolvedValueOnce(undefined);
    const { bootRestore, flushSave } = await freshPersist();

    expect(await bootRestore(T0)).toBe('fresh');
    await flushSave();
    expect(db.saveRaw).toHaveBeenCalledOnce();
  });

  it('정상 복원이면 restored — 저장이 열린다', async () => {
    db.loadRaw.mockResolvedValueOnce(wrapSave(createInitialState(T0, 'read'), T0));
    const { bootRestore, flushSave } = await freshPersist();

    expect(await bootRestore(T0)).toBe('restored');
    expect(db.backupRaw).not.toHaveBeenCalled();
    await flushSave();
    expect(db.saveRaw).toHaveBeenCalledOnce();
  });

  it('저장이 계속 실패해도 알림은 한 번만', async () => {
    db.loadRaw.mockResolvedValueOnce(undefined);
    const { bootRestore, flushSave } = await freshPersist();
    await bootRestore(T0);

    const { subscribeToast } = await import('../../toast');
    const seen: string[] = [];
    subscribeToast((text) => seen.push(text));

    db.saveRaw.mockRejectedValue(new Error('쿼터 초과'));
    await flushSave();
    await flushSave();
    expect(seen).toHaveLength(1);
  });
});
