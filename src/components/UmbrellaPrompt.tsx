import { dispatch, now, t } from '../store/appStore';
import { UI } from '../game/text';
import { btnDashed } from './ui';

/** 우산 선택 (M12) — 비·눈 오는 산책 + 우산 보유 시 START_FOCUS가 세운 대기.
 * 행동선택·휴식 양쪽에서 집중 시작 자리에 대신 렌더링된다 (M16 버그 수정:
 * 휴식에서 산책을 시작하면 대기만 세워지고 물을 곳이 없어 버튼이 죽어 보였다). */
export function UmbrellaPrompt() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'center' }}>
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-soft)' }}>
        * {t(UI.weatherUi.umbrellaAsk)}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="hv"
          style={btnDashed}
          onClick={() =>
            dispatch({ type: 'START_FOCUS', nowMs: now(), umbrella: true })
          }
        >
          {t(UI.weatherUi.umbrellaYes)}
        </button>
        <button
          className="hv"
          style={btnDashed}
          onClick={() =>
            dispatch({ type: 'START_FOCUS', nowMs: now(), umbrella: false })
          }
        >
          {t(UI.weatherUi.umbrellaNo)}
        </button>
      </div>
    </div>
  );
}
