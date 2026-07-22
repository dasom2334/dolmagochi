import { useEffect, useState } from 'react';
import { onUpdateAvailable } from '../pwa';
import { t } from '../store/appStore';
import { UI } from '../game/text';

/**
 * 새 버전 대기 배너 (PWA 갱신 "A" 경로).
 * 이미 열어둔 채(집중 포함) 새 배포가 나오면 화면을 끊지 않고 여기서 알린다.
 * 사용자가 원할 때(예: 세션 사이) 눌러서 갱신 — 누르면 새 SW로 교체 후 새로고침.
 */
export function UpdatePrompt() {
  const [apply, setApply] = useState<(() => void) | null>(null);

  useEffect(() => {
    // setState(함수)는 업데이터로 오해되므로 래핑해서 저장
    onUpdateAvailable((applyUpdate) => setApply(() => applyUpdate));
  }, []);

  if (!apply) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        left: '50%',
        top: 14,
        transform: 'translateX(-50%)',
        zIndex: 30,
        width: 'max-content',
        maxWidth: '90vw',
      }}
    >
      <button
        type="button"
        onClick={apply}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          border: '3px solid var(--text)',
          background: 'var(--panel)',
          color: 'var(--text)',
          fontFamily: 'inherit',
          fontSize: 12,
          lineHeight: 1.6,
          padding: '10px 14px',
          cursor: 'pointer',
          animation: 'logFade .4s steps(3) both',
        }}
      >
        <span>{t(UI.update.ready)}</span>
        <span style={{ fontWeight: 700 }}>{t(UI.update.action)}</span>
      </button>
    </div>
  );
}
