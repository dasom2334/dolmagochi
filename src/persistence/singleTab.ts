/**
 * 단일 활성 탭 보장 (Web Locks). 두 창이 같은 IndexedDB 세이브를 서로 덮는 것을 막는다.
 * - 활성 탭: 배타 락을 탭 수명 동안 보유 → onActive(). (락은 페이지 언로드 시 자동 해제)
 * - 둘째 탭: 락이 이미 점유 중 → onOccupied()(읽기전용). 앞 탭이 닫혀 락이 풀리면 onPromoted().
 * Web Locks 미지원 브라우저는 항상 active로 폴백(최선 노력, 기존 동작 유지).
 * onActive/onOccupied는 정확히 한 번, onPromoted는 그 뒤 승격 시 호출된다.
 */
const LOCK = 'dolmagochi-active-tab';

interface Callbacks {
  onActive: () => void;
  onOccupied: () => void;
  onPromoted: () => void;
}

const hold = () => new Promise<void>(() => {}); // 탭이 닫힐 때까지 락 보유

export function claimSingleTab(cb: Callbacks): void {
  const locks = (
    typeof navigator !== 'undefined'
      ? (navigator as Navigator & { locks?: LockManager }).locks
      : undefined
  );
  if (!locks) {
    cb.onActive();
    return;
  }

  let settled = false;
  const active = () => {
    if (!settled) {
      settled = true;
      cb.onActive();
    }
  };
  const occupied = () => {
    if (!settled) {
      settled = true;
      cb.onOccupied();
    }
  };

  try {
    void locks
      .request(LOCK, { ifAvailable: true }, (lock) => {
        if (lock) {
          active();
          return hold();
        }
        // 이미 다른 탭이 활성 — 읽기전용. 락이 풀리길 기다렸다가 승격.
        occupied();
        void locks
          .request(LOCK, () => {
            cb.onPromoted();
            return hold();
          })
          .catch(() => {});
        return; // ifAvailable 시도는 즉시 해제
      })
      .catch(() => active());
  } catch {
    active();
  }
}
