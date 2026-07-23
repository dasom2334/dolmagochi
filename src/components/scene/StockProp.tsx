/**
 * 배치된 소모품 재고 — 재고가 있는 동안 방 선반(벽면)에 보인다.
 * 종류(랜덤 variant)는 소모 시점에 정해지므로 여기선 아이템별 대표색만.
 * 세션 중 실제 소모품 그림은 SupplyProp(종류별 색)이 이어받는다.
 * box-shadow 도트 (추후 PNG 교체).
 */
const STOCK_PROPS: Record<string, { left: string; body: string; accent: string }> = {
  nightdrink: { left: '40%', body: '#c8a45a', accent: '#e8d0a0' }, // 머그
  tea: { left: '44%', body: '#7fa066', accent: '#a8c491' }, // 차통
  lunchbox: { left: '48%', body: '#d8b878', accent: '#a05a3a' }, // 도시락통
  readbook: { left: '52%', body: '#4a6a8a', accent: '#f2ead8' }, // 쌓아둔 책
  cleaner: { left: '56%', body: '#a8c8e8', accent: '#e8f0f8' }, // 세제
  ingredients: { left: '60%', body: '#b48a6a', accent: '#7fa066' }, // 장바구니
  caffeine: { left: '64%', body: '#a8563c', accent: '#e8d0a0' }, // 잠 깨는 것(캔·컵)
};

export const STOCK_PROP_IDS = Object.keys(STOCK_PROPS);

export function StockProp({ itemId }: { itemId: string }) {
  const c = STOCK_PROPS[itemId];
  if (!c) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: c.left,
        bottom: '42%',
        width: 6,
        height: 6,
        background: c.body,
        boxShadow: `0 -6px 0 ${c.accent}`,
      }}
    />
  );
}
