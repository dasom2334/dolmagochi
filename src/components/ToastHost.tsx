import { useEffect, useRef, useState } from 'react';
import { subscribeToast } from '../toast';

const TOAST_MS = 4200;

interface ToastItem {
  id: number;
  text: string;
}

/**
 * 포그라운드 인앱 토스트 표시. 화면 하단 중앙에 쌓이고 잠시 뒤 사라진다.
 * 디자인 팔레트(카드 테두리·배경) 유지. 알림 문구는 카탈로그에서 온 것을 그대로 받는다.
 */
export function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const pending = timers.current;
    const unsub = subscribeToast((text) => {
      const id = ++seq.current;
      setItems((prev) => [...prev, { id, text }]);
      const timer = setTimeout(() => {
        setItems((prev) => prev.filter((it) => it.id !== id));
        pending.delete(timer);
      }, TOAST_MS);
      pending.add(timer);
    });
    return () => {
      unsub();
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  if (items.length === 0) return null;
  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 22,
        transform: 'translateX(-50%)',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 20,
        pointerEvents: 'none',
        width: 'max-content',
        maxWidth: '90vw',
      }}
    >
      {items.map((it) => (
        <div
          key={it.id}
          className="pre-line"
          style={{
            border: '3px solid #f2ead8',
            background: '#332b3d',
            color: '#f2ead8',
            fontSize: 12,
            lineHeight: 1.6,
            padding: '10px 14px',
            animation: 'logFade .4s steps(3) both',
          }}
        >
          * {it.text}
        </div>
      ))}
    </div>
  );
}
