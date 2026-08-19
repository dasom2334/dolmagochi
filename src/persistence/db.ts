import { openDB, type IDBPDatabase } from 'idb';
import type { SaveEnvelope } from './saveSchema';

const DB_NAME = 'dolmagochi';
const DB_VERSION = 1;
const STORE = 'save';
const KEY = 'current';
/** 해석에 실패한 세이브 원본을 옮겨 두는 자리 — 덮어쓰기 전 마지막 사본. */
const BACKUP_KEY = 'corrupt-backup';
/** 직전 세이브 — 사고가 나도 한 세대는 되돌릴 수 있게 남긴다. */
const PREV_KEY = 'prev';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    }).catch((e) => {
      // 실패를 영구 캐시하지 않는다 — 캐시된 rejection이 남으면 이후 모든 저장이
      // 세션 내내 조용히 실패한다. 다음 호출에서 다시 열어 본다.
      dbPromise = null;
      throw e;
    });
  }
  return dbPromise;
}

/** 저장된 세이브 봉투(미검증 raw)를 읽는다. 없으면 undefined. */
export async function loadRaw(): Promise<unknown> {
  return (await getDb()).get(STORE, KEY);
}

/**
 * 세이브 1건 쓰기 — 직전 값을 prev 로 밀어내고 current 를 갱신한다.
 * 슬롯이 하나뿐이면 어떤 덮어쓰기 사고도 복구 불가가 된다. 한 트랜잭션에서
 * 옮기므로 중간에 끊겨도 두 키가 어긋나지 않는다.
 * 첫 저장(prev 없음)은 그냥 current 만 쓴다.
 */
export async function saveRaw(env: SaveEnvelope): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(STORE, 'readwrite');
  const store = tx.objectStore(STORE);
  const cur = await store.get(KEY);
  if (cur !== undefined) await store.put(cur, PREV_KEY);
  await store.put(env, KEY);
  await tx.done;
}

/** 직전 세이브(복구용). 없으면 undefined. */
export async function loadPrevRaw(): Promise<unknown> {
  return (await getDb()).get(STORE, PREV_KEY);
}

export async function clearRaw(): Promise<void> {
  await (await getDb()).delete(STORE, KEY);
}

/**
 * 읽었으나 해석할 수 없었던 원본을 별도 키에 보존한다.
 * 백업 자체가 실패해도 부트를 막지 않는다 — 여기서 던지면 복구 여지까지 사라진다.
 */
export async function backupRaw(raw: unknown): Promise<void> {
  try {
    await (await getDb()).put(STORE, raw, BACKUP_KEY);
  } catch {
    /* 무시 */
  }
}

/** 앱 시작 시 저장소 영속화 요청 (지원/실패 무시). */
export async function requestPersist(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* 무시 */
  }
  return false;
}
