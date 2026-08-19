// 이 프로젝트에서 유일하게 유저 데이터를 파괴할 수 있는 계층이라, 실제 IndexedDB
// 동작(트랜잭션·키 분리)을 가짜 구현으로 돌려 검증한다. vitest 환경이 'node'라
// 전역 indexedDB가 없으므로 이 임포트가 먼저 와야 한다.
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import type { SaveEnvelope } from '../saveSchema';

const T0 = new Date(2026, 0, 10, 12, 0, 0).getTime();
const env = (n: number): SaveEnvelope =>
  ({ format: 'dol-save', savedAt: T0 + n, state: { mark: n } }) as never;

/** DB도 모듈 캐시(dbPromise)도 매번 새로 — 케이스 간 오염 방지 */
async function freshDb() {
  globalThis.indexedDB = new IDBFactory();
  vi.resetModules();
  return import('../db');
}

describe('db — 세이브 슬롯', () => {

  it('첫 저장은 current 만 쓴다 — 되돌릴 직전 값이 아직 없다', async () => {
    const { saveRaw, loadRaw, loadPrevRaw } = await freshDb();

    await saveRaw(env(1));

    expect(await loadRaw()).toMatchObject({ savedAt: T0 + 1 });
    expect(await loadPrevRaw()).toBeUndefined();
  });

  it('두 번째 저장부터 직전 값이 prev 로 밀려난다', async () => {
    const { saveRaw, loadRaw, loadPrevRaw } = await freshDb();

    await saveRaw(env(1));
    await saveRaw(env(2));

    expect(await loadRaw()).toMatchObject({ savedAt: T0 + 2 });
    expect(await loadPrevRaw()).toMatchObject({ savedAt: T0 + 1 });
  });

  it('한 세대만 남는다 — prev 는 항상 바로 직전', async () => {
    const { saveRaw, loadRaw, loadPrevRaw } = await freshDb();

    await saveRaw(env(1));
    await saveRaw(env(2));
    await saveRaw(env(3));

    expect(await loadRaw()).toMatchObject({ savedAt: T0 + 3 });
    expect(await loadPrevRaw()).toMatchObject({ savedAt: T0 + 2 });
  });

  it('덮어쓰기 사고가 나도 직전 세이브로 되돌릴 수 있다', async () => {
    const { saveRaw, loadRaw, loadPrevRaw } = await freshDb();

    await saveRaw(env(42)); // 유저가 오래 키운 판
    await saveRaw(env(0)); // 사고: 초기 상태가 덮어썼다

    expect(await loadRaw()).toMatchObject({ savedAt: T0 }); // current 는 망가졌지만
    expect(await loadPrevRaw()).toMatchObject({ savedAt: T0 + 42 }); // 원본이 남아 있다
  });

  it('current 삭제는 prev 를 건드리지 않는다 — 새 시작 뒤에도 복구선이 남는다', async () => {
    const { saveRaw, clearRaw, loadRaw, loadPrevRaw } = await freshDb();

    await saveRaw(env(1));
    await saveRaw(env(2));
    await clearRaw();

    expect(await loadRaw()).toBeUndefined();
    expect(await loadPrevRaw()).toMatchObject({ savedAt: T0 + 1 });
  });

  it('해석 불가 원본 백업은 current·prev 어느 쪽도 덮지 않는다', async () => {
    const { saveRaw, backupRaw, loadRaw, loadPrevRaw } = await freshDb();

    await saveRaw(env(1));
    await saveRaw(env(2));
    await backupRaw({ 망가진: '원본' });

    expect(await loadRaw()).toMatchObject({ savedAt: T0 + 2 });
    expect(await loadPrevRaw()).toMatchObject({ savedAt: T0 + 1 });
  });
});
