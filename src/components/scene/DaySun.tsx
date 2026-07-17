/** 낮의 해 / 밤의 달 (M12: variant) — 같은 자리, 색만 바뀐다 */
export function DaySun({ variant = 'sun' }: { variant?: 'sun' | 'moon' }) {
  const c1 = variant === 'moon' ? '#cdd6e8' : '#e8d088';
  const c2 = variant === 'moon' ? '#aab6d0' : '#d8c078';
  return (
    <div
      style={{
        position: 'absolute',
        right: '14%',
        top: '14%',
        width: 6,
        height: 6,
        background: c1,
        boxShadow:
          `6px 0 0 ${c1},0 6px 0 ${c1},6px 6px 0 ${c1},-6px 0 0 ${c2},12px 6px 0 ${c2},0 -6px 0 ${c2},6px 12px 0 ${c2}`,
      }}
    />
  );
}
