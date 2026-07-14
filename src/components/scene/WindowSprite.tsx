export function WindowSprite({ glassColor }: { glassColor: string }) {
  const g = glassColor;
  return (
    <div
      style={{
        position: 'absolute',
        left: '12%',
        top: '16%',
        width: 8,
        height: 8,
        background: '#5a4a3a',
        boxShadow: `8px 0 0 #5a4a3a,16px 0 0 #5a4a3a,24px 0 0 #5a4a3a,0 8px 0 #5a4a3a,8px 8px 0 ${g},16px 8px 0 ${g},24px 8px 0 #5a4a3a,0 16px 0 #5a4a3a,8px 16px 0 ${g},16px 16px 0 ${g},24px 16px 0 #5a4a3a,0 24px 0 #5a4a3a,8px 24px 0 #5a4a3a,16px 24px 0 #5a4a3a,24px 24px 0 #5a4a3a`,
      }}
    />
  );
}
