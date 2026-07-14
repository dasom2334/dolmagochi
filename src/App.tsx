import { useEffect, useRef, useState } from 'react';
import { appStore, dispatch, now, t, tf, useGame } from './store/appStore';
import { gameData } from './store/gameStore';
import { isRockPresent } from './game/stateMachine';
import { SYS, UI } from './game/text';
import { bootRestore, flushSave, startAutosave } from './persistence/persist';
import { notify, requestNotifyPermission } from './notifications';
import { TimerCard } from './components/TimerCard';
import { SceneView } from './components/scene/SceneView';
import { NarratorLog } from './components/NarratorLog';
import { ChoicePanel } from './components/ChoicePanel';
import { ActionGrid } from './components/ActionGrid';
import { RestPanel } from './components/RestPanel';
import { EndingScreen, EpilogueScreen } from './components/EndingScreens';
import { SettingsModal } from './components/SettingsModal';
import { DebugBar } from './components/DebugBar';
import { btnDashed } from './components/ui';

export function App() {
  const state = useGame((s) => s.state);
  const [nowMs, setNowMs] = useState(() => now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const lastRef = useRef(now());
  const bootedRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);

  // 부트: 세이브 복원 → 알림 권한(첫 진입 1회) → 자동저장 시작 → 종료 감시 워커
  useEffect(() => {
    if (bootedRef.current) return; // StrictMode 이중 실행 가드
    bootedRef.current = true;
    let stopAutosave = () => {};
    void (async () => {
      await bootRestore(Date.now());
      lastRef.current = Date.now();
      setNowMs(Date.now());
      if (!appStore.getState().state.settings.notifAsked) {
        await requestNotifyPermission();
        dispatch({ type: 'MARK_NOTIF_ASKED' });
      }
      stopAutosave = startAutosave();
      setBooted(true);
    })();

    const worker = new Worker(
      new URL('./workers/restTimer.worker.ts', import.meta.url),
      { type: 'module' },
    );
    worker.onmessage = () => notify(t(SYS.notification.restEnd));
    workerRef.current = worker;

    // 탭 이탈·종료 직전 즉시 저장 (마지막 상태 유실 방지)
    const onHide = () => {
      if (document.hidden) void flushSave();
    };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      stopAutosave();
      document.removeEventListener('visibilitychange', onHide);
      worker.terminate();
      workerRef.current = null;
    };
  }, []);

  // 휴식 종료 감시 — 미래 시각일 때만 워커에 위임(백그라운드 알림). 만료된 채 로드되면 재알림 없음.
  useEffect(() => {
    const w = workerRef.current;
    if (!w) return;
    if (state.phase === 'rest' && state.rest.endsAt > Date.now()) {
      w.postMessage({ type: 'watch', endsAt: state.rest.endsAt });
    } else {
      w.postMessage({ type: 'clear' });
    }
  }, [state.phase, state.rest.endsAt, booted]);

  // 시간 진행: 집중 세션만 카운트업. 휴식은 종료 시각 타임스탬프 기준(M3에서 워커로 강화).
  useEffect(() => {
    const iv = setInterval(() => {
      const n = Date.now();
      const dt = (n - lastRef.current) / 1000;
      lastRef.current = n;
      const st = appStore.getState();
      const phase = st.state.phase;
      // nowMs는 휴식 카운트다운·만료 체크에만 쓰인다 — 그 외 phase에서는
      // 매 틱 리렌더를 유발하지 않도록 rest일 때만 갱신한다.
      if (phase === 'rest') setNowMs(n);
      if (phase === 'focus' && !st.state.session.paused && !document.hidden) {
        st.tick(dt);
      }
    }, 250);
    return () => clearInterval(iv);
  }, []);

  // 탭 이탈 시 일시정지 — 집중 세션에만 적용 (머신이 phase를 가드한다)
  useEffect(() => {
    const onVis = () => {
      lastRef.current = Date.now();
      dispatch({ type: 'SET_PAUSED', paused: document.hidden });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // 타이머 만료는 자동으로 다음 세션으로 넘어가지 않는다 — 시작은 사용자가 정한다.
  // (휴식 종료 알림은 M3, 여기서는 카운트다운만 0에서 멈춘다)

  const action = gameData.actions.find((a) => a.id === state.selectedAction);
  const present = isRockPresent(state);
  const debug = new URLSearchParams(window.location.search).get('debug') === '1';

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        justifyContent: 'center',
        padding: '24px 14px 44px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          width: 480,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <TimerCard
          state={state}
          nowMs={nowMs}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {debug && <DebugBar state={state} nowMs={nowMs} />}
        <SceneView state={state} />

        {state.phase === 'ending' ? (
          <EndingScreen />
        ) : state.phase === 'epilogue' ? (
          <EpilogueScreen />
        ) : (
          <>
            <NarratorLog state={state} />

            {state.phase === 'focus' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <p
                  style={{
                    margin: 0,
                    textAlign: 'center',
                    fontSize: 11,
                    color: '#8a7f96',
                  }}
                >
                  {t(
                    state.era === 'raising' && !present
                      ? SYS.status.focusAbsent
                      : SYS.status.focus,
                  )}
                </p>
                <ChoicePanel state={state} />
              </div>
            )}

            {state.phase === 'rest' && (
              <RestPanel state={state} nowMs={nowMs} />
            )}

            {state.phase === 'actionSelect' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div
                  style={{
                    border: '3px solid #f2ead8',
                    background: '#332b3d',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <ActionGrid state={state} />
                </div>
                <button
                  className="hv"
                  style={btnDashed}
                  onClick={() => dispatch({ type: 'START_FOCUS', nowMs: now() })}
                >
                  {tf(UI.buttons.startFocus, {
                    action: t(action?.nameId ?? ''),
                  })}
                </button>
              </div>
            )}
          </>
        )}

        {settingsOpen && (
          <SettingsModal
            state={state}
            debug={debug}
            onClose={() => setSettingsOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
