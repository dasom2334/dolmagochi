import type { GameState } from '../game/types';
import { isRockPresent } from '../game/stateMachine';
import { trustStep } from '../game/dialogue';
import { t } from '../store/appStore';
import { SYS } from '../game/text';
import { card } from './ui';

export function NarratorLog({ state }: { state: GameState }) {
  // 관계 진전 관찰 문장 — 수치 비노출, 화자 관찰 4단 (호감도 티어에서 파생).
  // 돌이 없을 때는 신뢰 관찰 대신 부재 전용 문장 (돌 언급 누출 방지)
  const trustIdx = trustStep(state.stats.affection);
  const trustText = isRockPresent(state)
    ? t(SYS.trustLadder[trustIdx])
    : t(SYS.trustAbsent);
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
        * {trustText}
      </p>
    </div>
  );
}
