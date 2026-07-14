export function Floor({ bg, line }: { bg: string; line: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: '100%',
        height: '26%',
        background: bg,
        borderTop: `3px solid ${line}`,
      }}
    />
  );
}
