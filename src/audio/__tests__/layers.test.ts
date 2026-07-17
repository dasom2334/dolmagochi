import { describe, expect, it } from 'vitest';
import { ALL_LAYERS, deriveLayers } from '../layers';

describe('deriveLayers — 상황(행동×아이템×실내외) → 레이어 (M9)', () => {
  it('돌의 방(휴식·행동선택): 실내 기본, 벽난로는 보유 시에만', () => {
    expect(deriveLayers({ phase: 'room', actionId: null, ownedItems: [] })).toEqual([
      'roomBase',
    ]);
    expect(
      deriveLayers({ phase: 'room', actionId: null, ownedItems: ['fireplace'] }),
    ).toEqual(['roomBase', 'fireplace']);
  });

  it('산책은 야외 — 실내 기본·벽난로 없이 발소리+새·바람', () => {
    const layers = deriveLayers({
      phase: 'focus',
      actionId: 'walk',
      ownedItems: ['fireplace'],
    });
    expect(layers).toEqual(['footsteps', 'birdsWind']);
  });

  it('책읽기: 책장 + 흔들의자(보유 시) + 실내 기본/벽난로', () => {
    expect(
      deriveLayers({ phase: 'focus', actionId: 'read', ownedItems: [] }),
    ).toEqual(['roomBase', 'pageTurn']);
    expect(
      deriveLayers({
        phase: 'focus',
        actionId: 'read',
        ownedItems: ['rockingchair', 'fireplace'],
      }),
    ).toEqual(['roomBase', 'fireplace', 'pageTurn', 'rockingChair']);
  });

  it('자유행동: 책상 보유 시에만 페이지·필기', () => {
    expect(
      deriveLayers({ phase: 'focus', actionId: 'free', ownedItems: [] }),
    ).toEqual(['roomBase']);
    expect(
      deriveLayers({ phase: 'focus', actionId: 'free', ownedItems: ['desk'] }),
    ).toEqual(['roomBase', 'pageWriting']);
  });

  it('요리·집안일·햇빛쬐기·기본 행동 매핑', () => {
    expect(
      deriveLayers({ phase: 'focus', actionId: 'cook', ownedItems: [] }),
    ).toContain('cooking');
    expect(
      deriveLayers({ phase: 'focus', actionId: 'chore', ownedItems: [] }),
    ).toContain('sweeping');
    // 햇빛쬐기 = 창가: 실내 기본 위에 새·바람이 은은히
    expect(
      deriveLayers({ phase: 'focus', actionId: 'sun', ownedItems: [] }),
    ).toEqual(['roomBase', 'birdsWind']);
    expect(
      deriveLayers({ phase: 'focus', actionId: 'lie', ownedItems: [] }),
    ).toEqual(['roomBase']);
  });

  it('도출되는 모든 레이어는 설정 목록(ALL_LAYERS)에 존재한다', () => {
    const actions = ['lie', 'read', 'sun', 'walk', 'free', 'cook', 'chore', 'nurse'];
    const items = ['fireplace', 'rockingchair', 'desk'];
    for (const actionId of actions) {
      for (const layer of deriveLayers({ phase: 'focus', actionId, ownedItems: items })) {
        expect(ALL_LAYERS).toContain(layer);
      }
    }
  });
});
