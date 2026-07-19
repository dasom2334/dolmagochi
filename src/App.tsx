import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { appStore, dispatch, now, t, tf, useGame } from './store/appStore';
import { gameData } from './store/gameStore';
import { isRockPresent } from './game/stateMachine';
import { SYS } from './game/text';
import { bootRestore, flushSave, startAutosave } from './persistence/persist';
import { claimSingleTab } from './persistence/singleTab';
import { OccupiedScreen } from './components/OccupiedScreen';
import { notify, requestNotifyPermission } from './notifications';
import { pushToast } from './toast';
import { dueFocusMarks } from './game/notify';
import { ensureAudioContext, playSound, setSoundEnabled } from './sound';
import { deriveLayers } from './audio/layers';
import { resolveSeason, resolveTimeOfDay } from './game/timeOfDay';
import { stopSoundscape, syncSoundscape } from './audio/engine';
import { ToastHost } from './components/ToastHost';
import { TimerCard } from './components/TimerCard';
import { SceneView } from './components/scene/SceneView';
import { NarratorLog } from './components/NarratorLog';
import { ChoicePanel } from './components/ChoicePanel';
import { ActionGrid } from './components/ActionGrid';
import { RestPanel } from './components/RestPanel';
import { EndingScreen, EpilogueScreen } from './components/EndingScreens';
import { SettingsModal } from './components/SettingsModal';

// 디버그 패널은 DEV 전용 — 프로덕션 빌드에서는 import.meta.env.DEV가 false로 치환되어
// 아래 동적 import가 죽은 코드가 되고, 번들에서 완전히 제외된다.
const DebugPanel = import.meta.env.DEV
  ? lazy(() => import('./debug/DebugPanel'))
  : null;

import { StartFocusControl } from './components/StartFocusControl';

export function App() {
  const state = useGame((s) => s.state);
  const [nowMs, setNowMs] = useState(() => now());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  // 'claiming': 활성 탭 락 판정 중 · 'active': 이 탭이 활성 · 'occupied': 다른 탭이 이미 활성(읽기전용)
  const [tabRole, setTabRole] = useState<'claiming' | 'active' | 'occupied'>(
    'claiming',
  );
  const lastRef = useRef(now());
  const bootedRef = useRef(false);
  const workerRef = useRef<Worker | null>(null);

  // 1회성 부트 — 단, 활성 탭 락을 먼저 잡는다(두 창이 세이브를 서로 덮지 않게).
  // 활성 탭만 세이브 복원·자동저장. 둘째 탭은 읽기전용(복원 안 함 → bootComplete 게이트로 저장도 차단).
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;
    claimSingleTab({
      onActive: () => {
        setTabRole('active');
        void (async () => {
          await bootRestore(Date.now());
          lastRef.current = Date.now();
          setNowMs(Date.now());
          // 복원 시 visibilitychange가 안 뜨므로 현재 실제 가시성으로 paused를 맞춘다
          // (숨김-집중 상태로 저장→포그라운드 로드 시 타이머가 얼어붙지 않도록).
          if (appStore.getState().state.phase === 'focus') {
            const pauseOnHide = appStore.getState().state.settings.pauseOnHide;
            dispatch({
              type: 'SET_PAUSED',
              paused: pauseOnHide && document.hidden,
            });
          }
          if (!appStore.getState().state.settings.notifAsked) {
            await requestNotifyPermission();
            dispatch({ type: 'MARK_NOTIF_ASKED' });
          }
          // 다른 창이 닫혀 이 탭이 승격·재로드된 경우 안내 문구
          if (sessionStorage.getItem('dol-promoted') === '1') {
            sessionStorage.removeItem('dol-promoted');
            pushToast(t(SYS.singleTab.promoted));
          }
          setBooted(true);
        })();
      },
      onOccupied: () => setTabRole('occupied'),
      onPromoted: () => {
        // 앞 창이 닫혀 락 획득 — 최신 세이브로 새로 로드하며 안내를 띄운다
        sessionStorage.setItem('dol-promoted', '1');
        window.location.reload();
      },
    });
  }, []);

  // 워커 · 탭이탈 flush 리스너 · 자동저장 — 매 마운트 대칭 생성/해제.
  // (자동저장은 싱글턴이라 이중 마운트에도 중복 구독되지 않는다)
  useEffect(() => {
    const worker = new Worker(
      new URL('./workers/restTimer.worker.ts', import.meta.url),
      { type: 'module' },
    );
    // 휴식 종료 알림 — 워커가 endsAt 도달 시 통지. '휴식 종료 알림'이 켜진 경우에만,
    // 포그라운드=인앱 종소리(효과음 설정과 무관한 알림 채널이라 force), 백그라운드=OS 알림.
    // (앱은 REST_END를 UI에서 쓰지 않고 rest→START_FOCUS 직행이므로 종료 신호는 워커가 담당)
    worker.onmessage = () => {
      const s = appStore.getState().state;
      const nf = s.settings.notify;
      if (!nf.enabled || !nf.restEnd) return;
      // 돌이 곁에 없으면(잠수·2차 비방문·3차) '기다리고 있다' 대신 중립 문구
      const here =
        s.era === 'apart' ? s.apart.visiting : s.presence.state === 'present';
      if (document.hidden)
        notify(t(here ? SYS.notification.restEnd : SYS.notification.restEndAbsent));
      else playSound('rest', true);
    };
    workerRef.current = worker;

    const onHide = () => {
      if (document.hidden) void flushSave();
    };
    document.addEventListener('visibilitychange', onHide);

    const stop = startAutosave();
    return () => {
      worker.terminate();
      workerRef.current = null;
      document.removeEventListener('visibilitychange', onHide);
      stop();
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
      // 탭이 숨겨졌을 때 멈출지는 설정(pauseOnHide)에 따른다. 끄면 백그라운드에서도 흐른다.
      const blockedByHide = st.state.settings.pauseOnHide && document.hidden;
      if (phase === 'focus' && !st.state.session.paused && !blockedByHide) {
        st.tick(dt);
      }
    }, 250);
    return () => clearInterval(iv);
  }, []);

  // 효과음 on/off를 설정과 동기화 (부트 복원·토글 반영)
  useEffect(() => {
    setSoundEnabled(state.settings.soundOn);
  }, [state.settings.soundOn]);

  // 소리풍경 (M9) — 상황(행동×보유 아이템×실내외) 레이어를 noiseOn·음소거와 동기화.
  // 언마운트 시 정지. 아이템 목록은 키 문자열로 의존성 안정화.
  const ownedKey = Object.keys(state.items).sort().join(',');
  useEffect(() => {
    syncSoundscape({
      on: state.settings.noiseOn,
      layers: deriveLayers({
        phase: state.phase === 'focus' ? 'focus' : 'room',
        actionId: state.phase === 'focus' ? state.selectedAction : null,
        ownedItems: ownedKey ? ownedKey.split(',') : [],
        weather: state.weather,
        umbrella: state.session.umbrella,
        season: resolveSeason(state.settings, Date.now()),
        timeOfDay: resolveTimeOfDay(state.settings, Date.now()),
      }),
      muted: state.settings.noiseMuted,
    });
  }, [
    state.settings.noiseOn,
    state.settings.noiseMuted,
    state.phase,
    state.selectedAction,
    ownedKey,
    state.weather,
    state.session.umbrella,
    state.settings.season,
    state.settings.timeOfDay,
  ]);
  useEffect(() => stopSoundscape, []);

  // 테마 (M10) — data-theme 스탬프 + theme-color 메타 동기화(PWA).
  // auto는 prefers-color-scheme을 따르고 시스템 변경을 구독한다.
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: light)');
    const apply = () => {
      const resolved =
        state.settings.theme === 'auto'
          ? mq?.matches
            ? 'light'
            : 'dark'
          : state.settings.theme;
      document.documentElement.dataset.theme = resolved;
      document
        .querySelector('meta[name="theme-color"]')
        // ⚠️ 이 hex는 global.css의 --bg-deep(다크/라이트)과 수동 동기화 —
        // 라이트 팔레트 검수로 CSS 토큰을 바꾸면 여기도 같이 고칠 것.
        ?.setAttribute('content', resolved === 'light' ? '#e7decb' : '#262031');
    };
    apply();
    if (state.settings.theme === 'auto' && mq) {
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }
  }, [state.settings.theme]);

  // iOS 등 오디오 언락 — 첫 사용자 제스처에서 AudioContext resume (1회성)
  useEffect(() => {
    const unlock = () => ensureAudioContext();
    document.addEventListener('pointerdown', unlock, { once: true });
    return () => document.removeEventListener('pointerdown', unlock);
  }, []);

  // 집중 구간 알림(25/50/90분) — 문턱을 넘는 순간 1회.
  // 포그라운드=인앱 토스트, 백그라운드=OS 알림. 개별 토글이 켜진 문턱만.
  // (집중은 탭이 앞에 있을 때만 시간이 흐르므로 실제로는 대개 토스트로 뜬다)
  const focusMarkRef = useRef(0);
  useEffect(() => {
    if (state.phase !== 'focus') {
      focusMarkRef.current = 0;
      return;
    }
    const cur = state.session.elapsedSec;
    const prev = cur < focusMarkRef.current ? 0 : focusMarkRef.current;
    for (const min of dueFocusMarks(
      prev,
      cur,
      state.settings.notify,
      state.settings.flowtime,
    )) {
      const body = tf(SYS.notification.focusMark, { min });
      if (document.hidden) notify(body);
      else pushToast(body);
    }
    focusMarkRef.current = cur;
  }, [
    state.phase,
    state.session.elapsedSec,
    state.settings.notify,
    state.settings.flowtime,
  ]);

  // 탭 이탈 시 일시정지 — 설정(pauseOnHide)이 켜져 있을 때만. 집중 세션에만 의미(머신이 phase 가드).
  // pauseOnHide가 켜져 있을 때만 델타 기준점(lastRef)을 리셋해 숨김 시간이 집중에 안 더해지게 한다.
  // 꺼져 있으면 리셋하지 않아, 포그라운드 복귀 시 그 사이 경과가 그대로 반영된다.
  useEffect(() => {
    const onVis = () => {
      const pauseOnHide = appStore.getState().state.settings.pauseOnHide;
      if (pauseOnHide) lastRef.current = Date.now();
      dispatch({ type: 'SET_PAUSED', paused: pauseOnHide && document.hidden });
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // 타이머 만료는 자동으로 다음 세션으로 넘어가지 않는다 — 시작은 사용자가 정한다.
  // (휴식 종료 알림은 M3, 여기서는 카운트다운만 0에서 멈춘다)

  // 둘째 탭(읽기전용) — 조작 불가 안내 화면. 락 판정 중에는 잠깐 빈 화면.
  if (tabRole === 'occupied') return <OccupiedScreen />;
  if (tabRole === 'claiming') return null;

  const action = gameData.actions.find((a) => a.id === state.selectedAction);
  const present = isRockPresent(state);
  const debug =
    import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get('debug') === '1';

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
        {debug && DebugPanel && (
          <Suspense fallback={null}>
            <DebugPanel state={state} nowMs={nowMs} />
          </Suspense>
        )}
        <SceneView state={state} />

        {state.phase === 'ending' ? (
          <EndingScreen />
        ) : state.phase === 'epilogue' ? (
          <EpilogueScreen state={state} />
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
                    color: 'var(--hint)',
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
                    border: '3px solid var(--text)',
                    background: 'var(--panel)',
                    padding: '14px 16px',
                    display: 'flex',
                    flexDirection: 'column',
                  }}
                >
                  <ActionGrid state={state} />
                </div>
                <StartFocusControl
                  state={state}
                  actionName={t(action?.nameId ?? '')}
                />
              </div>
            )}
          </>
        )}

        {settingsOpen && (
          <SettingsModal state={state} onClose={() => setSettingsOpen(false)} />
        )}
      </div>
      <ToastHost />
    </div>
  );
}
