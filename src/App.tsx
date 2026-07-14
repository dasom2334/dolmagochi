import { useEffect, useRef, useState } from 'react';
import { appStore, dispatch, now, t, tf } from './store/appStore';
import { useGame } from './store/appStore';
import { gameData } from './store/gameStore';
import { SYS, UI } from './game/text';
import { TimerCard } from './components/TimerCard';
import { SceneView } from './components/scene/SceneView';
import { NarratorLog } from './components/NarratorLog';
import { ChoicePanel } from './components/ChoicePanel';
import { ActionGrid } from './components/ActionGrid';
import { RestPanel } from './components/RestPanel';
import { EndingScreen, EpilogueScreen } from './components/EndingScreens';
import { SettingsModal } from './components/SettingsModal';
import { btnDashed } from './components/ui';

export function App() {
  const state = useGame((s) => s.state);
  const [nowMs, setNowMs] = useState(() => now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const lastRef = useRef(now());

  // 시간 진행: 집중 세션만 카운트업. 휴식은 종료 시각 타임스탬프 기준(M3에서 워커로 강화).
  useEffect(() => {
    const iv = setInterval(() => {
      const n = Date.now();
      const dt = (n - lastRef.current) / 1000;
      lastRef.current = n;
      setNowMs(n);
      const st = appStore.getState();
      if (
        st.state.phase === 'focus' &&
        !st.state.session.paused &&
        !document.hidden
      ) {
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

  // 휴식 만료 → REST_END (알림은 M3)
  useEffect(() => {
    if (
      state.phase === 'rest' &&
      state.rest.endsAt > 0 &&
      nowMs >= state.rest.endsAt
    ) {
      dispatch({ type: 'REST_END' });
    }
  }, [state.phase, state.rest.endsAt, nowMs]);

  const action = gameData.actions.find((a) => a.id === state.selectedAction);
  const present = state.presence.state === 'present';

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

            {state.phase === 'rest' && <RestPanel state={state} />}

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
          <SettingsModal state={state} onClose={() => setSettingsOpen(false)} />
        )}
      </div>
    </div>
  );
}
