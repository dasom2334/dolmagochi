/**
 * 휴식 씬 3방 + 페이저 (기획서 개정 v5 §1~2).
 * 방 순서 = rooms.json 순서(주방 → 거실 → 침실). 기본 방 = living.
 * 시간대(아침/노을/밤)는 방 속성이 아니라 전역(resolveTimeOfDay) — 세 방은 늘 같은 시각.
 * 소품의 방은 원칙적으로 boosts에서 파생, 파생 불가(잡화·walk 계열)는
 * shop.json의 room 필드가 명시한다. moss는 돌 부착이라 방 무관(null).
 */
import type { RoomDef, ShopItemData } from '../data/schema';

export type RoomId = string;

export const DEFAULT_ROOM = 'living';

/** 소품이 속한 방 — room 명시 우선, 없으면 boosts 파생, 그 외 null */
export function roomOfItem(
  item: ShopItemData,
  rooms: readonly RoomDef[],
): RoomId | null {
  if (item.room) return item.room;
  if (!item.boosts) return null;
  const byBoost = rooms.find((r) => r.boosts.includes(item.boosts!));
  return byBoost?.id ?? null;
}

/** 페이저 이동 — 경계 순환 (◂ n/m ▸) */
export function stepRoom(
  rooms: readonly RoomDef[],
  current: RoomId,
  dir: 1 | -1,
): RoomId {
  const i = Math.max(
    0,
    rooms.findIndex((r) => r.id === current),
  );
  return rooms[(i + dir + rooms.length) % rooms.length].id;
}

/**
 * 이 방에서 소품을 보여줄까 — 배치됨 + 소속 방 일치.
 * 부재 연출 (v5 §4): 돌이 없으면 신발도 없다 ("신발이 없네 → 나갔구나").
 */
export function propVisibleInRoom(
  item: ShopItemData,
  rooms: readonly RoomDef[],
  currentRoom: RoomId,
  rockPresent: boolean,
): boolean {
  if (item.id === 'shoes' && !rockPresent) return false;
  return roomOfItem(item, rooms) === currentRoom;
}
