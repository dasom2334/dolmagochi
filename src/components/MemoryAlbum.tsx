import { useState } from 'react';
import type { GameState, Remembrance } from '../game/types';
import { gameData } from '../store/gameStore';
import { acquiredBadges } from '../game/badges';
import { t, tf } from '../store/appStore';
import { SYS } from '../game/text';
import { btnSmall } from './ui';

/**
 * 도감 앨범 (M19d) — 기억 하나마다 그림 타일, 고르면 아래에 설명이 뜬다.
 * 타일 그림은 플레이스홀더(id 결정적 도트 문양) — 최종 아트(PNG)는 에셋
 * 트랙에서 교체한다 (image-rendering: pixelated 유지).
 * 미획득분은 존재 자체 비노출 — 빈 칸도, 실루엣도, 개수도 보이지 않는다.
 */
type AlbumEntry =
  | { kind: 'badge'; id: string; at: number; nameId: string; lineId: string }
  | { kind: 'rem'; id: string; at: number; rem: Remembrance };

const PER_PAGE = 8; // 4×2 그리드

/** id → 0~1 안정 해시 (FNV-1a) — 타일 색·문양이 세션 간 동일하게 */
function idHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * 플레이스홀더 타일 그림 — id에서 파생한 색조 + 5×5 대칭 도트 문양.
 * 뱃지는 각진 결(모서리 점), 추억은 둥근 결(십자 점)로 카테고리를 구분한다.
 */
function MemoryTile({
  entry,
  selected,
  onClick,
}: {
  entry: AlbumEntry;
  selected: boolean;
  onClick: () => void;
}) {
  const h = idHash(entry.id);
  const hue = h % 360;
  const bg = `hsl(${hue} 28% 24%)`;
  const dot = `hsl(${hue} 45% 62%)`;
  const dim = `hsl(${hue} 30% 42%)`;
  // 5×5 좌표계(px 6단위)에서 좌우 대칭 문양 — 해시 비트로 절반을 채우고 미러링
  const cells: string[] = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 3; x++) {
      if ((h >> (y * 3 + x)) & 1) {
        const c = (h >> (y * 3 + x + 7)) & 1 ? dot : dim;
        cells.push(`${x * 6}px ${y * 6}px 0 ${c}`);
        if (x < 2) cells.push(`${(4 - x) * 6}px ${y * 6}px 0 ${c}`);
      }
    }
  }
  // 카테고리 결: 뱃지=네 모서리 점, 추억=상하좌우 십자 점
  const mark =
    entry.kind === 'badge'
      ? [`0px 0px 0 ${dot}`, `24px 0px 0 ${dot}`, `0px 24px 0 ${dot}`, `24px 24px 0 ${dot}`]
      : [`12px 0px 0 ${dot}`, `0px 12px 0 ${dot}`, `24px 12px 0 ${dot}`, `12px 24px 0 ${dot}`];
  return (
    <button
      className="hv"
      onClick={onClick}
      style={{
        width: 44,
        height: 44,
        padding: 6,
        border: `2px solid ${selected ? 'var(--text)' : 'var(--line)'}`,
        background: bg,
        cursor: 'pointer',
        boxSizing: 'border-box',
      }}
      aria-label={entry.kind === 'badge' ? t(entry.nameId) : t(entry.rem.summaryId)}
    >
      <div
        style={{
          position: 'relative',
          width: 6,
          height: 6,
          imageRendering: 'pixelated',
          boxShadow: [...cells, ...mark].join(','),
        }}
      />
    </button>
  );
}

export function MemoryAlbum({ state }: { state: GameState }) {
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // 획득 뱃지 + 추억을 시각순으로 — 미획득분은 존재 자체 비노출
  const entries: AlbumEntry[] = [
    ...acquiredBadges(gameData.badges, state).map((b) => ({
      kind: 'badge' as const,
      id: `badge-${b.def.id}`,
      at: b.at,
      nameId: b.def.nameId,
      lineId: b.def.lineId,
    })),
    ...state.remembrances.map((r) => ({
      kind: 'rem' as const,
      id: `rem-${r.id}`,
      at: r.at,
      rem: r,
    })),
  ].sort((a, b) => a.at - b.at);

  if (entries.length === 0) {
    return (
      <p style={{ margin: 0, fontSize: 11, color: 'var(--hint)' }}>
        * {t('ui.shop.badgesEmpty')}
      </p>
    );
  }

  const pages = Math.max(1, Math.ceil(entries.length / PER_PAGE));
  const p = Math.min(page, pages - 1);
  const shown = entries.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);
  const selected = shown.find((e) => e.id === selectedId) ?? null;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 44px)',
          gap: 8,
          justifyContent: 'center',
        }}
      >
        {shown.map((e) => (
          <MemoryTile
            key={e.id}
            entry={e}
            selected={e.id === selectedId}
            onClick={() => setSelectedId(e.id === selectedId ? null : e.id)}
          />
        ))}
      </div>
      <div
        style={{
          flex: 1,
          minHeight: 52,
          fontSize: 12,
          color: 'var(--text-soft)',
          lineHeight: 1.6,
          padding: '2px 4px',
        }}
      >
        {selected === null ? (
          <span style={{ color: 'var(--hint-dim)' }}>
            * {t('ui.album.pickHint')}
          </span>
        ) : selected.kind === 'badge' ? (
          <>
            ◆ {t(selected.nameId)}
            <br />
            <span style={{ color: 'var(--hint)' }}>{t(selected.lineId)}</span>
          </>
        ) : (
          <>
            ◇ {t(selected.rem.summaryId)}
            {selected.rem.pickedLabelId && (
              <span style={{ color: 'var(--hint)' }}>
                {' '}
                {tf(SYS.remembrance.choice, {
                  label: t(selected.rem.pickedLabelId),
                })}
              </span>
            )}
            <br />
            <span style={{ color: 'var(--hint-dim)' }}>
              {state.era === 'apart'
                ? t(selected.rem.revealId)
                : t(SYS.remembrance.locked)}
            </span>
          </>
        )}
      </div>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}
      >
        <button
          className={p === 0 ? undefined : 'hv'}
          disabled={p === 0}
          style={{
            ...btnSmall,
            fontSize: 12,
            padding: '3px 12px',
            color: p === 0 ? 'var(--line)' : 'var(--ink-soft)',
          }}
          onClick={() => setPage(Math.max(0, p - 1))}
        >
          ◂
        </button>
        <span style={{ fontSize: 11, color: 'var(--hint)' }}>
          {p + 1} / {pages}
        </span>
        <button
          className={p >= pages - 1 ? undefined : 'hv'}
          disabled={p >= pages - 1}
          style={{
            ...btnSmall,
            fontSize: 12,
            padding: '3px 12px',
            color: p >= pages - 1 ? 'var(--line)' : 'var(--ink-soft)',
          }}
          onClick={() => setPage(Math.min(pages - 1, p + 1))}
        >
          ▸
        </button>
      </div>
    </div>
  );
}
