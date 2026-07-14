import { openDB, type IDBPDatabase } from 'idb';
import type { SaveEnvelope } from './saveSchema';

const DB_NAME = 'dolmagochi';
const DB_VERSION = 1;
const STORE = 'save';
const KEY = 'current';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
      },
    });
  }
  return dbPromise;
}

/** 저장된 세이브 봉투(미검증 raw)를 읽는다. 없으면 undefined. */
export async function loadRaw(): Promise<unknown> {
  return (await getDb()).get(STORE, KEY);
}

export async function saveRaw(env: SaveEnvelope): Promise<void> {
  await (await getDb()).put(STORE, env, KEY);
}

export async function clearRaw(): Promise<void> {
  await (await getDb()).delete(STORE, KEY);
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
