import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';

/** 디자인 원본의 공용 버튼 스타일 (값 그대로) */
export const btnOutline: CSSProperties = {
  border: '2px solid #6b6178',
  background: 'transparent',
  color: '#e0d6c4',
  fontFamily: 'inherit',
  fontSize: 13,
  padding: 8,
  cursor: 'pointer',
};

export const btnSmall: CSSProperties = {
  border: '2px solid #6b6178',
  background: 'transparent',
  color: '#a89cb4',
  fontFamily: 'inherit',
  fontSize: 11,
  padding: '5px 8px',
  cursor: 'pointer',
};

export const btnDashed: CSSProperties = {
  minHeight: 48,
  border: '2px dashed #c2b6a0',
  background: 'transparent',
  color: '#d8cdb8',
  fontFamily: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
};

export const card: CSSProperties = {
  border: '3px solid #f2ead8',
  background: '#332b3d',
};

/**
 * 페이지 뷰 — 배열 원소 = 페이지(클릭으로 전환), 페이지 안 \n = 줄바꿈.
 * 마지막 페이지에 도달하면 children(선택지 버튼 등)을 함께 렌더한다.
 */
export function PagesView({
  pages,
  children,
  fontSize = 14,
}: {
  pages: string[];
  children?: ReactNode;
  fontSize?: number;
}) {
  const [idx, setIdx] = useState(0);
  // 페이지 내용이 바뀌면 처음부터
  const key = pages.join('\f');
  useEffect(() => setIdx(0), [key]);
  const last = idx >= pages.length - 1;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div
        key={`${key}:${idx}`}
        className="pre-line"
        style={{
          flex: 1,
          fontSize,
          color: '#f2ead8',
          lineHeight: 1.8,
          animation: 'logFade .4s steps(3) both',
          cursor: last ? 'default' : 'pointer',
        }}
        onClick={() => !last && setIdx(idx + 1)}
      >
        * {pages[idx] ?? ''}
        {!last && (
          <span style={{ color: '#8a7f96', animation: 'blink 1.2s infinite' }}>
            {' '}
            ▾
          </span>
        )}
      </div>
      {last && children}
    </div>
  );
}
