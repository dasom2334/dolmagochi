/**
 * 인앱 토스트 최소 인프라 — 포그라운드 알림 채널.
 * (백그라운드는 OS 알림(notifications.ts), 포그라운드는 이 토스트로 뜬다)
 * 순수 pub/sub. 발행은 어디서든 pushToast(text), 표시는 <ToastHost/>가 구독.
 */
type ToastListener = (text: string) => void;

const listeners = new Set<ToastListener>();

export function pushToast(text: string): void {
  listeners.forEach((l) => l(text));
}

export function subscribeToast(l: ToastListener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
