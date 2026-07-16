/**
 * 이번 세션에 소모한 소모품 — 랜덤 종류별로 다른 그림 (B7).
 * 집중 씬에서 돌 근처에 표시된다. 종류(variant)가 색을 정한다.
 * box-shadow 도트 (추후 PNG 교체).
 */
const SUPPLY_COLORS: Record<string, { body: string; accent: string }> = {
  // 잠자리 음료 — 머그잔 색
  'nightdrink.milk': { body: '#f2f0e8', accent: '#d8d2c8' },
  'nightdrink.cocoa': { body: '#8a5a3a', accent: '#6a4a2e' },
  'nightdrink.barley': { body: '#c8a45a', accent: '#a8844a' },
  // 따뜻한 차 — 찻잔 색
  'tea.green': { body: '#7fa066', accent: '#5a7a4a' },
  'tea.black': { body: '#a05a3a', accent: '#7a4a2e' },
  'tea.coffee': { body: '#5a3a2a', accent: '#3a2a1e' },
  // 도시락 — 내용물
  'lunchbox.riceball': { body: '#f2f0e8', accent: '#2a2a3a' },
  'lunchbox.sandwich': { body: '#d8b878', accent: '#a05a3a' },
  'lunchbox.fruit': { body: '#d85a4a', accent: '#7fa066' },
  // 향초 — 몸통 색 + 불꽃
  'candle.lavender': { body: '#a98fd8', accent: '#ffd866' },
  'candle.woody': { body: '#8a6a4a', accent: '#ffd866' },
  'candle.citrus': { body: '#e8b84a', accent: '#ffd866' },
  // 세척도구
  'cleaner.soap': { body: '#a8c8e8', accent: '#e8f0f8' },
  'cleaner.wax': { body: '#e8d05a', accent: '#c8b04a' },
  'cleaner.polish': { body: '#b4b4c2', accent: '#8f8fa0' },
  // 요리 재료
  'ingredients.veggie': { body: '#7fa066', accent: '#5a7a4a' },
  'ingredients.mushroom': { body: '#b48a6a', accent: '#e8e2d8' },
  'ingredients.grain': { body: '#d8c078', accent: '#b8a058' },
  // API 토큰 — 모델별 칩 색
  'apitoken.claude': { body: '#d97757', accent: '#f2b8a0' },
  'apitoken.gpt': { body: '#4aa88a', accent: '#a0e8d0' },
  'apitoken.gemini': { body: '#6a8ae8', accent: '#b0c8ff' },
};

export function SupplyProp({
  itemId,
  variant,
}: {
  itemId: string;
  variant: string;
}) {
  const c = SUPPLY_COLORS[`${itemId}.${variant}`];
  if (!c) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: '68%',
        bottom: '26%',
        width: 6,
        height: 6,
        background: c.body,
        boxShadow: `6px 0 0 ${c.body}, 0 -6px 0 ${c.accent}`,
      }}
    />
  );
}
