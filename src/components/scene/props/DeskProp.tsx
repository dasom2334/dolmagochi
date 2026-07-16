/** 책상 — 배치 소품 (돌의 작업 자리) */
export function DeskProp() {
  return (
    <div
      style={{
        position: 'absolute',
        left: '55%',
        bottom: '26%',
        width: 6,
        height: 6,
        background: '#6a4a34',
        boxShadow:
          '12px 0 0 #6a4a34,' +
          '0 -6px 0 #9a7a54,6px -6px 0 #9a7a54,12px -6px 0 #9a7a54',
      }}
    />
  );
}
