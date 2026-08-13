import { appStore, t } from '../store/appStore';
import { SYS } from '../game/text';
import { pushToast } from '../toast';
import { backupRaw, clearRaw, loadRaw, requestPersist, saveRaw } from './db';
import { readSave, wrapSave } from './saveSchema';

/** 'error' = 읽기·해석이 예외로 끝남 · 'invalid' = 읽었으나 세이브로 인정 못 함 */
export type BootResult = 'restored' | 'fresh' | 'invalid' | 'error';

// 부트 복원(IndexedDB 읽기)이 끝나기 전에는 저장하지 않는다.
// 복원 전 초기 상태를 flush하면 실제 세이브를 덮어버리므로, 모든 저장 경로의 관문.
//
// 실패한 부트에서는 이 관문을 열지 않는다 — 읽기에 실패했든 해석에 실패했든,
// 화면 위의 상태는 "초기 상태"이지 "유저의 상태"가 아니다. 그대로 저장을 열면
// 1초 뒤 오토세이브가 유일한 세이브를 초기 상태로 덮어쓴다.
// (배포 롤백으로 미래 버전 세이브를 만난 경우가 대표적)
let bootComplete = false;

/**
 * 부트 복원: 저장소 영속화 요청 → 세이브 로드·검증 → 상태 주입 → 달력일 정산(SETTLE).
 * 세이브가 없을 때(fresh)와 복원 성공(restored)에서만 이후 저장이 열린다.
 * 실패 경로는 저장을 잠근 채 반환하며, 해석 불가 원본은 백업 키로 옮겨 보존한다.
 */
export async function bootRestore(nowMs: number): Promise<BootResult> {
  await requestPersist();
  let raw: unknown;
  try {
    raw = await loadRaw();
  } catch {
    return 'error';
  }
  if (raw === undefined || raw === null) {
    bootComplete = true;
    return 'fresh';
  }

  try {
    const res = readSave(raw);
    if (!res.ok) {
      await backupRaw(raw);
      return 'invalid';
    }
    appStore.setState({ state: res.state });
    appStore.getState().dispatch({ type: 'SETTLE', nowMs });
    bootComplete = true;
    return 'restored';
  } catch {
    // 마이그레이션이 던진 경우 — 얕은 검증(looksLikeState)을 통과한 뒤에도 가능하다
    await backupRaw(raw);
    return 'error';
  }
}

let dirty = false;

/**
 * 현재 상태를 즉시 저장한다.
 * 복원 완료 전(bootComplete=false)에는 no-op — 초기 상태가 세이브를 덮지 않게 한다.
 * (dirty는 그대로 두어 복원 후 다음 틱에 저장된다)
 */
export async function flushSave(): Promise<void> {
  // dirty를 쓰기 성공 뒤에 내리므로, 진행 중인 저장과 다음 틱이 겹치지 않게 막는다.
  // 겹친 사이의 변경은 dirty가 살아 있어 다음 틱이 가져간다.
  if (!bootComplete || saving) return;
  saving = true;
  try {
    await saveRaw(wrapSave(appStore.getState().state, Date.now()));
    // 성공한 뒤에 내린다 — 쓰기 전에 내리면 실패한 변경이 재시도 대상에서
    // 빠져, 이후 상태 변화가 없는 구간(상점 구매 직후 등)의 결과가 영영
    // 디스크에 남지 않는다.
    dirty = false;
    saveWarned = false;
  } catch {
    // 매초 호출되므로 연속 실패는 한 번만 알린다. 조용히 삼키면 몇 시간을 놀고도
    // 저장이 0건인 것을 유저가 끝까지 모른다.
    if (!saveWarned) {
      saveWarned = true;
      pushToast(t(SYS.toasts.saveWriteFailed));
    }
  } finally {
    saving = false;
  }
}

let saveWarned = false;
let saving = false;

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
