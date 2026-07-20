/** 담요 — 배치 소품 (개어 둔 채, 자락이 한쪽으로 늘어진다) */
export function BlanketProp() {
  return (
    <div
      style={{
        position: 'absolute',
        left: '16%',
        bottom: '26%',
        width: 6,
        height: 6,
        background: '#a8607a',
        boxShadow:
          // 개어 둔 몸통 (2단)
          '6px 0 0 #a8607a,12px 0 0 #a8607a,' +
          '0 -6px 0 #c4788e,6px -6px 0 #c4788e,12px -6px 0 #c4788e,' +
          // 늘어진 자락
          '12px 6px 0 #8f5068,18px 6px 0 #8f5068',
      }}
    />
  );
}
