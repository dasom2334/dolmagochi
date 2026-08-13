/// <reference types="vite-plugin-pwa/client" />
/**
 * 서비스워커 등록 + 갱신 반영 정책.
 *
 * 서비스워커는 오프라인을 위해 자산을 캐시-우선으로 내주므로, 새 배포가 나와도
 * 그냥 새로고침 한 번으론 옛 화면이 뜬다(새 SW는 백그라운드에서만 준비됨).
 * 그래서 갱신 시점을 여기서 직접 고른다:
 *
 *  - 새로 연 직후(초기 로드 중) 발견된 갱신 → 조용히 자동 새로고침 ("B")
 *  - 이미 열어둔 채 나중에 뜬 갱신 → 화면 안 끊고 배너로 알림 ("A")
 *
 * 집중 세션 중 자동 새로고침도 무방 — 상태는 IndexedDB에 저장/복원되므로
 * 잃는 것이 없다. 그래서 phase(집중 여부) 특수 처리는 두지 않는다.
 */
import { registerSW } from 'virtual:pwa-register';
import { flushSave } from './persistence/persist';

/** 이 시간(ms) 안에 발견된 갱신 = "새로 연 것"으로 보고 자동 반영 */
const FRESH_OPEN_MS = 10_000;

/**
 * 새 배포 주기 확인 간격(ms).
 * 탭 복귀(visibilitychange)만으로는 부족하다 — PWA를 켜둔 채 한 번도 전환하지
 * 않으면 확인 자체가 안 돌아 배너가 영영 안 뜬다(브라우저 자체 검사는 최대 24시간).
 * 집중 세션(25~90분) 중에도 한 번은 걸리도록 15분으로 둔다.
 */
const UPDATE_POLL_MS = 15 * 60_000;

/** 새 버전 대기를 UI에 알릴 때 넘기는 콜백. 인자는 "지금 적용"(새로고침 포함) 함수. */
type UpdateListener = (applyUpdate: () => void) => void;

let listener: UpdateListener | null = null;
let pendingApply: (() => void) | null = null;

/**
 * 자동 새로고침을 이 탭 세션에서 이미 한 번 했는지 표시.
 * 배포 전파 중 엣지마다 sw.js가 엇갈리면(매 새로고침 후 performance.now() 리셋)
 * 무한 새로고침 루프가 날 수 있어, 자동 반영은 세션당 1회로 제한한다.
 * sessionStorage 접근이 막힌 환경(프라이빗 모드 등)에서는 가드를 생략한다.
 */
const AUTO_RELOAD_KEY = 'pwa:auto-reloaded';
function alreadyAutoReloaded(): boolean {
  try {
    return sessionStorage.getItem(AUTO_RELOAD_KEY) === '1';
  } catch {
    return false;
  }
}
function markAutoReloaded(): void {
  try {
    sessionStorage.setItem(AUTO_RELOAD_KEY, '1');
  } catch {
    /* 무시 */
  }
}

/**
 * UpdatePrompt 배너가 구독한다. 구독 전에 이미 갱신이 대기 중이었다면 즉시 흘려준다
 * (등록이 컴포넌트 마운트보다 먼저 끝날 수 있으므로).
 */
export function onUpdateAvailable(cb: UpdateListener): void {
  listener = cb;
  if (pendingApply) {
    cb(pendingApply);
    pendingApply = null;
  }
}

export function initPWA(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // 갱신 적용은 곧 새로고침이다 — 마지막 오토세이브 틱(≤1초) 이후의 변경이
      // 날아가지 않게 먼저 flush한다. 저장이 실패해도 갱신은 그대로 진행한다.
      // (특히 자동 반영 경로: 앱을 열자마자 집중을 시작하면 그 시작이 유실됐다)
      const applyUpdate = () => {
        void flushSave().finally(() => void updateSW(true));
      };
      if (performance.now() < FRESH_OPEN_MS && !alreadyAutoReloaded()) {
        // 방금 연 화면 → 조용히 최신으로 교체 (세션당 1회로 제한)
        markAutoReloaded();
        applyUpdate();
      } else if (listener) {
        listener(applyUpdate);
      } else {
        // 배너가 아직 마운트 안 됨 → 구독되는 순간 흘려줄 수 있게 보관
        pendingApply = applyUpdate;
      }
    },
    onRegisteredSW(_swUrl, reg) {
      if (!reg) return;
      // 오프라인 등 실패는 무시 — 다음 확인 때 다시 시도한다
      const check = () => {
        void reg.update().catch(() => {
          /* 무시 */
        });
      };
      // 탭을 다시 볼 때마다 새 배포 확인 (오래 열어둔 경우 배너 경로로 이어짐)
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      // 켜둔 채 한 번도 전환하지 않아도 잡히도록 주기 확인.
      // 숨김 중에는 브라우저가 인터벌을 늦추지만, 복귀 시 위 리스너가 즉시 확인한다.
      setInterval(check, UPDATE_POLL_MS);
    },
  });
}
