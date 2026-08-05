// 주방 시안 C — **추출 + 손보정**.
//
// 시안 A(추출)를 바탕으로 두고, 추출이 **못 읽히게 만든 것만** 손작화로 갈아 끼운다.
// 128×72 에서 작은 물건은 "무엇"보다 "어느 것"이 안 읽힌다(SCENE-RULES §7) —
// 걸이도구·수도꼭지처럼 몇 픽셀짜리는 추출하면 색 덩이로 뭉개지고, 바닥은 석재 결이
// 스펙클로 남는다. 반대로 벽·문·곁선반·작업대처럼 **면이 큰 것은 추출이 더 낫다**
// (손으로 그리면 레퍼런스의 질감·비례를 못 따라간다).
//
// 그래서 이 시안은 큰 면 = 추출 / 작은 물건 = 손 이라는 한 가지 기준으로만 나뉜다.
// 바꾼 것을 늘리면 시안 B 와 구분이 사라지므로, 아래 목록에서 함부로 늘리지 말 것.
import { KT_ART } from './geom-art.js';
import { KT_HAND } from './geom-art-hand.js';

// 손으로 다시 그린 것 — 이유를 한 줄씩 남긴다
const TOUCHED = {
  'kt-floor': KT_HAND['kt-floor'],   // 석재 결이 스펙클로 남아 지저분 → 절차 슬래브
  'kt-rack': KT_HAND['kt-rack'],     // 매단 조리도구 3종이 색 덩이로 뭉갬
  'kt-pot': KT_HAND['kt-pot'],       // 실루엣이 톱니지고 뚜껑·주둥이·손잡이가 사라짐
  'kt-sink': KT_HAND['kt-sink'],     // 수도꼭지가 흰 얼룩으로만 남음
};

export const KT_TOUCH = { ...KT_ART, ...TOUCHED };
export const KT_TOUCHED_IDS = Object.keys(TOUCHED);
