/** 벽난로 — 배치 소품, box-shadow 도트 (추후 PNG 교체) */
export function FireplaceProp() {
  return (
    <div
      style={{
        position: 'absolute',
        left: '3%',
        bottom: '26%',
        width: 6,
        height: 6,
        background: '#7a4a38',
        boxShadow:
          '6px 0 0 #ffb84a,12px 0 0 #e88a3a,18px 0 0 #7a4a38,' +
          '0 -6px 0 #7a4a38,6px -6px 0 #241a2a,12px -6px 0 #241a2a,18px -6px 0 #7a4a38,' +
          '0 -12px 0 #7a4a38,6px -12px 0 #241a2a,12px -12px 0 #241a2a,18px -12px 0 #7a4a38,' +
          '0 -18px 0 #8a5a44,6px -18px 0 #8a5a44,12px -18px 0 #8a5a44,18px -18px 0 #8a5a44',
      }}
    />
  );
}
