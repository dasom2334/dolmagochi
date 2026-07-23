/**
 * 휴식 종료 브라우저 알림 (Notification API).
 * 권한 요청은 앱 첫 진입 1회. 거부/미지원 시 알림만 빠진 채 정상 동작.
 * 알림 문구는 화자 목소리로 데이터(카탈로그)에서 받는다.
 */

export function notifySupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

/**
 * "지금 유저가 앱을 안 보고 있는가" — 알림을 띄울지, 인앱 종소리로 끝낼지의 기준.
 *
 * document.hidden만으론 데스크톱에서 안 맞는다: macOS에서 창을 다른 앱 뒤에 두면
 * 여전히 visible이라, 정작 딴 일 하는 동안 알림이 안 뜨고 종소리만 났다.
 * 포커스가 없으면(다른 앱/창을 보고 있으면) 자리를 비운 것으로 본다.
 */
export function userAway(): boolean {
  if (typeof document === 'undefined') return false;
  return document.hidden || !document.hasFocus();
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

/** 휴식 종료 알림 tag — 예약분·즉시분이 같은 tag라 겹쳐도 하나만 보인다(중복 방지) */
const REST_TAG = 'dol-rest-end';

function restOptions(): NotificationOptions {
  const base = import.meta.env.BASE_URL; // 배포 base('/' 등)에 맞춘 공개 에셋 경로
  return {
    icon: `${base}icons/icon-192.png`, // 알림 큰 아이콘 (돌)
    badge: `${base}icons/icon-192.png`, // 모바일 상태바 단색 배지
    tag: REST_TAG,
  };
}

/** 권한이 있으면 알림을 띄운다. 없으면 조용히 무시. */
export function notify(body: string): void {
  if (!notifySupported() || Notification.permission !== 'granted') return;
  const options = restOptions();
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

/**
 * Notification Triggers(TimestampTrigger) 지원 여부 — Chrome/Android 계열만.
 * 지원되면 앱이 얼거나 닫혀도 OS가 예약 시각에 알림을 대신 띄운다.
 */
export function triggerSupported(): boolean {
  return (
    notifySupported() &&
    'showTrigger' in Notification.prototype &&
    'TimestampTrigger' in window
  );
}

/**
 * 휴식 종료 알림을 종료 절대시각(endsAt)에 예약한다. 지원 안 되거나 권한 미허용이면
 * 아무 것도 안 한다. 같은 tag라 재호출 시 덮어써 중복 예약이 안 생긴다.
 * 예약형은 폴링 0회 — OS가 그 시각에 대신 띄우므로 배터리 영향도 없다.
 */
export function scheduleRestEnd(endsAt: number, body: string): void {
  if (!triggerSupported() || Notification.permission !== 'granted') return;
  if (!('serviceWorker' in navigator)) return;
  const Trigger = (window as unknown as {
    TimestampTrigger: new (t: number) => unknown;
  }).TimestampTrigger;
  // showTrigger는 아직 표준 NotificationOptions 타입에 없어 캐스팅한다.
  const options = { ...restOptions(), showTrigger: new Trigger(endsAt) } as unknown as NotificationOptions;
  void navigator.serviceWorker.ready
    .then((reg) => reg.showNotification(body, options))
    .catch(() => {
      /* 무시 — 실패해도 워커 폴백 경로가 앱 살아 있을 때 담당 */
    });
}

/**
 * 예약된(아직 안 뜬) 휴식 종료 알림을 취소한다 — 휴식 조기종료·집중 재시작·화면
 * 복귀·설정 OFF 등 상황이 바뀔 때 호출해 엉뚱한 시각에 뜨는 걸 막는다.
 */
export function cancelRestEnd(): void {
  if (!('serviceWorker' in navigator)) return;
  void navigator.serviceWorker.ready
    .then((reg) =>
      // includeTriggered: 아직 발화 안 한 예약분까지 포함(트리거 지원 환경 전용 옵션)
      reg.getNotifications({
        tag: REST_TAG,
        includeTriggered: true,
      } as unknown as GetNotificationOptions),
    )
    .then((list) => list.forEach((n) => n.close()))
    .catch(() => {
      /* 무시 */
    });
}
