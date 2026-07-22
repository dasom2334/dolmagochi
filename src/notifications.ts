/**
 * 휴식 종료 브라우저 알림 (Notification API).
 * 권한 요청은 앱 첫 진입 1회. 거부/미지원 시 알림만 빠진 채 정상 동작.
 * 알림 문구는 화자 목소리로 데이터(카탈로그)에서 받는다.
 */

export function notifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/** 첫 진입 시 1회 권한 요청. 이미 결정됐으면 아무 것도 하지 않는다. */
export async function requestNotifyPermission(): Promise<void> {
  if (!notifySupported()) return;
  try {
    if (Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  } catch {
    /* 무시 */
  }
}

/** 권한이 있으면 알림을 띄운다. 없으면 조용히 무시. */
export function notify(body: string): void {
  if (!notifySupported() || Notification.permission !== 'granted') return;
  const base = import.meta.env.BASE_URL; // 배포 base('/' 등)에 맞춘 공개 에셋 경로
  const options: NotificationOptions = {
    icon: `${base}icons/icon-192.png`, // 알림 큰 아이콘 (돌)
    badge: `${base}icons/icon-192.png`, // 모바일 상태바 단색 배지
    tag: 'dol-rest-end', // 같은 알림은 덮어쓴다 (중복 방지)
  };
  // 설치형·모바일 PWA(Android·iOS)에선 new Notification()이 금지(Illegal constructor)라
  // 조용히 실패했다 — 활성 SW가 있으면 registration.showNotification으로 띄운다.
  // 클릭 포커스는 SW의 notificationclick 핸들러(public/sw-push.js)가 담당한다.
  if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
    void navigator.serviceWorker.ready
      .then((reg) => reg.showNotification(body, options))
      .catch(() => pageNotify(body, options));
    return;
  }
  pageNotify(body, options);
}

/** SW가 없을 때(구형·비설치 데스크톱) 폴백 — 페이지 생성 알림, 클릭 시 창 포커스 */
function pageNotify(body: string, options: NotificationOptions): void {
  try {
    const n = new Notification(body, options);
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* 무시 — 모바일/설치형은 위 SW 경로가 담당 */
  }
}
