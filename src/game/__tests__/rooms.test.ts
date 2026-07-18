import { describe, expect, it } from 'vitest';
import { DEFAULT_ROOM, propVisibleInRoom, roomOfItem, stepRoom } from '../rooms';
import { gameData } from '../../store/gameStore';

const rooms = gameData.rooms;
const item = (id: string) => gameData.shop.find((i) => i.id === id)!;

describe('휴식 씬 3방 (개정 v5)', () => {
  it('방은 3개, 순서 = 아침 주방 → 노을 거실 → 밤 침실, 기본 living', () => {
    expect(rooms.map((r) => r.id)).toEqual(['kitchen', 'living', 'bedroom']);
    expect(DEFAULT_ROOM).toBe('living');
    // 캡션은 카탈로그에 실재해야 한다 (하드코딩 금지 규칙)
    for (const r of rooms) expect(gameData.text[r.captionId]).toBeDefined();
  });

  it('roomOfItem — boosts 파생과 room 명시', () => {
    expect(roomOfItem(item('pot'), rooms)).toBe('kitchen'); // boosts cook
    expect(roomOfItem(item('broom'), rooms)).toBe('kitchen'); // boosts chore
    expect(roomOfItem(item('book'), rooms)).toBe('living'); // boosts read
    expect(roomOfItem(item('bed'), rooms)).toBe('bedroom'); // boosts lie
    expect(roomOfItem(item('laptop'), rooms)).toBe('bedroom'); // personalWork
    // 파생 불가 → room 명시
    expect(roomOfItem(item('shoes'), rooms)).toBe('kitchen'); // walk 계열 = 신발장
    expect(roomOfItem(item('umbrella'), rooms)).toBe('kitchen');
    expect(roomOfItem(item('plant'), rooms)).toBe('living');
    expect(roomOfItem(item('lamp'), rooms)).toBe('bedroom');
    // moss는 돌 부착 — 방 무관
    expect(roomOfItem(item('moss'), rooms)).toBeNull();
  });

  it('모든 상점 물품은 방이 정해져 있다 (moss 제외) — 안 보이는 구매가 없도록', () => {
    for (const it of gameData.shop) {
      if (it.id === 'moss') continue;
      expect(roomOfItem(it, rooms), it.id).not.toBeNull();
    }
  });

  it('stepRoom — 경계 순환 페이저', () => {
    expect(stepRoom(rooms, 'living', 1)).toBe('bedroom');
    expect(stepRoom(rooms, 'bedroom', 1)).toBe('kitchen'); // 순환
    expect(stepRoom(rooms, 'kitchen', -1)).toBe('bedroom');
  });

  it('부재 연출 — 돌이 없으면 신발도 없다 (신발장은 남는다)', () => {
    expect(propVisibleInRoom(item('shoes'), rooms, 'kitchen', true)).toBe(true);
    expect(propVisibleInRoom(item('shoes'), rooms, 'kitchen', false)).toBe(false);
    // 다른 소품은 부재와 무관
    expect(propVisibleInRoom(item('umbrella'), rooms, 'kitchen', false)).toBe(true);
    // 소속이 다른 방에서는 안 보인다
    expect(propVisibleInRoom(item('bed'), rooms, 'living', true)).toBe(false);
  });
});
