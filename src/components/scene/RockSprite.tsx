import type { SproutStage } from '../../game/sprout';
import { Sprout } from './Sprout';

/**
 * 돌 본체 — 애니메이션 없음 (돌은 절대 움직이지 않는다). moss = 이끼 배치 시.
 * sprout = 엔딩 분기 이후 돌 위에 돋은 나무 새싹(빈자리=무성 / 동거=의존도 단계별 시듦). null이면 없음.
 */
export function RockSprite({
  moss,
  sprout,
  wetness = null,
}: {
  moss: boolean;
  sprout: SproutStage | null;
  /** 야외에서 젖음/눈쌓임 (M12) — 다음 세션 시작에 사라진다 */
  wetness?: 'wet' | 'snowy' | null;
}) {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '24%',
        transform: 'translateX(-50%)',
      }}
    >
      {wetness === 'wet' && (
        <div
          style={{
            position: 'absolute',
            left: -4,
            top: -28,
            width: 68,
            height: 38,
            background: 'rgba(88,116,176,0.16)',
            pointerEvents: 'none',
          }}
        />
      )}
      {wetness === 'snowy' && (
        <div
          style={{
            position: 'absolute',
            left: 14,
            top: -30,
            width: 8,
            height: 4,
            background: '#e8eef4',
            boxShadow:
              '10px 0 0 #e8eef4,20px 2px 0 #dfe6ee,28px 0 0 #e8eef4,-6px 8px 0 #dfe6ee,34px 8px 0 #dfe6ee',
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          width: 8,
          height: 8,
          background: '#8f8fa0',
          boxShadow:
            '16px -24px 0 #a5a5b4,24px -24px 0 #a5a5b4,32px -24px 0 #a5a5b4,40px -24px 0 #9a9aaa,8px -16px 0 #a5a5b4,16px -16px 0 #b4b4c2,24px -16px 0 #b4b4c2,32px -16px 0 #a5a5b4,40px -16px 0 #9a9aaa,48px -16px 0 #8f8fa0,0 -8px 0 #9a9aaa,8px -8px 0 #b4b4c2,16px -8px 0 #b4b4c2,24px -8px 0 #a5a5b4,32px -8px 0 #a5a5b4,40px -8px 0 #8f8fa0,48px -8px 0 #8f8fa0,56px -8px 0 #7c7c8c,8px 0 0 #8f8fa0,16px 0 0 #9a9aaa,24px 0 0 #9a9aaa,32px 0 0 #8f8fa0,40px 0 0 #7c7c8c,48px 0 0 #7c7c8c',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: -8,
          top: 8,
          width: 80,
          height: 5,
          background: '#0d0d16',
        }}
      />
      {moss && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            top: -32,
            width: 8,
            height: 8,
            background: '#6f8f5a',
            boxShadow: '8px 0 0 #7fa066,16px 0 0 #6f8f5a,24px 0 0 #5f7f4d',
          }}
        />
      )}
      {sprout !== null && <Sprout stage={sprout} />}
    </div>
  );
}

/** 돌의 빈자리 — 그림자만 남은 자리 */
export function RockShadow() {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '24%',
        transform: 'translateX(-50%)',
        width: 80,
        height: 5,
        background: '#0d0d16',
      }}
    />
  );
}
