import { t } from '../store/appStore';
import { SYS } from '../game/text';
import { card } from './ui';
import { Floor } from './scene/Floor';
import { RockShadow } from './scene/RockSprite';

/**
 * 둘째 탭(읽기전용) 화면 — 돌은 다른 창에 있어 이 창은 조작할 수 없다.
 * 빈 방(돌 그림자)만 두어 "돌이 여기 없음"을 연출. 앞 창을 닫으면 이 탭이 승격돼 새로 로드된다.
 */
export function OccupiedScreen() {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '24px 14px',
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 480,
          maxWidth: '100%',
          aspectRatio: '320/180',
          background: '#262031',
          border: '3px solid #f2ead8',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        <Floor bg="#332b40" line="#453a56" />
        <RockShadow />
      </div>
      <div
        style={{
          ...card,
          width: 480,
          maxWidth: '100%',
          padding: '18px 20px',
          boxSizing: 'border-box',
        }}
      >
        <p
          className="pre-line"
          style={{ margin: 0, fontSize: 14, color: '#f2ead8', lineHeight: 1.8 }}
        >
          * {t(SYS.singleTab.occupied)}
        </p>
        <p
          style={{
            margin: '8px 0 0',
            fontSize: 11,
            color: '#8a7f96',
            lineHeight: 1.7,
          }}
        >
          {t(SYS.singleTab.occupiedHint)}
        </p>
      </div>
    </div>
  );
}
