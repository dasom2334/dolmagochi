/**
 * 휴식 종료 감시 워커.
 * 메인 스레드 인터벌은 백그라운드 탭에서 심하게 스로틀되므로(≈1/분),
 * 휴식 종료 시각(endsAt)을 워커에서 주기 체크해 만료 시 1회 통지한다.
 * 워커도 스로틀될 수 있지만, endsAt은 절대 시각이라 다음 체크에서 정확히 만료를 잡는다.
 */

type InMsg = { type: 'watch'; endsAt: number } | { type: 'clear' };
type OutMsg = { type: 'ended'; endsAt: number };

let endsAt = 0;
let fired = false;
let timer: ReturnType<typeof setInterval> | null = null;

function stop(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

function tick(): void {
  if (endsAt > 0 && !fired && Date.now() >= endsAt) {
    fired = true;
    const msg: OutMsg = { type: 'ended', endsAt };
    (self as unknown as Worker).postMessage(msg);
    stop();
  }
}

self.onmessage = (e: MessageEvent<InMsg>) => {
  const data = e.data;
  if (data.type === 'watch') {
    endsAt = data.endsAt;
    fired = false;
    stop();
    if (Date.now() >= endsAt) {
      tick();
    } else {
      timer = setInterval(tick, 1000);
    }
  } else if (data.type === 'clear') {
    endsAt = 0;
    fired = false;
    stop();
  }
};
