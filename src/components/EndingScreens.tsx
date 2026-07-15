import type { GameState } from '../game/types';
import { gameData } from '../store/gameStore';
import { dispatch, t } from '../store/appStore';
import { UI } from '../game/text';
import { btnDashed, btnOutline, card, PagesView } from './ui';

function pagesOf(id: string): string[] {
  return gameData.text[id]?.[0] ?? [`[MISSING TEXT: ${id}]`];
}

/** 엔딩 이벤트 — "돌은 당신이 필요 없습니다" (화자의 해석) → 남기/떠나보내기 */
export function EndingScreen() {
  const e = gameData.endings.endingEvent;
  return (
    <div
      style={{
        ...card,
        padding: '22px 18px',
        minHeight: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <PagesView pages={pagesOf(e.textId)}>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 9,
            marginTop: 12,
          }}
        >
          <button
            className="hv"
            style={{ ...btnOutline, minHeight: 44 }}
            onClick={() => dispatch({ type: 'CHOOSE_COHABIT' })}
          >
            {t(e.stayLabelId)}
          </button>
          <button
            className="hv"
            style={{ ...btnOutline, minHeight: 44 }}
            onClick={() => dispatch({ type: 'CHOOSE_FAREWELL' })}
          >
            {t(e.farewellLabelId)}
          </button>
        </div>
      </PagesView>
    </div>
  );
}

/**
 * 에필로그 → 빈자리(apart)의 방으로.
 * 엔딩에서 떠나보내기 = 개인작업 결과물 전달 에필로그.
 * 동거 후 작별 = 누적 시간을 언급하는 작별 문구({hours}).
 */
export function EpilogueScreen({ state }: { state: GameState }) {
  const fromCohabit = state.era === 'cohabit';
  const hours = Math.floor(state.totals.focusSeconds / 3600);
  const id = fromCohabit
    ? gameData.endings.farewellFromCohabitId
    : gameData.endings.farewellEpilogueId;
  const pages = pagesOf(id).map((p) => p.replace(/\{hours\}/g, String(hours)));
  return (
    <div
      style={{
        ...card,
        padding: '22px 18px',
        minHeight: 200,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <PagesView pages={pages}>
        <button
          className="hv"
          style={{ ...btnDashed, marginTop: 12 }}
          onClick={() => dispatch({ type: 'EPILOGUE_DONE' })}
        >
          {t(UI.buttons.epilogueDone)}
        </button>
      </PagesView>
    </div>
  );
}
