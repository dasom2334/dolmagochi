import { useState } from 'react';
import type { GameState } from '../game/types';
import { dispatch, t } from '../store/appStore';
import { UI } from '../game/text';
import { notifyPermission, requestNotifyPermission } from '../notifications';
import { btnOutline, card } from './ui';

/**
 * 첫 진입 알림 안내 (M24) — 소프트 프롬프트.
 *
 * 네이티브 권한 다이얼로그는 사실상 일회용이다: 'default'일 때만 뜨고, 유저가 반사적으로
 * 닫거나 차단하면 브라우저 정책상 사이트가 다시 물어볼 수 없다. 앱이 켜지자마자 띄우면
 * (무슨 앱인지도 모르는 시점) 그 카드를 최악의 타이밍에 소모한다.
 *
 * 그래서 먼저 이 안내를 보여주고, '켜기'를 누른 사람에게만 네이티브를 띄운다.
 * 버튼 클릭이 곧 사용자 제스처라, 제스처를 요구하는 Safari/iOS 문제도 함께 풀린다.
 * 거절해도 설정에서 언제든 켤 수 있다(그때도 같은 요청 경로).
 */
export function NotifyPrompt({ state }: { state: GameState }) {
  const [closed, setClosed] = useState(false);

  // 이미 물어봤거나(notifAsked), 권한이 이미 결정된 상태면 띄우지 않는다.
  // 지원 안 하는 브라우저도 마찬가지 — 물어봐야 할 게 없다.
  if (closed || state.settings.notifAsked || notifyPermission() !== 'default') {
    return null;
  }

  const finish = () => {
    setClosed(true);
    dispatch({ type: 'MARK_NOTIF_ASKED' });
  };
  // 요청 결과와 무관하게 닫는다 — 허용/거부 모두 다시 물을 일이 없다
  const allow = () => void requestNotifyPermission().finally(finish);

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        background: 'rgba(0,0,0,.45)',
      }}
    >
      <div
        style={{
          ...card,
          maxWidth: 320,
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          animation: 'logFade .4s steps(3) both',
        }}
      >
        <p
          className="pre-line"
          style={{
            margin: 0,
            fontSize: 13,
            lineHeight: 1.8,
            color: 'var(--text)',
          }}
        >
          {t(UI.notify.ask)}
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
          <button
            className="hv"
            style={{ ...btnOutline, minHeight: 44 }}
            onClick={finish}
          >
            {t(UI.notify.askLater)}
          </button>
          <button
            className="hv"
            style={{
              ...btnOutline,
              minHeight: 44,
              borderColor: 'var(--text)',
              color: 'var(--text)',
            }}
            onClick={allow}
          >
            {t(UI.notify.askYes)}
          </button>
        </div>
      </div>
    </div>
  );
}
