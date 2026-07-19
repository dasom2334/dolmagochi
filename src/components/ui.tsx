import type { CSSProperties, ReactNode } from 'react';
import { useState } from 'react';

/** 디자인 원본의 공용 버튼 스타일 (값 그대로) */
export const btnOutline: CSSProperties = {
  border: '2px solid var(--hint-dim)',
  background: 'transparent',
  color: 'var(--text-soft)',
  fontFamily: 'inherit',
  fontSize: 13,
  padding: 8,
  cursor: 'pointer',
};

export const btnSmall: CSSProperties = {
  border: '2px solid var(--hint-dim)',
  background: 'transparent',
  color: 'var(--ink-soft)',
  fontFamily: 'inherit',
  fontSize: 11,
  padding: '5px 8px',
  cursor: 'pointer',
};

export const btnDashed: CSSProperties = {
  minHeight: 48,
  border: '2px dashed var(--text-faint)',
  background: 'transparent',
  color: 'var(--text-mute)',
  fontFamily: 'inherit',
  fontSize: 13,
  cursor: 'pointer',
};

export const card: CSSProperties = {
  border: '3px solid var(--text)',
  background: 'var(--panel)',
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
  // 페이지 내용이 바뀌면 key로 remount → idx가 자연히 0으로 초기화된다
  // (effect 리셋 시 이전 idx로 한 프레임 렌더되는 깜빡임 없음)
  return (
    <PagesInner key={pages.join('\f')} pages={pages} fontSize={fontSize}>
      {children}
    </PagesInner>
  );
}

function PagesInner({
  pages,
  children,
  fontSize,
}: {
  pages: string[];
  children?: ReactNode;
  fontSize: number;
}) {
  const [idx, setIdx] = useState(0);
  const last = idx >= pages.length - 1;
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div
        key={idx}
        className="pre-line"
        style={{
          flex: 1,
          fontSize,
          color: 'var(--text)',
          lineHeight: 1.8,
          animation: 'logFade .4s steps(3) both',
          cursor: last ? 'default' : 'pointer',
        }}
        onClick={() => !last && setIdx(idx + 1)}
      >
        * {pages[idx] ?? ''}
        {!last && (
          <span style={{ color: 'var(--hint)', animation: 'blink 1.2s infinite' }}>
            {' '}
            ▾
          </span>
        )}
      </div>
      {last && children}
    </div>
  );
}

/** ◂ n/m ▸ 페이저 — 상점·소장품·도감 앨범 공용 (경계에서 멈춤) */
export function Pager({
  page,
  pages,
  onPage,
}: {
  page: number;
  pages: number;
  onPage: (p: number) => void;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        marginTop: 8,
      }}
    >
      <button
        className={page === 0 ? undefined : 'hv'}
        disabled={page === 0}
        style={{
          ...btnSmall,
          fontSize: 12,
          padding: '3px 12px',
          color: page === 0 ? 'var(--line)' : 'var(--ink-soft)',
        }}
        onClick={() => onPage(Math.max(0, page - 1))}
      >
        ◂
      </button>
      <span style={{ fontSize: 11, color: 'var(--hint)' }}>
        {page + 1} / {pages}
      </span>
      <button
        className={page >= pages - 1 ? undefined : 'hv'}
        disabled={page >= pages - 1}
        style={{
          ...btnSmall,
          fontSize: 12,
          padding: '3px 12px',
          color: page >= pages - 1 ? 'var(--line)' : 'var(--ink-soft)',
        }}
        onClick={() => onPage(Math.min(pages - 1, page + 1))}
      >
        ▸
      </button>
    </div>
  );
}
