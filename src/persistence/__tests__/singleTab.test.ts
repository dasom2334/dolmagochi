import { describe, expect, it, vi } from 'vitest';
import { claimSingleTab } from '../singleTab';

describe('claimSingleTab — Web Locks 미지원 폴백', () => {
  it('navigator.locks가 없으면 항상 active로 처리(기존 동작 유지)', () => {
    // vitest node 환경엔 navigator.locks가 없다 → onActive 폴백
    const onActive = vi.fn();
    const onOccupied = vi.fn();
    const onPromoted = vi.fn();
    claimSingleTab({ onActive, onOccupied, onPromoted });
    expect(onActive).toHaveBeenCalledTimes(1);
    expect(onOccupied).not.toHaveBeenCalled();
    expect(onPromoted).not.toHaveBeenCalled();
  });
});
