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
  // 키는 coffee 그대로 — 표시만 허브차로 바꿨다(도감 뱃지 기록을 깨지 않으려고).
  // 색은 내용물에 맞춰 카밀러빛으로. 녹차(초록)·홍차(적갈)와 구분된다.
  'tea.coffee': { body: '#c8b86a', accent: '#9a8a48' },
  // 도시락 — 내용물
  'lunchbox.riceball': { body: '#f2f0e8', accent: '#2a2a3a' },
  'lunchbox.sandwich': { body: '#d8b878', accent: '#a05a3a' },
  'lunchbox.fruit': { body: '#d85a4a', accent: '#7fa066' },
  // 오늘의 책 — 표지 색 + 책배(펼친 면)
  'readbook.tech': { body: '#4a6a8a', accent: '#f2ead8' },
  'readbook.romance': { body: '#c86a8a', accent: '#f2ead8' },
  'readbook.comic': { body: '#e8a54a', accent: '#f2ead8' },
  // 세척도구
  'cleaner.soap': { body: '#a8c8e8', accent: '#e8f0f8' },
  'cleaner.wax': { body: '#e8d05a', accent: '#c8b04a' },
  'cleaner.polish': { body: '#b4b4c2', accent: '#8f8fa0' },
  // 요리 재료
  'ingredients.veggie': { body: '#7fa066', accent: '#5a7a4a' },
  'ingredients.mushroom': { body: '#b48a6a', accent: '#e8e2d8' },
  'ingredients.grain': { body: '#d8c078', accent: '#b8a058' },
  // 잠 깨는 것 — 종류별 색
  'caffeine.energy': { body: '#c8443c', accent: '#f0a89a' }, // 에너지 드링크 캔
  'caffeine.triple': { body: '#4a3428', accent: '#8a6a52' }, // 진한 커피
  'caffeine.iced': { body: '#7a5a44', accent: '#cde8f2' }, // 아이스 — 얼음빛 하이라이트
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
