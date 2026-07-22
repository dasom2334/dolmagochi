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
  try {
    const base = import.meta.env.BASE_URL; // 배포 base('/' 등)에 맞춘 공개 에셋 경로
    const n = new Notification(body, {
      icon: `${base}icons/icon-192.png`, // 알림 큰 아이콘 (돌)
      badge: `${base}icons/icon-192.png`, // 모바일 상태바 단색 배지
    });
    // 누르면 이 앱 창을 앞으로 가져온다 — 알림은 백그라운드(document.hidden)에서만
    // 뜨므로, 클릭 = 돌마고치로 돌아오기. (페이지 생성 알림이라 window.focus로 충분)
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch {
    /* 무시 */
  }
}
