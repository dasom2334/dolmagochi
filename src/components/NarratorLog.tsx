import type { GameState } from '../game/types';
import { t } from '../store/appStore';
import { SYS } from '../game/text';
import { card } from './ui';

export function NarratorLog({ state }: { state: GameState }) {
  // 관계 진전 관찰 문장 — 수치 비노출, 화자 관찰 4단 (디자인 데모: 세션 수 기반)
  const trustIdx = Math.min(SYS.trustLadder.length - 1, state.totals.sessions);
  return (
    <div
      style={{
        ...card,
        padding: '16px 18px',
        minHeight: 92,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        justifyContent: 'center',
      }}
    >
      <p
        key={state.session.narratorLine}
        className="pre-line"
        style={{
          margin: 0,
          fontSize: 14,
          color: '#f2ead8',
          lineHeight: 1.8,
          animation: 'logFade .4s steps(3) both',
        }}
      >
        {state.session.narratorLine ? `* ${state.session.narratorLine}` : ''}
      </p>
      <p style={{ margin: 0, fontSize: 11, color: '#8a7f96' }}>
        * {t(SYS.trustLadder[trustIdx])}
      </p>
    </div>
  );
}
