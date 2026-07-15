import { appStore } from '../store/appStore';
import { clearRaw, loadRaw, requestPersist, saveRaw } from './db';
import { readSave, wrapSave } from './saveSchema';

export type BootResult = 'restored' | 'fresh' | 'invalid';

// 부트 복원(IndexedDB 읽기)이 끝나기 전에는 저장하지 않는다.
// 복원 전 초기 상태를 flush하면 실제 세이브를 덮어버리므로, 모든 저장 경로의 관문.
let bootComplete = false;

/**
 * 부트 복원: 저장소 영속화 요청 → 세이브 로드·검증 → 상태 주입 → 달력일 정산(SETTLE).
 * 없거나 손상됐으면 초기 상태 유지. 어느 경로로 끝나든 이후 저장이 열린다.
 */
export async function bootRestore(nowMs: number): Promise<BootResult> {
  try {
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
  } finally {
    bootComplete = true;
  }
}

let dirty = false;

/**
 * 현재 상태를 즉시 저장한다.
 * 복원 완료 전(bootComplete=false)에는 no-op — 초기 상태가 세이브를 덮지 않게 한다.
 * (dirty는 그대로 두어 복원 후 다음 틱에 저장된다)
 */
export async function flushSave(): Promise<void> {
  if (!bootComplete) return;
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
 * 부트 완료 전에 호출돼도 안전 — flushSave가 bootComplete 관문으로 막는다.
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
