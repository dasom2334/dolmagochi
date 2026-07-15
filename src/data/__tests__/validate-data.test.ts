import { describe, expect, it } from 'vitest';
import {
  validateGameData,
  findDuplicateKeys,
} from '../../../scripts/validate-data';
import { gameData } from '../../store/gameStore';
import type { GameData } from '../schema';

/** 실데이터 사본 (검증기가 부수효과 없이 검사하는지 겸사) */
function clone(): GameData {
  return structuredClone(gameData);
}
const hasErr = (errs: string[], needle: string) =>
  errs.some((e) => e.includes(needle));

describe('validateGameData — 실데이터', () => {
  it('현행 데이터는 에러 0으로 통과', () => {
    // todos(미작성 [TODO] 슬롯)는 검증하지 않는다 — [TODO] 플레이스홀더는
    // 절대 규칙상 허용되는 상태이고 CLI도 정보성으로만 출력(exit 0)하므로,
    // 전체 스위트를 "미작성 0" 불변식에 묶지 않는다.
    const r = validateGameData(gameData, gameData.text);
    expect(r.errors).toEqual([]);
  });
});

describe('validateGameData — 불량 픽스처 검출', () => {
  it('끊긴 textId 참조', () => {
    const d = clone();
    d.actions[0].nameId = 'no.such.text';
    expect(hasErr(validateGameData(d, d.text).errors, 'missing textId "no.such.text"')).toBe(true);
  });

  it('친밀도 태그 누락/범위 밖', () => {
    const d = clone();
    (d.actions[0] as { intimacy: number }).intimacy = 0;
    expect(hasErr(validateGameData(d, d.text).errors, 'intimacy는 1~5')).toBe(true);
  });

  it('선택지에 무조건 outcome 없음 (런타임 폴백 불가)', () => {
    const d = clone();
    const opt = d.actions[0].choices[0].options[0];
    opt.outcomes.forEach((o) => (o.when = { flags: ['x'] }));
    expect(hasErr(validateGameData(d, d.text).errors, '무조건(when 없는) outcome이 없음')).toBe(true);
  });

  it('weight ≤ 0', () => {
    const d = clone();
    d.actions[0].choices[0].options[0].outcomes[0].weight = 0;
    expect(hasErr(validateGameData(d, d.text).errors, 'weight는 0보다')).toBe(true);
  });

  it('Condition의 끊긴 물품 참조', () => {
    const d = clone();
    d.dialogues.stage1[0].when = { placedItems: ['ghost-item'] };
    expect(hasErr(validateGameData(d, d.text).errors, '알 수 없는 placedItems "ghost-item"')).toBe(true);
  });

  it('Outcome의 끊긴 잠금해제 참조', () => {
    const d = clone();
    d.actions[0].outcome = { unlockActions: ['ghost-action'] };
    expect(hasErr(validateGameData(d, d.text).errors, '알 수 없는 unlockActions "ghost-action"')).toBe(true);
  });

  it('중복 remembrance.id', () => {
    const d = clone();
    // 서로 다른 두 선택지 결과에 같은 remembrance.id 부여
    const rem = { id: 'dup-rem', summaryId: 'act.read.start', revealId: 'act.read.start' };
    d.actions[0].choices[0].options[0].outcomes[0].remembrance = { ...rem };
    d.actions[0].choices[0].options[1].outcomes[0].remembrance = { ...rem };
    expect(hasErr(validateGameData(d, d.text).errors, '중복 remembrance.id "dup-rem"')).toBe(true);
  });

  it('cohabitStages minDependence 오름차순 아님', () => {
    const d = clone();
    d.dialogues.cohabitStages[0].minDependence = 999;
    expect(hasErr(validateGameData(d, d.text).errors, 'minDependence 오름차순')).toBe(true);
  });

  it('cohabitStages[0].minDependence가 0이 아님', () => {
    const d = clone();
    d.dialogues.cohabitStages[0].minDependence = 10;
    expect(
      hasErr(validateGameData(d, d.text).errors, 'cohabitStages[0].minDependence는 0이어야 함'),
    ).toBe(true);
  });

  it('알 수 없는 reflection token', () => {
    const d = clone();
    d.reflections.push({ token: 'bogus-token', variants: [{ textId: 'refl.default' }] });
    expect(hasErr(validateGameData(d, d.text).errors, 'reflection token "bogus-token"')).toBe(true);
  });

  it('카탈로그 빈 문자열', () => {
    const d = clone();
    d.text['act.read.name'] = [['']];
    expect(hasErr(validateGameData(d, d.text).errors, '빈 문자열')).toBe(true);
  });

  it('카탈로그 값이 배열이 아님', () => {
    const d = clone();
    (d.text as Record<string, unknown>)['act.read.name'] = 'not-array';
    expect(hasErr(validateGameData(d, d.text).errors, '변형 배열이어야 함')).toBe(true);
  });

  it('preEndingTalks 비어 있음', () => {
    const d = clone();
    d.endings.preEndingTalks = [];
    expect(hasErr(validateGameData(d, d.text).errors, 'preEndingTalks가 비어')).toBe(true);
  });

  it('코드(SYS/UI)가 참조하는 textId가 카탈로그에 없으면 error', () => {
    const d = clone();
    // 코드에서만 참조하는 슬롯(구조 파일이 아닌 SYS가 가리킴)을 삭제
    delete (d.text as Record<string, unknown>)['sys.notification.restEnd'];
    expect(
      hasErr(validateGameData(d, d.text).errors, 'missing textId "sys.notification.restEnd" (code SYS/UI)'),
    ).toBe(true);
  });
});

describe('findDuplicateKeys — 카탈로그 중복 키', () => {
  it('중복 키를 잡는다', () => {
    const raw = '{ "a": [["x"]], "b": [["y"]], "a": [["z"]] }';
    expect(findDuplicateKeys(raw)).toEqual(['a']);
  });
  it('중복 없으면 빈 배열', () => {
    expect(findDuplicateKeys('{ "a": 1, "b": 2 }')).toEqual([]);
  });

  it('중첩 객체의 같은 하위 키는 오탐하지 않는다 (최상위만 비교)', () => {
    const raw = '{ "x": { "k": 1 }, "y": { "k": 2 } }';
    expect(findDuplicateKeys(raw)).toEqual([]);
  });

  it('문자열 안의 콜론/중괄호는 키로 오인하지 않는다', () => {
    const raw = '{ "a": [["b: {c}"]], "d": [["e"]] }';
    expect(findDuplicateKeys(raw)).toEqual([]);
  });
});
