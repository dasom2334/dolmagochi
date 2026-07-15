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
        border: '3px solid #f2ead8',
        background: '#332b3d',
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
          <span style={{ fontSize: 13, color: isRest ? '#9fce82' : '#e8a55c' }}>
            ◆ {isRest ? t(UI.labels.modeRest) : t(UI.labels.modeFocus)}
          </span>
          <span
            style={{
              fontSize: 26,
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: 2,
              color: '#fdf8ec',
            }}
          >
            {timerText}
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: '#ffd866' }}>
            {tf(UI.labels.care, { points: state.care.points })}
          </span>
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
          <span style={{ fontSize: 11, color: '#8a7f96' }}>
            {t(SYS.hints.flowtime)}
          </span>
          <button
            className="hv"
            style={{
              border: '2px solid #f2ead8',
              background: 'transparent',
              color: '#f2ead8',
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
            border: '2px solid #f2ead8',
            background: '#241e2c',
            padding: 1,
          }}
        >
          <div
            style={{
              height: '100%',
              background: '#9fce82',
              transition: 'width 1s linear',
              width: `${restPct}%`,
            }}
          />
        </div>
      )}
    </div>
  );
}
