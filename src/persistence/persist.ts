import { appStore } from '../store/appStore';
import { clearRaw, loadRaw, requestPersist, saveRaw } from './db';
import { readSave, wrapSave } from './saveSchema';

export type BootResult = 'restored' | 'fresh' | 'invalid';

/**
 * 부트 복원: 저장소 영속화 요청 → 세이브 로드·검증 → 상태 주입 → 달력일 정산(SETTLE).
 * 없거나 손상됐으면 초기 상태 유지.
 */
export async function bootRestore(nowMs: number): Promise<BootResult> {
  await requestPersist();
  let raw: unknown;
  try {
    raw = await loadRaw();
  } catch {
    return 'fresh';
  }
  if (raw === undefined || raw === null) return 'fresh';

  const res = readSave(raw);
  if (!res.ok) return 'invalid';

  appStore.setState({ state: res.state });
  appStore.getState().dispatch({ type: 'SETTLE', nowMs });
  return 'restored';
}

let dirty = false;

/** 현재 상태를 즉시 저장한다. */
export async function flushSave(): Promise<void> {
  dirty = false;
  try {
    await saveRaw(wrapSave(appStore.getState().state, Date.now()));
  } catch {
    /* 무시 */
  }
}

let autosave: { unsub: () => void; iv: ReturnType<typeof setInterval> } | null =
  null;

/**
 * 자동저장 시작: 상태 변경을 표시(dirty)하고 1초마다 flush.
 * (틱마다 IndexedDB에 쓰지 않도록 스로틀)
 * 싱글턴 — 이미 켜져 있으면 중복 구독하지 않는다(StrictMode 이중 마운트 안전).
 * 반드시 bootRestore 이후에 호출 — 초기 상태가 세이브를 덮지 않도록.
 * 반환값으로 해제.
 */
export function startAutosave(intervalMs = 1000): () => void {
  if (!autosave) {
    const unsub = appStore.subscribe(() => {
      dirty = true;
    });
    const iv = setInterval(() => {
      if (dirty) void flushSave();
    }, intervalMs);
    autosave = { unsub, iv };
  }
  return stopAutosave;
}

export function stopAutosave(): void {
  if (!autosave) return;
  autosave.unsub();
  clearInterval(autosave.iv);
  autosave = null;
}

/** 세이브 삭제 (디버그/새 시작용) */
export async function wipeSave(): Promise<void> {
  try {
    await clearRaw();
  } catch {
    /* 무시 */
  }
}
