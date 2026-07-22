import type { GameState } from '../game/types';
import { formatElapsed } from '../game/timer';
import { restProgressPct, restRemainingSec } from '../persistence/restClock';
import { dispatch, now, t, tf } from '../store/appStore';
import { SYS, UI } from '../game/text';
import { btnSmall } from './ui';

export function TimerCard({
  state,
  nowMs,
  onOpenSettings,
}: {
  state: GameState;
  nowMs: number;
  onOpenSettings: () => void;
}) {
  const isFocus = state.phase === 'focus';
  const isRest = state.phase === 'rest';
  const restLeft = restRemainingSec(state.rest.endsAt, nowMs);
  const restPct = restProgressPct(state.rest.endsAt, state.rest.totalSec, nowMs);
  const timerText = isFocus
    ? formatElapsed(state.session.elapsedSec)
    : isRest
      ? formatElapsed(restLeft)
      : formatElapsed(0);

  return (
    <div
      style={{
        border: '3px solid var(--text)',
        background: 'var(--panel)',
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 9,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
          <span style={{ fontSize: 13, color: isRest ? 'var(--ok-hi)' : 'var(--warn)' }}>
            ◆ {isRest ? t(UI.labels.modeRest) : t(UI.labels.modeFocus)}
          </span>
          <span
            style={{
              fontSize: 26,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: 2,
              color: 'var(--text-hi)',
            }}
          >
            {timerText}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--accent)' }}>
            {tf(UI.labels.care, { points: state.care.points })}
          </span>
          {/* 테마 (M22) — 분위기 바가 아니라 여기다. 바는 '방'이고 테마는 '화면'이라,
              나란히 두면 시간대 '밤'과 테마 '다크'를 같은 것으로 읽는다 (B23은 둘을
              일부러 독립시켰다). 3상태뿐이라 순환으로 충분하다. */}
          {/* 라벨은 기호 한 글자 — '라이트'(3자)를 넣으면 375px에서 타이머 줄이
              통째로 무너진다(집중·설정까지 두 줄로 쪼개짐). 현재 값은 툴팁으로. */}
          <button
            className="hv"
            style={{ ...btnSmall, padding: '5px 9px' }}
            title={`${t(UI.theme.setting)} — ${t(UI.theme[state.settings.theme])}`}
            aria-label={`${t(UI.theme.setting)} — ${t(UI.theme[state.settings.theme])}`}
            onClick={() => {
              const order = ['auto', 'light', 'dark'] as const;
              const next =
                order[(order.indexOf(state.settings.theme) + 1) % order.length];
              dispatch({ type: 'SET_THEME', theme: next });
            }}
          >
            {{ auto: '◐', light: '○', dark: '●' }[state.settings.theme]}
          </button>
          <button className="hv" style={btnSmall} onClick={onOpenSettings}>
            {t(UI.buttons.settings)}
          </button>
        </div>
      </div>
      {isFocus && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <span style={{ fontSize: 11, color: 'var(--hint)' }}>
            {t(SYS.hints.flowtime)}
          </span>
          <button
            className="hv"
            style={{
              border: '2px solid var(--text)',
              background: 'transparent',
              color: 'var(--text)',
              fontFamily: 'inherit',
              fontSize: 13,
              padding: '7px 16px',
              cursor: 'pointer',
            }}
            onClick={() => dispatch({ type: 'END_FOCUS', nowMs: now() })}
          >
            {t(UI.buttons.endFocus)}
          </button>
        </div>
      )}
      {isRest && (
        <div
          style={{
            height: 8,
            border: '2px solid var(--text)',
            background: 'var(--panel-3)',
            padding: 1,
          }}
        >
          <div
            style={{
              height: '100%',
              background: 'var(--ok-hi)',
              transition: 'width 1s linear',
              width: `${restPct}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
