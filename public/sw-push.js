/**
 * 서비스워커 추가 스크립트 — 알림 클릭 처리 (vite-plugin-pwa importScripts로 주입).
 *
 * 설치형·모바일 PWA에선 알림을 registration.showNotification으로 띄우는데,
 * 이 SW 알림은 페이지 Notification과 달리 onclick이 안 먹는다 → 여기서 클릭을 받는다.
 * 열려 있는 앱 창이 있으면 포커스, 없으면 새로 연다.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const c of wins) {
        if ('focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
    })(),
  );
});
